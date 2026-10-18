-- Stock take lists, stock takes, and the project week number.

-- ── Project week ──
-- The week the admin (or the first storekeeper) says it is, and the date they said it.
-- The app counts on from there, skipping any week with no entries (site closed,
-- e.g. the December break). The admin can correct it at any time.
alter table public.sites
  add column week_anchor_date date,
  add column week_anchor_no int check (week_anchor_no is null or week_anchor_no > 0);

create or replace function public.set_project_week(p_site uuid, p_week int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_week is null or p_week < 1 then raise exception 'Enter a week number from 1'; end if;
  if not (public.is_admin() or (p_site = public.my_site_id() and (select week_anchor_no from public.sites where id = p_site) is null)) then
    raise exception 'Only the admin can change the project week';
  end if;
  update public.sites set week_anchor_no = p_week, week_anchor_date = (now() at time zone 'Africa/Nairobi')::date where id = p_site;
end $$;
revoke execute on function public.set_project_week(uuid, int) from public, anon;
grant execute on function public.set_project_week(uuid, int) to authenticated;

-- ── Stock take list: the items the admin has listed for each store (no quantities) ──
create table public.site_checklist (
  site_id  uuid not null references public.sites on delete cascade,
  item_id  bigint not null references public.items,
  position int not null default 0,
  added_at timestamptz not null default now(),
  primary key (site_id, item_id)
);
alter table public.site_checklist enable row level security;
grant select, insert, update, delete on public.site_checklist to authenticated;
create policy "read own site checklist" on public.site_checklist for select to authenticated using (site_id = public.my_site_id() or public.is_admin());
create policy "admin adds to checklist" on public.site_checklist for insert to authenticated with check (public.is_admin());
create policy "admin edits checklist" on public.site_checklist for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin removes from checklist" on public.site_checklist for delete to authenticated using (public.is_admin());

-- ── Stock takes: every physical count, kept for the record ──
create table public.stock_takes (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null default public.my_site_id() references public.sites,
  count_date  date not null,
  start_time  text,
  end_time    text,
  counted_by  text,
  checked_by  text,
  is_first    boolean not null default false,
  status      text not null default 'recorded' check (status in ('recorded', 'confirmed')),
  document_id uuid references public.documents on delete set null,
  created_by  uuid not null default auth.uid() references auth.users,
  created_at  timestamptz not null default now()
);
create table public.stock_take_lines (
  stock_take_id uuid not null references public.stock_takes on delete cascade,
  item_id       bigint not null references public.items,
  qty           numeric not null check (qty >= 0),
  primary key (stock_take_id, item_id)
);
alter table public.stock_takes enable row level security;
alter table public.stock_take_lines enable row level security;
grant select, insert on public.stock_takes, public.stock_take_lines to authenticated;
create policy "read own site stock takes" on public.stock_takes for select to authenticated using (site_id = public.my_site_id() or public.is_admin());
create policy "record a stock take" on public.stock_takes for insert to authenticated with check (site_id = public.my_site_id() and created_by = auth.uid());
create policy "read own site stock take lines" on public.stock_take_lines for select to authenticated
  using (exists (select 1 from public.stock_takes t where t.id = stock_take_id and (t.site_id = public.my_site_id() or public.is_admin())));
create policy "record stock take lines" on public.stock_take_lines for insert to authenticated
  with check (exists (select 1 from public.stock_takes t where t.id = stock_take_id and t.created_by = auth.uid()));
