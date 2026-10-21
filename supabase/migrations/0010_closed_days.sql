-- Missed days: a day can be submitted as "closed" (holiday or no work) with a reason.
alter table public.day_submissions add column if not exists closed_reason text;
