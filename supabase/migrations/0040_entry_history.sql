-- 26 · "Who changed what" on every entry. Every change to an entry (created, a detail changed, a line added,
-- removed or its quantity changed, a fix asked for / approved / turned down, deleted) is written here by the
-- database itself, so nothing can skip it. Read-only for everyone; only the triggers write.
create table if not exists public.entry_history (
  id          bigint generated always as identity primary key,
  site_id     uuid not null,
  document_id uuid not null,          -- no foreign key: the history stays after an entry is deleted
  at          timestamptz not null default now(),
  by_user     uuid,
  by_name     text,
  action      text not null,          -- created | changed | line added | line removed | qty changed | fix asked | fix approved | fix turned down | deleted
  detail      text
);
create index if not exists entry_history_doc on public.entry_history (document_id, at);
create index if not exists entry_history_site on public.entry_history (site_id, at desc);
alter table public.entry_history enable row level security;
drop policy if exists "read own site" on public.entry_history;
create policy "read own site" on public.entry_history for select to authenticated using (site_id = public.my_site_id() or public.is_admin());
grant select on public.entry_history to authenticated;

create or replace function public._who(fallback text default 'System')
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select full_name from public.profiles where id = auth.uid()), fallback)
$$;

create or replace function public._log_entry(site uuid, doc uuid, act text, det text, fallback text default 'System')
returns void language sql security definer set search_path = public as $$
  insert into public.entry_history (site_id, document_id, by_user, by_name, action, detail)
  values (site, doc, auth.uid(), public._who(fallback), act, det)
$$;

-- Documents: created, details changed, deleted. A correction document is logged on the entry it corrects.
create or replace function public.trg_history_documents()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ch text[] := '{}';
  src text;
begin
  if tg_op = 'INSERT' then
    if new.kind = 'correction' and new.corrects_document is not null then
      perform public._log_entry(new.site_id, new.corrects_document, 'changed', 'Correction added' || coalesce(': ' || nullif(new.reason, ''), ''));
    else
      src := case when new.source = 'zoho' then 'Zoho' else 'System' end;
      perform public._log_entry(new.site_id, new.id, 'created', case when new.source = 'zoho' then 'Brought in from Zoho' || coalesce(' (' || new.zoho_grn || ')', '') else null end, src);
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if new.doc_date is distinct from old.doc_date then ch := ch || ('Date ' || to_char(old.doc_date, 'DD Mon') || ' → ' || to_char(new.doc_date, 'DD Mon')); end if;
    if new.doc_time is distinct from old.doc_time then ch := ch || ('Time ' || coalesce(to_char(old.doc_time, 'HH24:MI'), '—') || ' → ' || coalesce(to_char(new.doc_time, 'HH24:MI'), '—')); end if;
    if new.ref_no is distinct from old.ref_no then ch := ch || ('Ref ' || coalesce(old.ref_no, '—') || ' → ' || coalesce(new.ref_no, '—')); end if;
    if new.card_no is distinct from old.card_no then ch := ch || ('Card ' || coalesce(old.card_no, '—') || ' → ' || coalesce(new.card_no, '—')); end if;
    if new.party is distinct from old.party then ch := ch || (case when old.kind = 'delivery' then 'Supplier ' else 'Name ' end || coalesce(old.party, '—') || ' → ' || coalesce(new.party, '—')); end if;
    if new.activity is distinct from old.activity then ch := ch || ('Activity ' || coalesce(old.activity, '—') || ' → ' || coalesce(new.activity, '—')); end if;
    if new.gemba is distinct from old.gemba then ch := ch || ('Gemba ' || coalesce(old.gemba, '—') || ' → ' || coalesce(new.gemba, '—')); end if;
    if new.supervisor is distinct from old.supervisor then ch := ch || ('Supervisor ' || coalesce(old.supervisor, '—') || ' → ' || coalesce(new.supervisor, '—')); end if;
    if new.authorised_by is distinct from old.authorised_by then ch := ch || (case when old.kind = 'issue' then 'Store ' else 'Authorised by ' end || coalesce(old.authorised_by, '—') || ' → ' || coalesce(new.authorised_by, '—')); end if;
    if new.received_by is distinct from old.received_by then ch := ch || ('Received by ' || coalesce(old.received_by, '—') || ' → ' || coalesce(new.received_by, '—')); end if;
    if new.vehicle is distinct from old.vehicle then ch := ch || ('Vehicle ' || coalesce(old.vehicle, '—') || ' → ' || coalesce(new.vehicle, '—')); end if;
    if array_length(ch, 1) > 0 then perform public._log_entry(new.site_id, new.id, 'changed', array_to_string(ch, ' · ')); end if;
    return new;
  else
    if old.kind <> 'correction' then perform public._log_entry(old.site_id, old.id, 'deleted', null); end if;
    return old;
  end if;
