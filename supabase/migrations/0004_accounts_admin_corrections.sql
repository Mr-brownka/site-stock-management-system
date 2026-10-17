-- Accounts with admin approval, admin access across sites, and corrections.

-- ───────────────────────── Accounts ─────────────────────────
alter table public.profiles
  add column status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'removed')),
  add column email text,
  add column phone text,
  add column decided_at timestamptz;

-- Everyone who already has a login stays in.
update public.profiles p set status = 'approved', email = u.email from auth.users u where u.id = p.id;

-- A person only gets a site once the admin has approved them.
create or replace function public.my_site_id()
returns uuid language sql stable security definer set search_path = public as $$
  select site_id from public.profiles where id = auth.uid() and status = 'approved'
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'approved' and role = 'admin')
$$;

-- Sign-up sends name, phone, site and role; the account waits for approval.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wanted_site uuid;
begin
  begin wanted_site := (m ->> 'site_id')::uuid; exception when others then wanted_site := null; end;
  if wanted_site is not null and not exists (select 1 from public.sites where id = wanted_site) then wanted_site := null; end if;
  insert into public.profiles (id, site_id, full_name, email, phone, role, status)
  values (
    new.id,
    wanted_site,
    coalesce(nullif(m ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(m ->> 'phone', ''),
    case when m ->> 'role' = 'assistant' then 'assistant' else 'store' end,
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- The sign-up page lists the sites before anyone is signed in (names only).
create or replace function public.signup_sites()
returns table (id uuid, name text, company text) language sql stable security definer set search_path = public as $$
  select s.id, s.name, c.name from public.sites s join public.companies c on c.id = s.company_id order by s.created_at
$$;
grant execute on function public.signup_sites() to anon, authenticated;

-- Everyone can see their own profile (to know they are waiting).
create policy "own profile" on public.profiles for select to authenticated using (id = auth.uid());

-- ───────────────────────── Admin access ─────────────────────────
create policy "admin reads profiles" on public.profiles for select to authenticated using (public.is_admin());
create policy "admin updates profiles" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admin reads sites" on public.sites for select to authenticated using (public.is_admin());
create policy "admin adds sites" on public.sites for insert to authenticated with check (public.is_admin());
create policy "admin renames sites" on public.sites for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin reads companies" on public.companies for select to authenticated using (public.is_admin());

create policy "admin reads site items" on public.site_items for select to authenticated using (public.is_admin());
create policy "admin sets reorder" on public.site_items for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin reads documents" on public.documents for select to authenticated using (public.is_admin());
create policy "admin reads movements" on public.movements for select to authenticated using (public.is_admin());
create policy "admin reads submissions" on public.day_submissions for select to authenticated using (public.is_admin());
create policy "admin edits items" on public.items for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Merge a duplicate item into the one to keep; all history moves across.
create or replace function public.merge_items(keep_id bigint, drop_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can merge items'; end if;
  if keep_id = drop_id then raise exception 'Pick two different items'; end if;
  update public.movements set item_id = keep_id where item_id = drop_id;
  insert into public.site_items (site_id, item_id, reorder_level, first_seen)
    select site_id, keep_id, reorder_level, first_seen from public.site_items where item_id = drop_id
    on conflict (site_id, item_id) do nothing;
  delete from public.site_items where item_id = drop_id;
  delete from public.items where id = drop_id;
end $$;

-- ───────────────────────── Corrections ─────────────────────────
-- A: fix a line on a submitted entry. B: recount an item on the shelf.
-- Nothing is applied until the admin approves; then a correction entry is
-- added and the original stays as it was.
create table public.correction_requests (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null default public.my_site_id() references public.sites,
  kind          text not null check (kind in ('fix', 'recount')),
  movement_id   bigint references public.movements on delete set null,  -- fix: the line that was wrong
  item_id       bigint not null references public.items,
  from_qty      numeric not null,  -- fix: entered qty · recount: system balance
  to_qty        numeric not null check (to_qty >= 0),  -- fix: correct qty · recount: counted
  reason        text not null,
  note          text,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decision_note text,
  decided_by    uuid references auth.users,
  decided_at    timestamptz,
  created_by    uuid not null default auth.uid() references auth.users,
  created_at    timestamptz not null default now(),
  check (from_qty <> to_qty)
);
alter table public.correction_requests enable row level security;
grant select, insert on public.correction_requests to authenticated;

create policy "read own site requests" on public.correction_requests for select to authenticated using (site_id = public.my_site_id() or public.is_admin());
create policy "ask for a correction" on public.correction_requests for insert to authenticated
  with check (site_id = public.my_site_id() and created_by = auth.uid() and status = 'pending');

-- Which line a correction entry fixes (for consumption reports).
alter table public.movements
  add column corrects_movement bigint references public.movements on delete set null,
  add column corrects_kind text;

create or replace function public.decide_correction(request_id uuid, approve boolean, decision text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.correction_requests;
  line public.movements;
  doc_id uuid;
  change numeric;
  on_date date := (now() at time zone 'Africa/Nairobi')::date;
begin
  if not public.is_admin() then raise exception 'Only the admin can decide corrections'; end if;
  select * into r from public.correction_requests where id = request_id for update;
  if r.id is null then raise exception 'Correction not found'; end if;
  if r.status <> 'pending' then raise exception 'Already decided'; end if;

  if approve then
    if r.kind = 'fix' then
      select * into line from public.movements where id = r.movement_id;
      if line.id is null then raise exception 'The original line no longer exists'; end if;
      -- Stock change needed so the line counts as to_qty instead of from_qty.
      change := case when line.kind in ('issue', 'transfer_out') then r.from_qty - r.to_qty else r.to_qty - r.from_qty end;
      on_date := line.move_date;
    else
      change := r.to_qty - r.from_qty;
    end if;
    insert into public.documents (site_id, kind, doc_date, reason, corrects_document, created_by)
      values (r.site_id, 'correction', on_date, r.reason || coalesce(' · ' || r.note, ''), line.document_id, auth.uid())
      returning id into doc_id;
    insert into public.movements (document_id, item_id, qty, subphase, corrects_movement, corrects_kind)
      values (doc_id, r.item_id, change, line.subphase, line.id, coalesce(line.kind, 'recount'));
  end if;

  update public.correction_requests
     set status = case when approve then 'approved' else 'rejected' end,
         decision_note = decision, decided_by = auth.uid(), decided_at = now()
   where id = request_id;
end $$;


-- Nobody but the admin can change a role, status or site (even on their own row).
create or replace function public.guard_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() and (
       new.role is distinct from old.role or new.status is distinct from old.status
       or new.site_id is distinct from old.site_id) then
    raise exception 'Only the admin can change this';
  end if;
  return new;
end $$;
create trigger guard_profile before update on public.profiles for each row execute function public.guard_profile();
grant execute on function public.is_admin() to authenticated;
grant execute on function public.merge_items(bigint, bigint) to authenticated;
grant execute on function public.decide_correction(uuid, boolean, text) to authenticated;
