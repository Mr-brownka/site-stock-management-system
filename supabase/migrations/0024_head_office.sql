-- Head office: people not tied to one site (management, procurement). They pick which site to look at;
-- everything they see follows that choice (the same rules as a site's own people).
alter table public.profiles add column if not exists head_office boolean not null default false;

create or replace function public.guard_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() and (
       new.role is distinct from old.role or new.status is distinct from old.status
       or (new.site_id is distinct from old.site_id and not old.head_office)
       or new.access is distinct from old.access or new.pages is distinct from old.pages
       or new.head_office is distinct from old.head_office) then
    raise exception 'Only the admin can change this';
  end if;
  return new;
end $$;

-- Head office people (and the admin) switch the site they are looking at.
create or replace function public.view_site(site uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.sites where id = site) then raise exception 'Unknown site'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and status = 'approved' and (head_office or role = 'admin')) then
    raise exception 'Only head office can switch sites';
  end if;
  update public.profiles set site_id = site where id = auth.uid();
end $$;
revoke execute on function public.view_site(uuid) from public, anon;
grant execute on function public.view_site(uuid) to authenticated;
