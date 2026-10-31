-- Access per person: Can edit, View only, or Demo mode (opens on an example store; the real data stays view only).
alter table public.profiles drop constraint if exists profiles_access_check;
alter table public.profiles add constraint profiles_access_check check (access in ('edit', 'read', 'demo'));
-- The project manager and C-suite were on the demo already: keep them there.
update public.profiles set access = 'demo' where role in ('project_manager', 'coo', 'ceo') and access <> 'demo';
