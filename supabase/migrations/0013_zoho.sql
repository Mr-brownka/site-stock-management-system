-- Zoho Books → Bohari: each store member connects their own Zoho (read-only).
-- Goods received in Zoho become deliveries on the site whose Zoho Project matches.

-- Which Zoho "Project" value belongs to each Bohari site (e.g. 'Reveal').
alter table public.sites add column if not exists zoho_project text;
update public.sites set zoho_project = case name when 'Balozi Suites' then 'Balozi' else name end where zoho_project is null;

-- Where an entry came from, and the Zoho numbers that identify it.
alter table public.documents
  add column if not exists source text not null default 'bohari',
  add column if not exists zoho_receive_id text,
  add column if not exists zoho_grn text,
  add column if not exists zoho_po text,
  add column if not exists checked_at timestamptz;
create unique index if not exists documents_zoho_receive on public.documents (zoho_receive_id) where zoho_receive_id is not null;

-- One Zoho connection per person. The token never leaves the server: no policies for the app.
create table if not exists public.zoho_connections (
  user_id         uuid primary key references auth.users on delete cascade,
  site_id         uuid references public.sites,
  zoho_email      text,
  org_id          text,
  api_domain      text,
  accounts_domain text,
  refresh_token   text not null,
  api_kind        text,
  connected_at    timestamptz not null default now(),
  last_sync_at    timestamptz,
  last_error      text,
  imported        integer not null default 0
);
alter table public.zoho_connections enable row level security;
grant all on public.zoho_connections to service_role;

-- Short-lived "who started this sign-in" markers for the Zoho sign-in round trip.
create table if not exists public.zoho_states (
  state      uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.zoho_states enable row level security;
grant all on public.zoho_states to service_role;

-- Zoho item → Bohari item, matched once by Zoho's item id.
create table if not exists public.zoho_item_map (
  zoho_item_id text primary key,
  item_id      bigint references public.items,
  zoho_name    text,
  zoho_unit    text,
  created_at   timestamptz not null default now()
);
alter table public.zoho_item_map enable row level security;
create policy "read item matches" on public.zoho_item_map for select to authenticated using (true);
create policy "admin matches items" on public.zoho_item_map for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.zoho_item_map to authenticated;
grant all on public.zoho_item_map to service_role;

-- Receives Bohari could not place yet: no matching site, or items not matched.
create table if not exists public.zoho_pending (
  zoho_receive_id text primary key,
  site_id         uuid references public.sites,
  project         text,
  grn             text,
  receive_date    date,
  vendor          text,
  reason          text,
  payload         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
alter table public.zoho_pending enable row level security;
create policy "admin or own site reads pending" on public.zoho_pending for select to authenticated using (public.is_admin() or site_id = public.my_site_id());
create policy "admin clears pending" on public.zoho_pending for delete to authenticated using (public.is_admin());
create policy "admin places pending" on public.zoho_pending for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, update, delete on public.zoho_pending to authenticated;
grant all on public.zoho_pending to service_role;

-- Receives already looked at that belong to another site, so Bohari doesn't ask Zoho for them again.
create table if not exists public.zoho_seen (
  zoho_receive_id text primary key,
  project         text,
  seen_at         timestamptz not null default now()
);
alter table public.zoho_seen enable row level security;
grant all on public.zoho_seen to service_role;

-- What the app may know about my own connection (never the token).
create or replace function public.my_zoho()
returns table (connected boolean, zoho_email text, last_sync_at timestamptz, last_error text, imported integer, api_kind text)
language sql stable security definer set search_path = public as $$
  select true, c.zoho_email, c.last_sync_at, c.last_error, c.imported, c.api_kind
  from public.zoho_connections c where c.user_id = auth.uid()
$$;
create or replace function public.disconnect_zoho() returns void
language sql security definer set search_path = public as $$
  delete from public.zoho_connections where user_id = auth.uid()
$$;
-- For the admin: who is connected on which site (no tokens).
create or replace function public.zoho_overview()
returns table (user_id uuid, full_name text, site_id uuid, zoho_email text, last_sync_at timestamptz, last_error text, imported integer)
language sql stable security definer set search_path = public as $$
  select c.user_id, p.full_name, c.site_id, c.zoho_email, c.last_sync_at, c.last_error, c.imported
  from public.zoho_connections c left join public.profiles p on p.id = c.user_id
  where public.is_admin()
$$;
revoke all on function public.my_zoho(), public.disconnect_zoho(), public.zoho_overview() from public, anon;
grant execute on function public.my_zoho(), public.disconnect_zoho(), public.zoho_overview() to authenticated;

-- The store ticks a Zoho delivery as checked against the paper note.
create or replace function public.check_delivery(doc uuid) returns void
language sql security definer set search_path = public as $$
  update public.documents set checked_at = now() where id = doc and site_id = public.my_site_id()
$$;
revoke all on function public.check_delivery(uuid) from public, anon;
grant execute on function public.check_delivery(uuid) to authenticated;
