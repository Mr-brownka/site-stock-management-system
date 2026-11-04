-- 31 · Deliveries in your calendar: each person gets a private calendar link for their site's incoming deliveries.
-- Calendar apps (Google, iPhone, Outlook) read it a few times a day through the "calendar" function.
create table if not exists public.calendar_feeds (
  user_id    uuid primary key default auth.uid() references auth.users on delete cascade,
  token      text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  created_at timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;
drop policy if exists "own feed" on public.calendar_feeds;
create policy "own feed" on public.calendar_feeds for select to authenticated using (user_id = auth.uid());
drop policy if exists "make own feed" on public.calendar_feeds;
create policy "make own feed" on public.calendar_feeds for insert to authenticated with check (user_id = auth.uid() and not public.is_guest());
drop policy if exists "reset own feed" on public.calendar_feeds;
create policy "reset own feed" on public.calendar_feeds for delete to authenticated using (user_id = auth.uid());
grant select, insert, delete on public.calendar_feeds to authenticated;
