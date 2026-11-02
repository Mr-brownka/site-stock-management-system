-- Errors the app hits on people's phones and laptops, recorded quietly so white pages can be traced.
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  who text,
  mode text,
  screen text,
  message text not null,
  stack text,
  url text,
  version text,
  agent text
);
alter table public.client_errors enable row level security;
drop policy if exists "anyone records an error" on public.client_errors;
create policy "anyone records an error" on public.client_errors for insert to anon, authenticated
  with check (length(message) <= 2000 and coalesce(length(stack), 0) <= 8000);
drop policy if exists "admin reads errors" on public.client_errors;
create policy "admin reads errors" on public.client_errors for select to authenticated using (public.is_admin());
grant insert on public.client_errors to anon, authenticated;
grant select on public.client_errors to authenticated;
