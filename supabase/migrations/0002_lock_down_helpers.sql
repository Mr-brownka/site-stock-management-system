-- Helper functions are only used by triggers and access rules; nobody needs
-- to call them over the API. Visitors who are not signed in get nothing.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.movement_adds_site_item() from public, anon, authenticated;
revoke execute on function public.movement_from_document() from public, anon, authenticated;
revoke execute on function public.block_locked_day() from public, anon, authenticated;
revoke execute on function public.my_site_id() from public, anon;
grant execute on function public.my_site_id() to authenticated;
revoke all on all tables in schema public from anon;
