-- People sign in by name, so two active people can't share one.
create unique index if not exists profiles_name_unique on public.profiles (lower(btrim(full_name))) where status in ('pending', 'approved');
