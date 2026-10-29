-- Edit the day's register while the day is not submitted: the sheet as typed becomes the register
-- (changed quantities, new items, items taken off). Submitted days go through Fix an error instead.
create or replace function public.set_register(on_date date, store text, items jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  site uuid := public.my_site_id();
  reg uuid;
  it jsonb;
  mv bigint;
  keep bigint[] := '{}';
  q numeric;
begin
  if site is null then raise exception 'No site'; end if;
  if not public.can_edit() then raise exception 'You can only view. Ask the admin for edit access.'; end if;
  if exists (select 1 from public.day_submissions s where s.site_id = site and s.day = on_date) then
    raise exception 'This day has already been submitted. Use Fix an error instead.';
  end if;
  select id into reg from public.documents
   where site_id = site and kind = 'issue' and ref_no is null and doc_date = on_date order by created_at limit 1;
  if reg is null then return public.save_register(on_date, store, items); end if;
  update public.documents set authorised_by = coalesce(nullif(store, ''), authorised_by) where id = reg;
  for it in select * from jsonb_array_elements(items) loop
    q := coalesce((it ->> 'qty')::numeric, 0);
    if q <= 0 then continue; end if;
    mv := null;
    select id into mv from public.movements where document_id = reg and item_id = (it ->> 'item_id')::bigint and not (id = any(keep)) order by id limit 1;
    if mv is not null then update public.movements set qty = q where id = mv;
    else insert into public.movements (document_id, item_id, qty) values (reg, (it ->> 'item_id')::bigint, q) returning id into mv;
    end if;
    keep := keep || mv;
  end loop;
  if exists (select 1 from public.movements r join public.movements m on m.id = r.return_of
              where m.document_id = reg and not (m.id = any(keep))) then
    raise exception 'An item you took off has returns against it. Keep it on the register, or delete the return first.';
  end if;
  if exists (select 1 from public.movements m where m.document_id = reg and m.qty < coalesce((select sum(r.qty) from public.movements r where r.return_of = m.id), 0)) then
    raise exception 'A quantity is now less than what was already returned against it.';
  end if;
  delete from public.movements where document_id = reg and not (id = any(keep));
  if not exists (select 1 from public.movements where document_id = reg) then
    delete from public.documents where id = reg;
    return 'emptied';
  end if;
  return 'saved';
end $$;
revoke execute on function public.set_register(date, text, jsonb) from public, anon;
grant execute on function public.set_register(date, text, jsonb) to authenticated;
