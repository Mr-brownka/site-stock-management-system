-- 1. System reference numbers: Bohari numbers every entry itself, per project and per kind
--    (DLV deliveries, ISS cards, RET returns, TRF project transfers). Existing entries are
--    numbered in the order they were saved. Numbers never change once given.
alter table public.documents add column if not exists sys_no integer;

create or replace function public.doc_group(k text) returns text language sql immutable as $$
  select case when k in ('transfer_in', 'transfer_out') then 'transfer' when k in ('delivery', 'issue', 'return') then k else null end
$$;

with n as (
  select id, row_number() over (partition by site_id, public.doc_group(kind) order by created_at, id) as rn
  from public.documents where public.doc_group(kind) is not null
)
update public.documents d set sys_no = n.rn from n where d.id = n.id and d.sys_no is null;

create or replace function public.assign_sys_no() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.doc_group(new.kind) is not null and new.sys_no is null then
    perform pg_advisory_xact_lock(hashtext(new.site_id::text || public.doc_group(new.kind)));
    select coalesce(max(sys_no), 0) + 1 into new.sys_no from public.documents
      where site_id = new.site_id and public.doc_group(kind) = public.doc_group(new.kind);
  end if;
  return new;
end $$;
drop trigger if exists documents_sys_no on public.documents;
create trigger documents_sys_no before insert on public.documents for each row execute function public.assign_sys_no();

-- 2. WhatsApp alert: who the site admin is, and when the alert was last sent (and by whom).
alter table public.sites
  add column if not exists alert_name text,
  add column if not exists alert_phone text,
  add column if not exists alert_sent_at timestamptz,
  add column if not exists alert_sent_by text;

-- Anyone on the site can record that they sent the alert; nothing else on the site changes.
create or replace function public.mark_alert_sent(style text default null) returns void
language sql security definer set search_path = public as $$
  update public.sites set alert_sent_at = now(),
    alert_sent_by = (select coalesce(full_name, '') from public.profiles where id = auth.uid())
  where id = public.my_site_id();
$$;
revoke all on function public.mark_alert_sent(text) from public, anon;
grant execute on function public.mark_alert_sent(text) to authenticated;
