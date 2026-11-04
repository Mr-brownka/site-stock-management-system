-- 19 · Phone notifications (low stock, a Zoho delivery arrived, reminder before the register closes)
-- 20 · Sign in with fingerprint / Face ID (passkeys)
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Private settings only the server reads (no access rules = nobody signed in can read them).
-- Filled once outside git: vapid_public, vapid_private, cron_secret, functions_url.
create table if not exists public.app_secrets (name text primary key, value text not null);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

create table if not exists public.push_subs (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  prefs      jsonb not null default '{"reminder": true, "low": true, "delivery": true}',
  ua         text,
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
drop policy if exists "own subs" on public.push_subs;
create policy "own subs" on public.push_subs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and not public.is_guest());
grant select, insert, update, delete on public.push_subs to authenticated;

create table if not exists public.passkeys (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users on delete cascade,
  credential_id text not null unique,
  public_key    text not null,
  counter       bigint not null default 0,
  transports    text[],
  device        text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
alter table public.passkeys enable row level security;
drop policy if exists "own passkeys" on public.passkeys;
create policy "own passkeys" on public.passkeys for select to authenticated using (user_id = auth.uid());
drop policy if exists "remove own passkey" on public.passkeys;
create policy "remove own passkey" on public.passkeys for delete to authenticated using (user_id = auth.uid());
grant select, delete on public.passkeys to authenticated;

create table if not exists public.passkey_challenges (
  id         uuid primary key default gen_random_uuid(),
  challenge  text not null,
  user_id    uuid,
  created_at timestamptz not null default now()
);
alter table public.passkey_challenges enable row level security;

-- Calls the notify function (used by the schedule and by the Zoho delivery trigger).
create or replace function public._notify(body jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare u text; s text;
begin
  select value into u from public.app_secrets where name = 'functions_url';
  select value into s from public.app_secrets where name = 'cron_secret';
  if u is null or s is null then return; end if;
  perform net.http_post(url := u || '/notify', body := body, headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', s));
end $$;
revoke all on function public._notify(jsonb) from public, anon, authenticated;

-- A delivery brought in from Zoho: tell that site's store team.
create or replace function public.trg_notify_zoho_delivery()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'delivery' and new.source = 'zoho' then
    perform public._notify(jsonb_build_object('kind', 'delivery', 'site_id', new.site_id, 'doc_id', new.id, 'party', new.party, 'grn', new.zoho_grn));
  end if;
  return new;
end $$;
drop trigger if exists notify_zoho_delivery on public.documents;
create trigger notify_zoho_delivery after insert on public.documents for each row execute function public.trg_notify_zoho_delivery();

-- Schedule (UTC; Nairobi is UTC+3): reminder 5:30 pm Mon–Sat, low stock 8:00 am Mon–Sat. Old challenges cleared hourly.
select cron.unschedule(jobid) from cron.job where jobname in ('ostock-reminder', 'ostock-low', 'ostock-passkey-clean');
select cron.schedule('ostock-reminder', '30 14 * * 1-6', $$select public._notify('{"kind":"reminder"}'::jsonb)$$);
select cron.schedule('ostock-low', '0 5 * * 1-6', $$select public._notify('{"kind":"low"}'::jsonb)$$);
select cron.schedule('ostock-passkey-clean', '7 * * * *', $$delete from public.passkey_challenges where created_at < now() - interval '15 minutes'$$);
