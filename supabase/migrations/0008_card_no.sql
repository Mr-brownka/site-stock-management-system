-- The "Card No" box on the paper Material Withdrawal Card (the red printed number is the Code, kept in ref_no).
alter table public.documents add column if not exists card_no text;
