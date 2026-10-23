-- A log of every goods-received note the Zoho check looks at, and what happened to it,
-- so the admin can compare what came in against Zoho. Written only by the zoho-sync function.
create table if not exists public.zoho_log (
  zoho_receive_id text primary key,
  site_id uuid references public.sites(id) on delete set null,
  project text,
  grn text,
  po text,
  vendor text,
  receive_date date,
  status text not null,          -- imported | linked | waiting | no_project | other_site | before_start
  detail text,
  lines jsonb,                   -- [{name, unit, qty}]
  document_id uuid references public.documents(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.zoho_log enable row level security;
drop policy if exists "admin reads zoho log" on public.zoho_log;
create policy "admin reads zoho log" on public.zoho_log for select using (public.is_admin());

-- One row per check: how many receives Zoho listed and what came of them.
create table if not exists public.zoho_runs (
  id bigserial primary key,
  user_id uuid,
  site_id uuid references public.sites(id) on delete set null,
  at timestamptz not null default now(),
  listed int not null default 0,
  recent int not null default 0,
  imported int not null default 0,
  waiting int not null default 0,
  linked int not null default 0,
  other_site int not null default 0,
  note text
);
alter table public.zoho_runs enable row level security;
drop policy if exists "admin reads zoho runs" on public.zoho_runs;
create policy "admin reads zoho runs" on public.zoho_runs for select using (public.is_admin());
create index if not exists zoho_runs_site_at on public.zoho_runs (site_id, at desc);
