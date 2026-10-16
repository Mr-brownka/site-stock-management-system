-- Site Stock Management System · database setup
-- Run once in Supabase → SQL Editor (or `supabase db push`).
--
-- Design: nothing is typed as a balance. Every movement of stock is a row,
-- and balances are the sum of those rows.
--   Balance = opening + delivered + returned + transfers in − issued − transfers out ± corrections
--   Used    = issued − returned

create extension if not exists pgcrypto;

-- ───────────────────────── Sites and people ─────────────────────────

create table public.sites (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  site_id    uuid references public.sites,
  full_name  text,
  role       text not null default 'store' check (role in ('store', 'admin')),
  created_at timestamptz not null default now()
);

-- The site of the person who is signed in.
create or replace function public.my_site_id()
returns uuid language sql stable security definer set search_path = public as $$
  select site_id from public.profiles where id = auth.uid()
$$;

-- Every new login gets a profile on the first site (one site for now).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, site_id, full_name)
  values (
    new.id,
    (select id from public.sites order by created_at limit 1),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── Items ─────────────────────────

-- The whole-project item list. Unit is fixed per item.
create table public.items (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  unit       text not null,
  created_at timestamptz not null default now()
);

-- Items that have been in a site's store. A row is added automatically the
-- first time an item moves at that site. Reorder levels are agreed with the
-- site manager.
create table public.site_items (
  site_id       uuid not null references public.sites on delete cascade,
  item_id       bigint not null references public.items,
  reorder_level numeric check (reorder_level is null or reorder_level >= 0),
  first_seen    date not null default (now() at time zone 'Africa/Nairobi')::date,
  primary key (site_id, item_id)
);

-- ───────────────────────── Documents and movements ─────────────────────────

-- One row per paper document: delivery note, withdrawal card, return,
-- transfer note, opening count or correction.
create table public.documents (
  id                uuid primary key default gen_random_uuid(),
  site_id           uuid not null default public.my_site_id() references public.sites,
  kind              text not null check (kind in ('opening', 'delivery', 'issue', 'return', 'transfer_in', 'transfer_out', 'correction')),
  doc_date          date not null default (now() at time zone 'Africa/Nairobi')::date,
  doc_time          time,
  ref_no            text,  -- delivery note no. / card no. / transfer note no.
  party             text,  -- supplier / issued to / other site
  activity          text,  -- withdrawal cards
  gemba             text,  -- subphase for the whole card
  supervisor        text,  -- SM / supervisor on the card
  authorised_by     text,  -- transfers
  vehicle           text,  -- transfers (optional)
  reason            text,  -- corrections
  corrects_document uuid references public.documents,
  created_by        uuid not null default auth.uid() references auth.users,
  created_at        timestamptz not null default now()
);

create index documents_site_date on public.documents (site_id, doc_date);

-- One row per item line. site_id, kind and move_date are copied from the
-- document by a trigger so they always match.
create table public.movements (
  id          bigint generated always as identity primary key,
  document_id uuid not null references public.documents on delete cascade,
  site_id     uuid not null,
  kind        text not null,
  move_date   date not null,
  item_id     bigint not null references public.items,
  qty         numeric not null,
  subphase    text,
  return_of   bigint references public.movements on delete cascade,  -- returns: the card line it came back from
  delta       numeric generated always as (case when kind in ('issue', 'transfer_out') then -qty else qty end) stored,
  created_at  timestamptz not null default now(),
  check (kind = 'correction' or qty > 0)
);

create index movements_site_date on public.movements (site_id, move_date);
create index movements_site_item on public.movements (site_id, item_id);
create index movements_return_of on public.movements (return_of);

create or replace function public.movement_from_document()
returns trigger language plpgsql as $$
begin
  select d.site_id, d.kind, d.doc_date into new.site_id, new.kind, new.move_date
  from public.documents d where d.id = new.document_id;
  if new.site_id is null then raise exception 'Unknown document'; end if;
  return new;
end $$;

create trigger movements_copy_document
  before insert on public.movements
  for each row execute function public.movement_from_document();

-- First time an item moves at a site, it joins that site's list.
create or replace function public.movement_adds_site_item()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.site_items (site_id, item_id, first_seen)
  values (new.site_id, new.item_id, new.move_date)
  on conflict (site_id, item_id) do nothing;
  return new;
end $$;

create trigger movements_add_site_item
  after insert on public.movements
  for each row execute function public.movement_adds_site_item();

-- ───────────────────────── Day lock ─────────────────────────

create table public.day_submissions (
  site_id      uuid not null default public.my_site_id() references public.sites,
  day          date not null,
  steps        jsonb not null default '{}'::jsonb,  -- what was answered for each step
  submitted_by uuid not null default auth.uid() references auth.users,
  submitted_at timestamptz not null default now(),
  primary key (site_id, day)
);

-- Once a day is submitted, only corrections can be added for it.
create or replace function public.block_locked_day()
returns trigger language plpgsql as $$
begin
  if new.kind <> 'correction' and exists (
    select 1 from public.day_submissions s where s.site_id = new.site_id and s.day = new.doc_date
  ) then
    raise exception 'This day has already been submitted. Use a correction instead.';
  end if;
  return new;
end $$;

create trigger documents_block_locked_day
  before insert on public.documents
  for each row execute function public.block_locked_day();

-- ───────────────────────── Views ─────────────────────────

-- Live balance of every item that has been in the store.
create view public.stock_balances with (security_invoker = true) as
select
  si.site_id,
  si.item_id,
  i.name,
  i.unit,
  si.reorder_level,
  si.first_seen,
  coalesce(sum(m.delta), 0) as balance,
  count(distinct m.document_id) filter (where m.kind = 'delivery') as deliveries
from public.site_items si
join public.items i on i.id = si.item_id
left join public.movements m on m.site_id = si.site_id and m.item_id = si.item_id
group by si.site_id, si.item_id, i.name, i.unit, si.reorder_level, si.first_seen;

-- ───────────────────────── Access rules (RLS) ─────────────────────────
-- Everyone signed in sees only their own site. Entries are never edited;
-- an entry can be removed only by the person who made it, and only before
-- the day is submitted. After that, mistakes are fixed with corrections.

alter table public.sites           enable row level security;
alter table public.profiles        enable row level security;
alter table public.items           enable row level security;
alter table public.site_items      enable row level security;
alter table public.documents       enable row level security;
alter table public.movements       enable row level security;
alter table public.day_submissions enable row level security;

create policy "own site" on public.sites for select to authenticated using (id = public.my_site_id());

create policy "same site" on public.profiles for select to authenticated using (site_id = public.my_site_id());
create policy "own name" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "read items" on public.items for select to authenticated using (true);
create policy "add items" on public.items for insert to authenticated with check (true);

create policy "read site items" on public.site_items for select to authenticated using (site_id = public.my_site_id());
create policy "set reorder level" on public.site_items for update to authenticated using (site_id = public.my_site_id()) with check (site_id = public.my_site_id());

create policy "read documents" on public.documents for select to authenticated using (site_id = public.my_site_id());
create policy "add documents" on public.documents for insert to authenticated
  with check (site_id = public.my_site_id() and created_by = auth.uid());
create policy "remove own unsubmitted" on public.documents for delete to authenticated
  using (
    created_by = auth.uid() and site_id = public.my_site_id()
    and not exists (select 1 from public.day_submissions s where s.site_id = documents.site_id and s.day = documents.doc_date)
  );

create policy "read movements" on public.movements for select to authenticated using (site_id = public.my_site_id());
create policy "add movements" on public.movements for insert to authenticated
  with check (
    site_id = public.my_site_id()
    and exists (select 1 from public.documents d where d.id = document_id and d.created_by = auth.uid())
  );
create policy "remove own unsubmitted" on public.movements for delete to authenticated
  using (
    site_id = public.my_site_id()
    and exists (select 1 from public.documents d where d.id = document_id and d.created_by = auth.uid())
    and not exists (select 1 from public.day_submissions s where s.site_id = movements.site_id and s.day = movements.move_date)
  );

create policy "read submissions" on public.day_submissions for select to authenticated using (site_id = public.my_site_id());
create policy "submit day" on public.day_submissions for insert to authenticated
  with check (site_id = public.my_site_id() and submitted_by = auth.uid());

-- ───────────────────────── First site ─────────────────────────
-- Rename this in Table Editor → sites once you know the site name.
insert into public.sites (name) values ('Main site');

-- ───────────────────────── Permissions ─────────────────────────
-- Signed-in users only; the access rules above decide which rows.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.my_site_id() to authenticated;
