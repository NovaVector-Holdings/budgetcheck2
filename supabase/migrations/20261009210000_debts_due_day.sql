-- Option C (SME/CEO ruling, 2026-10-09): give a debt a monthly due day.
--
-- Scope of the ruling, restated so the schema cannot drift from it:
--   * monthly day-of-month ONLY (1-31). Other cadences stay unsupported, which
--     the plan reports as incomplete rather than approximating a date.
--   * NO default and NO backfill. Every existing row keeps due_day NULL, and
--     NULL means "honestly unknown" -- it is never read as "no due date".
--   * the next occurrence is resolved at RUNTIME (src/lib/due-day.ts) and fed to
--     the existing decision engine as an ISO date. A one-off due date is NEVER
--     stored on the row, so nothing here can go stale when a month rolls over.
--   * days 29-31 are valid; the runtime clamps them to the month's real length.
--
-- Additive and idempotent: safe to re-run. No new policy, grant, index or table
-- is needed -- the existing table-level grant and the FOR ALL row-level-security
-- policy on public.debts already cover a new column.
--
-- NOT auto-applied by the Lovable git sync. Apply it through the Lovable chat or
-- the Supabase SQL editor, then regenerate src/integrations/supabase/types.ts
-- (the debts due_day lines there are hand-matched until the column exists).
--
-- Rollback:  ALTER TABLE public.debts DROP COLUMN due_day;

ALTER TABLE public.debts
  ADD COLUMN IF NOT EXISTS due_day smallint;

-- Drop-then-add so re-running the migration is harmless.
ALTER TABLE public.debts
  DROP CONSTRAINT IF EXISTS debts_due_day_check;

ALTER TABLE public.debts
  ADD CONSTRAINT debts_due_day_check
  CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31);
