-- Admin loads a new site's first count (opening stock) from an uploaded list checked against Zoho.
-- Lines: [{ "zoho_item_id": "...", "name": "...", "unit": "...", "qty": 12 }] or [{ "item_id": 5, "qty": 12 }].
-- Each Zoho item is found in Ostock (by its Zoho link, then by name) or added; then one opening entry, the
-- stock take record and the site's stock take list are written together. Refused if the site already has entries.
create or replace function public.admin_opening_count(p_site uuid, p_date date, p_counted_by text, p_lines jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  l jsonb; it int; doc uuid; take uuid; n int := 0; pos int := 0; nm text; un text; zid text; q numeric;
begin
  if not public.is_admin() then raise exception 'Only the admin can load a site''s first count.'; end if;
  if not exists (select 1 from public.sites where id = p_site) then raise exception 'Site not found'; end if;
  if exists (select 1 from public.documents where site_id = p_site) then
    raise exception 'This site already has entries. Use a normal stock take to correct its balances.';
  end if;
  insert into public.documents (site_id, kind, doc_date, reason, party, created_by)
  values (p_site, 'opening', p_date, 'First stock take', nullif(trim(p_counted_by), ''), auth.uid()) returning id into doc;
  insert into public.stock_takes (site_id, count_date, counted_by, is_first, status, document_id, created_by)
  values (p_site, p_date, nullif(trim(p_counted_by), ''), true, 'confirmed', doc, auth.uid()) returning id into take;
  for l in select * from jsonb_array_elements(p_lines) loop
    q := coalesce((l->>'qty')::numeric, 0);
    if q < 0 then raise exception 'A quantity is below 0 (%).', coalesce(l->>'name', 'item'); end if;
    it := (l->>'item_id')::int;
    zid := nullif(l->>'zoho_item_id', '');
    nm := nullif(trim(l->>'name'), '');
    un := nullif(trim(l->>'unit'), '');
    if it is null and zid is not null then select item_id into it from public.zoho_item_map where zoho_item_id = zid; end if;
    if it is null and nm is not null then select id into it from public.items where lower(name) = lower(nm) limit 1; end if;
    if it is null then
      if nm is null then raise exception 'A line has no item.'; end if;
      insert into public.items (name, unit, in_zoho) values (nm, un, zid is not null) returning id into it;
    end if;
    if zid is not null then
      insert into public.zoho_item_map (zoho_item_id, item_id, zoho_name, zoho_unit) values (zid, it, coalesce(nm, ''), un)
      on conflict (zoho_item_id) do nothing;
      update public.items set in_zoho = true where id = it and in_zoho is distinct from true;
    end if;
    if exists (select 1 from public.stock_take_lines where stock_take_id = take and item_id = it) then
      update public.stock_take_lines set qty = qty + q where stock_take_id = take and item_id = it;
      update public.movements set qty = qty + q where document_id = doc and item_id = it;
      continue;
    end if;
    insert into public.stock_take_lines (stock_take_id, item_id, qty) values (take, it, q);
    if q > 0 then insert into public.movements (document_id, item_id, qty) values (doc, it, q); end if;
    insert into public.site_checklist (site_id, item_id, position) values (p_site, it, pos) on conflict (site_id, item_id) do nothing;
    pos := pos + 1; n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.admin_opening_count(uuid, date, text, jsonb) from public, anon;
grant execute on function public.admin_opening_count(uuid, date, text, jsonb) to authenticated;
