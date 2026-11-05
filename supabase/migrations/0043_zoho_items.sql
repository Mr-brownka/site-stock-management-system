-- Zoho's full item list (the master list). Filled by the zoho-items function; read by the first count upload to match names.
create table if not exists public.zoho_items (
  zoho_item_id text primary key,
  name         text not null,
  unit         text,
  sku          text,
  status       text,
  item_type    text,
  category     text,
  fetched_at   timestamptz not null default now()
);
create index if not exists zoho_items_name on public.zoho_items (lower(name));
alter table public.zoho_items enable row level security;
drop policy if exists "signed in read" on public.zoho_items;
create policy "signed in read" on public.zoho_items for select to authenticated using (true);
grant select on public.zoho_items to authenticated;
create table if not exists public.zoho_items_fetch (id int primary key default 1, at timestamptz, total int, error text, check (id = 1));
alter table public.zoho_items_fetch enable row level security;
drop policy if exists "signed in read" on public.zoho_items_fetch;
create policy "signed in read" on public.zoho_items_fetch for select to authenticated using (true);
grant select on public.zoho_items_fetch to authenticated;
