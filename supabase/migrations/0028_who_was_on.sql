-- Who used the app each day: first and last time seen (Nairobi day). The app pings while it is open.
create table if not exists public.user_activity (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.user_activity enable row level security;
drop policy if exists "admin reads activity" on public.user_activity;
create policy "admin reads activity" on public.user_activity for select to authenticated using (public.is_admin());

create or replace function public.touch_activity()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.user_activity (user_id, day) values (auth.uid(), (now() at time zone 'Africa/Nairobi')::date)
  on conflict (user_id, day) do update set last_at = now();
end $$;
revoke execute on function public.touch_activity() from public, anon;
grant execute on function public.touch_activity() to authenticated;

-- The admin sees when each person last signed in with their name and password.
create or replace function public.people_sign_ins()
returns table (user_id uuid, last_sign_in_at timestamptz) language sql stable security definer set search_path = public, auth as $$
  select u.id, u.last_sign_in_at from auth.users u where public.is_admin()
$$;
revoke execute on function public.people_sign_ins() from public, anon;
grant execute on function public.people_sign_ins() to authenticated;

-- Sign-ins so far count as activity on their day.
insert into public.user_activity (user_id, day, first_at, last_at)
select id, (last_sign_in_at at time zone 'Africa/Nairobi')::date, last_sign_in_at, last_sign_in_at from auth.users where last_sign_in_at is not null
on conflict do nothing;
