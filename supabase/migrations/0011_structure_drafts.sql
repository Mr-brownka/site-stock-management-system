-- 1. Project structure per site, asked when a site is registered: sub-phases come from it.
alter table public.sites
  add column if not exists basements integer not null default 0,
  add column if not exists has_ground boolean not null default true,
  add column if not exists floors integer,
  add column if not exists roof_name text;

-- 2. "To confirm": an entry saved with some details left out (counts in stock now).
alter table public.documents add column if not exists to_confirm text[] not null default '{}';

-- Fills in details that were left out, and only those. Quantities and dates never change here.
create or replace function public.confirm_details(doc uuid, fields jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare d public.documents; k text; v text;
begin
  select * into d from public.documents where id = doc;
  if d.id is null or (d.site_id <> public.my_site_id() and not public.is_admin()) then raise exception 'Entry not found'; end if;
  for k, v in select key, value #>> '{}' from jsonb_each(fields) loop
    if not (k = any(d.to_confirm)) then raise exception '% was not left to confirm', k; end if;
    if v is null or btrim(v) = '' then continue; end if;
    case k
      when 'ref_no' then update public.documents set ref_no = v where id = doc;
      when 'card_no' then update public.documents set card_no = v where id = doc;
      when 'party' then update public.documents set party = v where id = doc;
      when 'activity' then update public.documents set activity = v where id = doc;
      when 'gemba' then update public.documents set gemba = v where id = doc;
      when 'supervisor' then update public.documents set supervisor = v where id = doc;
      when 'authorised_by' then update public.documents set authorised_by = v where id = doc;
      when 'doc_time' then update public.documents set doc_time = v::time where id = doc;
      when 'subphase' then update public.movements set subphase = v where document_id = doc and subphase is null;
      else raise exception 'Unknown detail %', k;
    end case;
    update public.documents set to_confirm = array_remove(to_confirm, k) where id = doc;
  end loop;
end $$;
revoke all on function public.confirm_details(uuid, jsonb) from public, anon;
grant execute on function public.confirm_details(uuid, jsonb) to authenticated;

-- 3. Drafts: unfinished entries that do not touch stock until they are finished.
create table if not exists public.drafts (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null default public.my_site_id() references public.sites,
  created_by uuid not null default auth.uid() references auth.users,
  step       text not null,
  doc_date   date not null,
  title      text not null default '',
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.drafts enable row level security;
create policy "read drafts" on public.drafts for select to authenticated using (site_id = public.my_site_id() or public.is_admin());
create policy "add drafts" on public.drafts for insert to authenticated with check (site_id = public.my_site_id() and created_by = auth.uid());
create policy "remove drafts" on public.drafts for delete to authenticated using (site_id = public.my_site_id());
grant select, insert, delete on public.drafts to authenticated;
grant select, insert, update, delete on public.drafts to service_role;
