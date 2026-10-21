-- Which items are in Zoho. The original item list (loaded on day one) came from Zoho;
-- anything added by hand since then is not, until Zoho has an item with the same name
-- or the admin matches it. Bohari flips the flag by itself when that happens.
alter table public.items add column if not exists in_zoho boolean not null default true;

-- Items added by hand after the first load and never matched to a Zoho item.
update public.items i set in_zoho = false
where i.created_at > (select min(created_at) from public.items) + interval '1 hour'
  and not exists (select 1 from public.zoho_item_map m where m.item_id = i.id);

-- From now on a new item starts as "not in Zoho".
alter table public.items alter column in_zoho set default false;

-- Matched to a Zoho item (by the sync or by the admin) → it is in Zoho.
create or replace function public.mark_item_in_zoho() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.item_id is not null then
    update public.items set in_zoho = true where id = new.item_id and not in_zoho;
  end if;
  return new;
end $$;
drop trigger if exists zoho_item_map_marks_item on public.zoho_item_map;
create trigger zoho_item_map_marks_item after insert or update of item_id on public.zoho_item_map
  for each row execute function public.mark_item_in_zoho();
