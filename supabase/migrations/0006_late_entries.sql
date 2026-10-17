-- Late entries: after a day is submitted, the store can still add an entry
-- that arrived late (a delivery, card, return or transfer). It is saved on that
-- day and shown as "late" (created after the submission time). Entries on a
-- submitted day still cannot be removed; mistakes are fixed with a correction.
create or replace function public.block_locked_day()
returns trigger language plpgsql set search_path = public as $$
begin
  return new;
end $$;
