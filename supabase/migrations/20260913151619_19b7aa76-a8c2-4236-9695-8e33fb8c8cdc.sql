-- Accounts the user tracks manually (checking, savings, credit card, etc.)
CREATE TABLE public.mm_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'checking' CHECK (kind IN ('checking','savings','credit','cash','other')),
  institution text,
  current_balance numeric NOT NULL DEFAULT 0,
  credit_limit numeric,
  balance_as_of date,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mm_accounts TO authenticated;
GRANT ALL ON public.mm_accounts TO service_role;
ALTER TABLE public.mm_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own accounts" ON public.mm_accounts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Money set aside and excluded from "available" until explicitly tapped
CREATE TABLE public.mm_reserved_funds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  purpose text,
  tapped_amount numeric NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mm_reserved_funds TO authenticated;
GRANT ALL ON public.mm_reserved_funds TO service_role;
ALTER TABLE public.mm_reserved_funds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own reserved funds" ON public.mm_reserved_funds FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Hard ceilings on a leaky category, plus the instrument limit backing them
CREATE TABLE public.mm_spending_caps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL,
  cap_amount numeric NOT NULL,
  period text NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly','cycle')),
  instrument_label text,
  instrument_limit numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, category)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mm_spending_caps TO authenticated;
GRANT ALL ON public.mm_spending_caps TO service_role;
ALTER TABLE public.mm_spending_caps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own caps" ON public.mm_spending_caps FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Saved transaction imports, kept so later uploads can be diffed against them
CREATE TABLE public.mm_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.mm_accounts(id) ON DELETE SET NULL,
  file_name text,
  period_start date,
  period_end date,
  txn_count integer NOT NULL DEFAULT 0,
  txns jsonb NOT NULL DEFAULT '[]'::jsonb,
  column_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mm_imports TO authenticated;
GRANT ALL ON public.mm_imports TO service_role;
ALTER TABLE public.mm_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own imports" ON public.mm_imports FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Generated artifacts: dashboards, payoff schedules, checklists, comparisons, phase trackers
CREATE TABLE public.mm_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('cash_flow','payoff_schedule','checklist','budget_actual','savings_phases')),
  title text NOT NULL,
  takeaway text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  check_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_import_id uuid REFERENCES public.mm_imports(id) ON DELETE SET NULL,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mm_artifacts TO authenticated;
GRANT ALL ON public.mm_artifacts TO service_role;
ALTER TABLE public.mm_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own artifacts" ON public.mm_artifacts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- User-extensible reclassification rules on raw transaction descriptions
CREATE TABLE public.mm_pattern_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pattern text NOT NULL,
  classify_as text NOT NULL,
  note text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mm_pattern_rules TO authenticated;
GRANT ALL ON public.mm_pattern_rules TO service_role;
ALTER TABLE public.mm_pattern_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own pattern rules" ON public.mm_pattern_rules FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Funding-priority overrides stated by the user ("the car is my only way to work")
CREATE TABLE public.mm_priority_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ref_kind text NOT NULL CHECK (ref_kind IN ('expense','debt','goal','custom')),
  ref_id text NOT NULL,
  label text NOT NULL,
  tier integer NOT NULL CHECK (tier BETWEEN 1 AND 7),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ref_kind, ref_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mm_priority_overrides TO authenticated;
GRANT ALL ON public.mm_priority_overrides TO service_role;
ALTER TABLE public.mm_priority_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own priority overrides" ON public.mm_priority_overrides FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Conversational sessions with persistent state across visits
CREATE TABLE public.mm_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Money meeting',
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mm_sessions TO authenticated;
GRANT ALL ON public.mm_sessions TO service_role;
ALTER TABLE public.mm_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own sessions" ON public.mm_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.mm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.mm_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mm_messages TO authenticated;
GRANT ALL ON public.mm_messages TO service_role;
ALTER TABLE public.mm_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own messages" ON public.mm_messages FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX mm_messages_session_idx ON public.mm_messages (session_id, created_at);
CREATE INDEX mm_imports_user_idx ON public.mm_imports (user_id, created_at DESC);
CREATE INDEX mm_artifacts_user_idx ON public.mm_artifacts (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER mm_accounts_updated_at BEFORE UPDATE ON public.mm_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER mm_reserved_updated_at BEFORE UPDATE ON public.mm_reserved_funds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER mm_caps_updated_at BEFORE UPDATE ON public.mm_spending_caps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER mm_artifacts_updated_at BEFORE UPDATE ON public.mm_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER mm_sessions_updated_at BEFORE UPDATE ON public.mm_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
