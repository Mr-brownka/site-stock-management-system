-- Delivery: who received it. Withdrawal card: the "Card No" box (the red number stays in ref_no as the card's Code).
alter table public.documents
  add column if not exists received_by text,
  add column if not exists card_no text;
