-- Storekeeper training: 5 working days (Mon–Sat) of practice before the live store opens.
alter table public.profiles
  add column if not exists training_days date[] not null default '{}',
  add column if not exists training_waived boolean not null default false;

-- Counts today as a training day for the signed-in person (after a practice evening is submitted).
-- Sundays are not counted; the same day is never counted twice. Returns the number of days done.
create or replace function public.record_training_day(d date)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
  local_today date := (now() at time zone 'Africa/Nairobi')::date;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if d > local_today or d < local_today - 1 then raise exception 'Training day must be today'; end if;
  if extract(isodow from d) <> 7 then
    perform set_config('ssms.training', '1', true);
    update public.profiles set training_days = training_days || d
     where id = auth.uid() and not (d = any(training_days));
  end if;
  select coalesce(array_length(training_days, 1), 0) into n from public.profiles where id = auth.uid();
  return n;
end $$;
revoke all on function public.record_training_day(date) from public, anon;
grant execute on function public.record_training_day(date) to authenticated;

-- Only the admin can waive training, and training days only change through record_training_day.
create or replace function public.guard_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() and (
       new.role is distinct from old.role or new.status is distinct from old.status
       or new.site_id is distinct from old.site_id or new.training_waived is distinct from old.training_waived
       or (new.training_days is distinct from old.training_days and coalesce(current_setting('ssms.training', true), '') <> '1')) then
    raise exception 'Only the admin can change this';
  end if;
  return new;
end $$;
