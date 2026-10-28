-- Permissions: each person can edit or only read; procurement joins as a role; the admin chooses which pages
-- a person sees (null = every page their role normally has). Store keepers edit by default.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('store', 'assistant', 'admin', 'procurement'));
alter table public.profiles add column if not exists access text not null default 'edit';
alter table public.profiles drop constraint if exists profiles_access_check;
alter table public.profiles add constraint profiles_access_check check (access in ('edit', 'read'));
alter table public.profiles add column if not exists pages text[];
-- Procurement is read only.
update public.profiles set access = 'read' where role = 'procurement';

-- Only the admin changes someone's access or pages.
create or replace function public.guard_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() and (
       new.role is distinct from old.role or new.status is distinct from old.status
       or new.site_id is distinct from old.site_id or new.access is distinct from old.access
       or new.pages is distinct from old.pages) then
    raise exception 'Only the admin can change this';
  end if;
  return new;
end $$;

-- May the person signed in change anything? (Admins always; others when their access is "edit".)
create or replace function public.can_edit()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.role = 'admin' or (p.access = 'edit' and p.role <> 'procurement' and p.status = 'approved')
                   from public.profiles p where p.id = auth.uid()), false)
$$;
revoke execute on function public.can_edit() from public, anon;
grant execute on function public.can_edit() to authenticated;

-- Read-only people can look, never write.
drop policy if exists "add documents" on public.documents;
create policy "add documents" on public.documents for insert to authenticated
  with check (site_id = public.my_site_id() and created_by = auth.uid() and public.can_edit());
drop policy if exists "remove own unsubmitted" on public.documents;
create policy "remove own unsubmitted" on public.documents for delete to authenticated
  using (created_by = auth.uid() and site_id = public.my_site_id() and public.can_edit()
    and not exists (select 1 from public.day_submissions s where s.site_id = documents.site_id and s.day = documents.doc_date));
drop policy if exists "add movements" on public.movements;
create policy "add movements" on public.movements for insert to authenticated
  with check (site_id = public.my_site_id() and public.can_edit()
    and exists (select 1 from public.documents d where d.id = movements.document_id and d.created_by = auth.uid()));
drop policy if exists "ask for a correction" on public.correction_requests;
create policy "ask for a correction" on public.correction_requests for insert to authenticated
  with check (site_id = public.my_site_id() and created_by = auth.uid() and status = 'pending' and public.can_edit());
drop policy if exists "submit day" on public.day_submissions;
create policy "submit day" on public.day_submissions for insert to authenticated
  with check (site_id = public.my_site_id() and submitted_by = auth.uid() and public.can_edit());
drop policy if exists "set reorder level" on public.site_items;
create policy "set reorder level" on public.site_items for update to authenticated
  using (site_id = public.my_site_id() and public.can_edit()) with check (site_id = public.my_site_id() and public.can_edit());
drop policy if exists "add draft" on public.drafts;
create policy "add draft" on public.drafts for insert to authenticated with check (site_id = public.my_site_id() and created_by = auth.uid() and public.can_edit());
drop policy if exists "add drafts" on public.drafts;
drop policy if exists "edit site draft" on public.drafts;
create policy "edit site draft" on public.drafts for update to authenticated using (site_id = public.my_site_id() and public.can_edit()) with check (site_id = public.my_site_id());

-- The register and delete functions check it too.
create or replace function public.save_register(on_date date, store text, items jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  site uuid := public.my_site_id();
  reg uuid;
  it jsonb;
  mv bigint;
  made boolean := false;
begin
  if site is null then raise exception 'No site'; end if;
  if not public.can_edit() then raise exception 'You can only view. Ask the admin for edit access.'; end if;
  if on_date > (now() at time zone 'Africa/Nairobi')::date then raise exception 'That date is in the future'; end if;
  select id into reg from public.documents
   where site_id = site and kind = 'issue' and ref_no is null and doc_date = on_date
   order by created_at limit 1;
  if reg is null then
    insert into public.documents (site_id, kind, doc_date, authorised_by, created_by)
      values (site, 'issue', on_date, nullif(store, ''), auth.uid()) returning id into reg;
    made := true;
  elsif exists (select 1 from public.day_submissions s where s.site_id = site and s.day = on_date) then
    raise exception 'This day has already been submitted. Use a correction instead.';
  end if;
  for it in select * from jsonb_array_elements(items) loop
    if coalesce((it ->> 'qty')::numeric, 0) <= 0 then continue; end if;
    select id into mv from public.movements where document_id = reg and item_id = (it ->> 'item_id')::bigint order by id limit 1;
    if mv is not null then
      update public.movements set qty = qty + (it ->> 'qty')::numeric where id = mv;
    else
      insert into public.movements (document_id, item_id, qty) values (reg, (it ->> 'item_id')::bigint, (it ->> 'qty')::numeric);
    end if;
  end loop;
  return case when made then 'new' else 'added' end;
end $$;
revoke execute on function public.save_register(date, text, jsonb) from public, anon;
grant execute on function public.save_register(date, text, jsonb) to authenticated;

create or replace function public.delete_entry(doc_id uuid, why text, note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  d public.documents;
  snap jsonb;
begin
  select * into d from public.documents where id = doc_id;
  if d.id is null then raise exception 'The entry no longer exists'; end if;
  if not public.can_edit() then raise exception 'You can only view. Ask the admin for edit access.'; end if;
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


drop policy if exists "dismiss" on public.incoming_dismissed;
create policy "dismiss" on public.incoming_dismissed for insert to authenticated with check (site_id = public.my_site_id() and dismissed_by = auth.uid() and public.can_edit());
