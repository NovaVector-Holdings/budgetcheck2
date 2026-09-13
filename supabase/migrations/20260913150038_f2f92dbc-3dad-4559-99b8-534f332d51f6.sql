ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pay_frequency text,
  ADD COLUMN IF NOT EXISTS next_pay_date date,
  ADD COLUMN IF NOT EXISTS second_pay_date date,
  ADD COLUMN IF NOT EXISTS income_low_estimate numeric,
  ADD COLUMN IF NOT EXISTS cash_on_hand numeric,
  ADD COLUMN IF NOT EXISTS spending_buffer numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_as_of date,
  ADD COLUMN IF NOT EXISTS budget_method text NOT NULL DEFAULT 'fifty_thirty_twenty';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pay_frequency_check
  CHECK (pay_frequency IS NULL OR pay_frequency IN ('weekly','biweekly','semimonthly','monthly','irregular'));

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_budget_method_check
  CHECK (budget_method IN ('fifty_thirty_twenty','zero_based','envelope'));

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_spending_buffer_check
  CHECK (spending_buffer >= 0);