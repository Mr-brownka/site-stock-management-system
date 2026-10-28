-- Site managers join as a role with exactly the same settings as procurement: view only, pages chosen by the admin.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('store', 'assistant', 'admin', 'procurement', 'site_manager'));

create or replace function public.can_edit()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.role = 'admin' or (p.access = 'edit' and p.role not in ('procurement', 'site_manager') and p.status = 'approved')
                   from public.profiles p where p.id = auth.uid()), false)
$$;
revoke execute on function public.can_edit() from public, anon;
grant execute on function public.can_edit() to authenticated;

-- Procurement people who choose their pages also get the stock take page (view and download only).
update public.profiles set pages = array_append(pages, 'stocktake')
 where role in ('procurement', 'site_manager') and pages is not null and not ('stocktake' = any(pages));
