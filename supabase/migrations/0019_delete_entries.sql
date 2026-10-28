-- Delete an entry entirely. Removing the paper removes its lines, so every balance goes back to what it was
-- before it was entered (an issue of 4 bags deleted: +4; a delivery deleted: -qty).
-- The admin deletes straight away; anyone else asks, and the admin approves. Either way the request row keeps
-- a copy of the paper and its lines, so the deleted entry stays on record.
alter table public.correction_requests drop constraint if exists correction_requests_kind_check;
alter table public.correction_requests add constraint correction_requests_kind_check check (kind in ('fix', 'recount', 'edit', 'delete'));
alter table public.correction_requests drop constraint if exists correction_requests_check;
alter table public.correction_requests add constraint correction_requests_check check (kind in ('edit', 'delete') or from_qty <> to_qty);

create or replace function public._remove_document(doc_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.documents;
begin
  select * into d from public.documents where id = doc_id for update;
  if d.id is null then raise exception 'The entry no longer exists'; end if;
  -- A Zoho delivery that was deleted here must not be brought in again by the next Zoho check.
  if d.zoho_receive_id is not null then
    insert into public.zoho_seen (zoho_receive_id, project) values (d.zoho_receive_id, 'deleted in the system')
    on conflict (zoho_receive_id) do update set project = excluded.project;
  end if;
  -- Earlier approved fixes made against this entry go with it, so the balance is exactly as if it was never entered.
  delete from public.documents where corrects_document = d.id;
  delete from public.documents where id = d.id;
end $$;
revoke execute on function public._remove_document(uuid) from public, anon, authenticated;

-- Ask to delete (or, for the admin, delete now). Returns 'deleted' or 'asked'.
create or replace function public.delete_entry(doc_id uuid, why text, note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  d public.documents;
  snap jsonb;
begin
  select * into d from public.documents where id = doc_id;
  if d.id is null then raise exception 'The entry no longer exists'; end if;
  if not public.is_admin() and d.site_id is distinct from public.my_site_id() then raise exception 'Not your site'; end if;
  if d.kind in ('opening', 'correction') then raise exception 'This kind of entry cannot be deleted'; end if;
  snap := jsonb_build_object('doc', to_jsonb(d), 'lines',
    coalesce((select jsonb_agg(jsonb_build_object('item_id', m.item_id, 'qty', m.qty, 'subphase', m.subphase)) from public.movements m where m.document_id = d.id), '[]'::jsonb));
  insert into public.correction_requests (site_id, kind, document_id, changes, item_id, from_qty, to_qty, reason, note, created_by, status, decided_by, decided_at)
  values (d.site_id, 'delete', d.id, snap,
          coalesce((select m.item_id from public.movements m where m.document_id = d.id limit 1), 0), 0, 0, why, note, auth.uid(),
          case when public.is_admin() then 'approved' else 'pending' end,
          case when public.is_admin() then auth.uid() end,
          case when public.is_admin() then now() end);
  if public.is_admin() then perform public._remove_document(d.id); return 'deleted'; end if;
  return 'asked';
end $$;
revoke execute on function public.delete_entry(uuid, text, text) from public, anon;
grant execute on function public.delete_entry(uuid, text, text) to authenticated;

-- The admin approves a delete the same way as any other fix.
create or replace function public.decide_correction(request_id uuid, approve boolean, decision text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.correction_requests;
  line public.movements;
  doc public.documents;
  doc_id uuid;
  change numeric;
  c jsonb;
  l jsonb;
  on_date date := (now() at time zone 'Africa/Nairobi')::date;
begin
  if not public.is_admin() then raise exception 'Only the admin can decide corrections'; end if;
  select * into r from public.correction_requests where id = request_id for update;
  if r.id is null then raise exception 'Correction not found'; end if;
  if r.status <> 'pending' then raise exception 'Already decided'; end if;

  if approve and r.kind = 'delete' then
    if r.document_id is null then raise exception 'The entry was already removed'; end if;
    perform public._remove_document(r.document_id);
  elsif approve and r.kind = 'edit' then
    select * into doc from public.documents where id = r.document_id for update;
    if doc.id is null then raise exception 'The original entry no longer exists'; end if;
    c := coalesce(r.changes -> 'doc', '{}'::jsonb);
    if c ? 'doc_date' and (c -> 'doc_date' ->> 1)::date > (now() at time zone 'Africa/Nairobi')::date then
      raise exception 'The new date is in the future';
    end if;
    update public.documents set
      doc_date      = case when c ? 'doc_date' then (c -> 'doc_date' ->> 1)::date else doc_date end,
      doc_time      = case when c ? 'doc_time' then nullif(c -> 'doc_time' ->> 1, '')::time else doc_time end,
      ref_no        = case when c ? 'ref_no' then nullif(c -> 'ref_no' ->> 1, '') else ref_no end,
      card_no       = case when c ? 'card_no' then nullif(c -> 'card_no' ->> 1, '') else card_no end,
      party         = case when c ? 'party' then nullif(c -> 'party' ->> 1, '') else party end,
      activity      = case when c ? 'activity' then nullif(c -> 'activity' ->> 1, '') else activity end,
      gemba         = case when c ? 'gemba' then nullif(c -> 'gemba' ->> 1, '') else gemba end,
      supervisor    = case when c ? 'supervisor' then nullif(c -> 'supervisor' ->> 1, '') else supervisor end,
      authorised_by = case when c ? 'authorised_by' then nullif(c -> 'authorised_by' ->> 1, '') else authorised_by end
    where id = doc.id
    returning * into doc;
    -- The lines follow the paper: same date, and on a card the same gemba.
    update public.movements set move_date = doc.doc_date where document_id = doc.id;
    if c ? 'gemba' and doc.kind = 'issue' then
      update public.movements set subphase = doc.gemba where document_id = doc.id;
    end if;
    for l in select * from jsonb_array_elements(coalesce(r.changes -> 'lines', '[]'::jsonb)) loop
      update public.movements set
        item_id = coalesce((l ->> 'to_item')::bigint, item_id),
        qty     = coalesce((l ->> 'to_qty')::numeric, qty)
      where id = (l ->> 'movement_id')::bigint and document_id = doc.id
      returning * into line;
      if line.id is not null then
        insert into public.site_items (site_id, item_id, first_seen) values (line.site_id, line.item_id, line.move_date)
        on conflict (site_id, item_id) do nothing;
      end if;
    end loop;
  elsif approve then
    if r.kind = 'fix' then
      select * into line from public.movements where id = r.movement_id;
      if line.id is null then raise exception 'The original line no longer exists'; end if;
      -- Stock change needed so the line counts as to_qty instead of from_qty.
      change := case when line.kind in ('issue', 'transfer_out') then r.from_qty - r.to_qty else r.to_qty - r.from_qty end;
      on_date := line.move_date;
    else
      change := r.to_qty - r.from_qty;
    end if;
    insert into public.documents (site_id, kind, doc_date, reason, corrects_document, created_by)
      values (r.site_id, 'correction', on_date, r.reason || coalesce(' · ' || r.note, ''), line.document_id, auth.uid())
      returning id into doc_id;
    insert into public.movements (document_id, item_id, qty, subphase, corrects_movement, corrects_kind)
      values (doc_id, r.item_id, change, line.subphase, line.id, coalesce(line.kind, 'recount'));
  end if;

  update public.correction_requests
     set status = case when approve then 'approved' else 'rejected' end,
         decision_note = decision, decided_by = auth.uid(), decided_at = now()
   where id = request_id;
end $$;

