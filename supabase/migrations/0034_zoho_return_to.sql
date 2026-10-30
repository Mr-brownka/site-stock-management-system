-- Zoho sign-in returns people to the address they started from.
alter table public.zoho_states add column if not exists return_to text;
