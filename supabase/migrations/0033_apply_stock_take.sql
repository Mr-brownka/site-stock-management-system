-- Saving a stock take (not the first) sets each counted item's balance to the count.
-- The differences against the balance at the end of the count date go in as one 'correction' document.
create or replace function public.apply_stock_take(take uuid) returns int language plpgsql security definer set search_path = public as $$
declare t public.stock_takes; site uuid := public.my_site_id(); doc uuid; l record; have numeric; n int := 0;
begin
  if not public.can_edit() then raise exception 'You can only view. Ask the admin for edit access.'; end if;
  select * into t from public.stock_takes where id = take and site_id = site;
  if t.id is null then raise exception 'Stock take not found'; end if;
  if t.status = 'confirmed' then return 0; end if;
  for l in select item_id, qty from public.stock_take_lines where stock_take_id = take loop
    select coalesce(sum(m.delta), 0) into have from public.movements m where m.site_id = site and m.item_id = l.item_id and m.move_date <= t.count_date;
    if l.qty - have = 0 then continue; end if;
    if doc is null then insert into public.documents (site_id, kind, doc_date, reason, party, created_by) values (site, 'correction', t.count_date, 'Stock take', t.counted_by, auth.uid()) returning id into doc; end if;
    insert into public.movements (document_id, item_id, qty) values (doc, l.item_id, l.qty - have);
    n := n + 1;
  end loop;
  update public.stock_takes set status = 'confirmed', document_id = coalesce(doc, document_id) where id = take;
  return n;
end $$;
grant execute on function public.apply_stock_take(uuid) to authenticated;
