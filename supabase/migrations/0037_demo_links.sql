-- Demo mode without signing in: each person on Demo mode gets their own link (a private token).
alter table public.profiles add column if not exists demo_token uuid unique;
