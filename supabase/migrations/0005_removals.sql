-- Removals (run after 0004).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('store', 'assistant', 'admin'));
-- People cannot edit their own role or status; only the admin can.
drop policy if exists "own name" on public.profiles;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.merge_items(bigint, bigint) from public, anon;
revoke execute on function public.decide_correction(uuid, boolean, text) from public, anon;
revoke execute on function public.guard_profile() from public, anon, authenticated;
revoke all on public.correction_requests from anon;
