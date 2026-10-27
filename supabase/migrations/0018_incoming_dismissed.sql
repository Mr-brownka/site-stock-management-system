-- Part deliveries the store says won't come ("Not coming"). Only hides the order
-- in Incoming deliveries; Zoho is not changed. Can be brought back.
create table if not exists public.incoming_dismissed (
  site_id      uuid not null default public.my_site_id() references public.sites on delete cascade,
  po_id        text not null,
  po           text,
  vendor       text,
  reason       text not null,
  dismissed_by uuid not null default auth.uid() references auth.users,
  dismissed_at timestamptz not null default now(),
  primary key (site_id, po_id)
);
alter table public.incoming_dismissed enable row level security;
create policy "read own site" on public.incoming_dismissed for select to authenticated using (site_id = public.my_site_id() or public.is_admin());
create policy "dismiss" on public.incoming_dismissed for insert to authenticated with check (site_id = public.my_site_id() and dismissed_by = auth.uid());
create policy "bring back" on public.incoming_dismissed for delete to authenticated using (site_id = public.my_site_id());
grant select, insert, delete on public.incoming_dismissed to authenticated;
