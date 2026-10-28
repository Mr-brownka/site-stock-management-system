-- One Material Issuance Register a day: saving the register for a day that already has one adds to it
-- (same item: the quantity adds up; a new item: a new line). Returns 'added' or 'new'.
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
