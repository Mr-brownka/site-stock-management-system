-- Undo the Zoho over-import of 21 Oct 2026 (old receives from Nov 2025 – Aug 2026 were pulled in).
-- Safe to run once. Everything happens together or not at all.
begin;

-- 1. Items that ONLY the Zoho import put on a site's list:
--    no Bohari entry of their own at that site, and never counted in a stock take there.
create temp table _zoho_only_items on commit drop as
select si.site_id, si.item_id
from public.site_items si
where exists (select 1 from public.movements m join public.documents d on d.id = m.document_id
              where d.source = 'zoho' and m.site_id = si.site_id and m.item_id = si.item_id)
  and not exists (select 1 from public.movements m join public.documents d on d.id = m.document_id
                  where coalesce(d.source, 'bohari') <> 'zoho' and m.site_id = si.site_id and m.item_id = si.item_id)
  and not exists (select 1 from public.stock_take_lines l join public.stock_takes t on t.id = l.stock_take_id
                  where t.site_id = si.site_id and l.item_id = si.item_id);

-- 2. Remove every Zoho delivery (their stock lines go with them automatically).
delete from public.documents where source = 'zoho';

-- 3. Take those items back off the site lists.
delete from public.site_items si using _zoho_only_items z
where si.site_id = z.site_id and si.item_id = z.item_id;

-- 4. Clear Zoho's waiting lists, and start the count again.
delete from public.zoho_pending;
delete from public.zoho_seen;

-- 5. From now on, only bring in receives dated on or after the day you choose (today).
alter table public.zoho_connections add column if not exists import_from date;
update public.zoho_connections set imported = 0, last_error = null, import_from = date '2026-10-21';

commit;

-- Check: should show 0 Zoho deliveries.
select (select count(*) from public.documents where source = 'zoho') as zoho_deliveries_left;
