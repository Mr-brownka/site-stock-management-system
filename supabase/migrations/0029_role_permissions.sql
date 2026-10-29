-- Roles are now: Stores, Site manager, Procurement, Accounts, COO, CEO, Project manager (plus the admin).
-- Permissions belong to the role: everyone in a role sees the same pages and has the same access.
-- A store keeper can still be switched to view only one by one (profiles.access).
update public.profiles set role = 'store' where role = 'assistant';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'store', 'site_manager', 'procurement', 'accounts', 'coo', 'ceo', 'project_manager'));

create table if not exists public.role_permissions (
  role text primary key,
  access text not null default 'read' check (access in ('edit', 'read')),
  pages text[],            -- null: every page
  updated_at timestamptz not null default now()
);
alter table public.role_permissions enable row level security;
drop policy if exists "read role permissions" on public.role_permissions;
create policy "read role permissions" on public.role_permissions for select to authenticated using (true);
drop policy if exists "admin sets role permissions" on public.role_permissions;
create policy "admin sets role permissions" on public.role_permissions for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.role_permissions (role, access, pages) values
  ('store', 'edit', null),
  ('site_manager', 'read', array['home','incoming','items','stocktake','deliveries','issued','returns','transfers']),
  ('procurement', 'read', array['home','incoming','items','stocktake','deliveries','transfers']),
  ('accounts', 'read', array['home','items','deliveries','issued','returns','transfers','reports']),
  ('coo', 'read', null),
  ('ceo', 'read', null),
  ('project_manager', 'read', array['home','incoming','items','stocktake','deliveries','issued','returns','transfers','reports'])
on conflict (role) do nothing;

-- Pages now come from the role; the per-person list is no longer used.
update public.profiles set pages = null;
-- Only store keepers are switched to view only one by one; everyone else follows their role.
update public.profiles set access = 'edit' where role <> 'store';

-- May the person signed in change anything? Admin always; others when their role allows it and they aren't switched to view only.
create or replace function public.can_edit()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.role = 'admin' or (p.status = 'approved' and p.access = 'edit'
                     and coalesce((select r.access from public.role_permissions r where r.role = p.role), 'read') = 'edit')
                   from public.profiles p where p.id = auth.uid()), false)
$$;
revoke execute on function public.can_edit() from public, anon;
grant execute on function public.can_edit() to authenticated;

-- People who sign up themselves join as Stores (the admin changes the role if needed).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wanted_site uuid;
begin
  begin wanted_site := (m ->> 'site_id')::uuid; exception when others then wanted_site := null; end;
  if wanted_site is not null and not exists (select 1 from public.sites where id = wanted_site) then wanted_site := null; end if;
  insert into public.profiles (id, site_id, full_name, email, phone, role, status)
  values (new.id, wanted_site, coalesce(nullif(m ->> 'full_name', ''), split_part(new.email, '@', 1)), new.email, nullif(m ->> 'phone', ''), 'store', 'pending')
  on conflict (id) do nothing;
  return new;
end $$;
