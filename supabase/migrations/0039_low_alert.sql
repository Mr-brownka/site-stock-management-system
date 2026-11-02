-- Needs attention: the store can take an item off the low-stock list by hand (it comes back if they turn it on again).
alter table public.site_items add column if not exists low_alert boolean not null default true;
create or replace view public.stock_balances as
 SELECT si.site_id, si.item_id, i.name, i.unit, si.reorder_level, si.first_seen,
    COALESCE(sum(m.delta), 0::numeric) AS balance,
    count(DISTINCT m.document_id) FILTER (WHERE m.kind = 'delivery'::text) AS deliveries,
    si.low_alert
   FROM site_items si
     JOIN items i ON i.id = si.item_id
     LEFT JOIN movements m ON m.site_id = si.site_id AND m.item_id = si.item_id
  GROUP BY si.site_id, si.item_id, i.name, i.unit, si.reorder_level, si.first_seen, si.low_alert;
