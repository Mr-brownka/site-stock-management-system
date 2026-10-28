-- Passwords the admin gave out, so the admin can look one up later. Only the admin can read them.
-- When the person sets their own password, theirs is never stored and the issued one is forgotten.
create table if not exists public.issued_passwords (
  user_id  uuid primary key references auth.users on delete cascade,
  password text not null,
  set_at   timestamptz not null default now(),
  set_by   uuid references auth.users
);
alter table public.issued_passwords enable row level security;
revoke all on public.issued_passwords from anon, authenticated;
grant select on public.issued_passwords to authenticated;
create policy "admin reads issued passwords" on public.issued_passwords for select to authenticated using (public.is_admin());
grant all on public.issued_passwords to service_role;

create or replace function public.forget_issued_password()
returns void language sql security definer set search_path = public as $$
  delete from public.issued_passwords where user_id = auth.uid();
$$;
revoke execute on function public.forget_issued_password() from public, anon;
grant execute on function public.forget_issued_password() to authenticated;