end $$;

-- Lines: added, removed, quantity changed (only after the entry was first saved, so the first save is one "created").
create or replace function public.trg_history_movements()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d public.documents;
  m public.movements;
  nm text;
begin
  m := case when tg_op = 'DELETE' then old else new end;
  select * into d from public.documents where id = m.document_id;
  if d.id is null or d.kind = 'correction' then return m; end if;  -- deleted with its entry / logged on the doc
  select name || coalesce(' (' || unit || ')', '') into nm from public.items where id = m.item_id;
  if tg_op = 'INSERT' then
    if now() - d.created_at > interval '20 seconds' then
      perform public._log_entry(d.site_id, d.id, 'line added', coalesce(nm, 'Item') || ': ' || trim(to_char(new.qty, 'FM999999990.##')));
    end if;
  elsif tg_op = 'UPDATE' then
    if new.qty is distinct from old.qty then
      perform public._log_entry(d.site_id, d.id, 'qty changed', coalesce(nm, 'Item') || ': ' || trim(to_char(old.qty, 'FM999999990.##')) || ' → ' || trim(to_char(new.qty, 'FM999999990.##')));
    end if;
    if new.item_id is distinct from old.item_id then
      perform public._log_entry(d.site_id, d.id, 'changed', 'Item ' || coalesce((select name from public.items where id = old.item_id), '?') || ' → ' || coalesce(nm, '?'));
    end if;
  else
    perform public._log_entry(d.site_id, d.id, 'line removed', coalesce(nm, 'Item') || ': ' || trim(to_char(old.qty, 'FM999999990.##')));
  end if;
  return m;
end $$;

-- Fixes: asked for, approved, turned down.
create or replace function public.trg_history_corrections()
returns trigger language plpgsql security definer set search_path = public as $$
declare doc uuid;
begin
  doc := coalesce(new.document_id, (select document_id from public.movements where id = new.movement_id));
  if doc is null then return new; end if;
  if tg_op = 'INSERT' then
    perform public._log_entry(new.site_id, doc, 'fix asked', concat_ws(' · ', nullif(new.reason, ''), nullif(new.note, '')));
  elsif new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    perform public._log_entry(new.site_id, doc, case when new.status = 'approved' then 'fix approved' else 'fix turned down' end, nullif(new.decision_note, ''));
  end if;
  return new;
end $$;

drop trigger if exists history_documents on public.documents;
create trigger history_documents after insert or update or delete on public.documents for each row execute function public.trg_history_documents();
drop trigger if exists history_movements on public.movements;
create trigger history_movements after insert or update or delete on public.movements for each row execute function public.trg_history_movements();
drop trigger if exists history_corrections on public.correction_requests;
create trigger history_corrections after insert or update on public.correction_requests for each row execute function public.trg_history_corrections();

revoke all on function public._log_entry(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public._who(text) from public, anon, authenticated;

-- Start every existing entry's history with when it was made and by whom, and the fixes already asked for.
insert into public.entry_history (site_id, document_id, at, by_user, by_name, action, detail)
select d.site_id, d.id, d.created_at, d.created_by, coalesce(p.full_name, case when d.source = 'zoho' then 'Zoho' else 'System' end), 'created',
       case when d.source = 'zoho' then 'Brought in from Zoho' || coalesce(' (' || d.zoho_grn || ')', '') end
from public.documents d left join public.profiles p on p.id = d.created_by
where d.kind <> 'correction' and not exists (select 1 from public.entry_history h where h.document_id = d.id and h.action = 'created');

insert into public.entry_history (site_id, document_id, at, by_user, by_name, action, detail)
select c.site_id, coalesce(c.document_id, mv.document_id), c.created_at, c.created_by, coalesce(p.full_name, 'System'), 'fix asked', concat_ws(' · ', nullif(c.reason, ''), nullif(c.note, ''))
from public.correction_requests c left join public.movements mv on mv.id = c.movement_id left join public.profiles p on p.id = c.created_by
where coalesce(c.document_id, mv.document_id) is not null;

insert into public.entry_history (site_id, document_id, at, by_user, by_name, action, detail)
select c.site_id, coalesce(c.document_id, mv.document_id), c.decided_at, c.decided_by, coalesce(p.full_name, 'Admin'), case when c.status = 'approved' then 'fix approved' else 'fix turned down' end, nullif(c.decision_note, '')
from public.correction_requests c left join public.movements mv on mv.id = c.movement_id left join public.profiles p on p.id = c.decided_by
where c.status in ('approved', 'rejected') and c.decided_at is not null and coalesce(c.document_id, mv.document_id) is not null;
