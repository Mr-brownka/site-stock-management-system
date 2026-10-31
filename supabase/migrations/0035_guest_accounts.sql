-- Guest accounts: someone (e.g. a visiting developer) can use the app on a copy of a site's data,
-- but can never change anything in the real store. The app keeps the guest's entries in their own
-- browser; the database refuses any write made with a guest's sign-in, whatever the route.
alter table public.profiles add column if not exists guest boolean not null default false;

create or replace function public.is_guest()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.guest from public.profiles p where p.id = auth.uid()), false)
$$;
revoke execute on function public.is_guest() from public, anon;
grant execute on function public.is_guest() to authenticated;

-- A guest can never edit.
create or replace function public.can_edit()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select not p.guest and (p.role = 'admin' or (p.status = 'approved' and p.access = 'edit'
                     and coalesce((select r.access from public.role_permissions r where r.role = p.role), 'read') = 'edit'))
                   from public.profiles p where p.id = auth.uid()), false)
$$;

-- Belt and braces: every table refuses inserts, updates and deletes made by a guest,
-- including through the app's own database functions (they run as the caller's sign-in).
create or replace function public.block_guest()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_guest() then
    raise exception 'Guest view: nothing can be changed in the real store.' using errcode = '42501';
  end if;
  return null;
end $$;

do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    execute format('drop trigger if exists zz_block_guest on public.%I', t.relname);
    execute format('create trigger zz_block_guest before insert or update or delete on public.%I for each statement execute function public.block_guest()', t.relname);
  end loop;
end $$;
