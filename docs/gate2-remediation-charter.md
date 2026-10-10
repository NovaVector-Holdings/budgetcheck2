# Gate 2 Remediation: Charter, Implementation Record, and Debt-Timing Impact

CEO / PRODUCT RULING "GATE 2 RESULT + FINAL REMEDIATION PATH" (2026-10-09). Gate 2 current round:
HOLD. The d5ad524f / 83e294b2 stimulus is RETIRED (kept in `docs/gate2-stimulus/` as historical
evidence only; never reused). PR #12 stays OPEN / UNMERGED. Gate 3 production port: NOT authorized.

This document is the standing workstream-closure record: scope, acceptance, proof, exit, deferred
(Section 1), what was built and proven in this pass (Section 2), and the data-model / UI impact of
debt timing that the ruling requires BEFORE any migration (Section 3). Section 4 lists the rulings
this workstream cannot close without.

## 1. Charter

**Scope (bounded).** Ruling items 2-5 and the prototype half of 8:

1. A PLAN INCOMPLETE state on the Overview (item 2).
2. Debt timing resolved for the prototype as a requirement and an implementation plan (item 3).
3. Balance / remainder hierarchy cleanup: one balance, with its Update control inside the
   calculation (item 4).
4. One next focus per state (item 5).
5. A healthy COMPLETE-plan proof and an incomplete-plan proof for CEO approval (item 8).
6. The corrected research instrument, frozen only after the proofs are approved (items 6, 7).

**Acceptance.**

- An incomplete plan never shows the normal "Estimated remaining". The incomplete message is the
  dominant element; any known-item dollar figure is labeled PARTIAL, states that required debt
  minimums are not included, and is visually subordinate.
- The visible calculation provably sums to the engine's own remainder in every state.
- Exactly one next focus is shown in every computed state (incomplete / shortfall / healthy /
  empty); no free-text "Your focus" line. The setup state is a different thing: it lists what is
  still missing, by design.
- One balance figure, with Update inside the calculation; the Update control changes the number the
  engine actually uses.
- 0 axe violations (WCAG 2.0/2.1 A + AA), both themes, desktop and 390px mobile; no horizontal
  overflow.
- PR #10 locked surface unchanged: `decision-engine.ts`, `grounding.ts`, `ci.yml` untouched;
  157/157 grounding and 13/13 decision-engine proofs still pass.

**Proof required.** `scripts/prove-plan-status.ts` (deterministic, network-free, drives the real
engine); fixture-driven captures of every state in both themes and viewports; interaction flows;
axe results; build / typecheck / scoped lint.

**Exit condition.** The workstream closes at the ruling's Definition of Done: (1) incomplete-plan
behavior implemented; (2) debt-timing requirement explicitly resolved for the prototype; (3)
balance / remainder hierarchy cleaned up; (4) exact healthy and incomplete proofs APPROVED; (5)
corrected instrument frozen; (6) five clean participants complete the study; (7) one official score
issued. No additional design round is automatic. If mandatory D fails again, STOP iterating on
microcopy and return for a product-strategy decision.

**Deferred (not in this workstream).** Any production port or merge of the unvalidated Overview;
any production schema change; weekly / biweekly / semimonthly debt payment cadences; recurring-bill
roll-forward and overdue-bill handling (Section 3.6); the Weekly Check-in / assistant wording
(Section 4, ruling 6); repo-wide lint cleanup; Gate 3 readiness docs run as a separate,
non-production track.

## 2. Implemented in this pass (UI-only; no migration, no engine change)

| Area | Change |
|---|---|
| `src/lib/plan-status.ts` (new) | Pure `derivePlanStatus(snapshot, engineInput, ctx)` -> `setup / incomplete / shortfall / healthy / empty`. "Incomplete" is exactly `funding.debtsWithUnknownTiming.length > 0`, the engine's own list of required minimums it refuses to place without guessing. No new money math. `EngineSnapshot.complete` is deliberately not reused (it means setup-complete). |
| `src/lib/mm.ts` | `balanceSource()` / `spendableAccounts()`: names where the engine's balance comes from and tells "no balance on file" apart from a real $0 (`buildEngineInput` collapses an absent balance to 0). |
| `src/components/overview/paycheck-briefing.tsx` | Rewritten around the states. Incomplete: banner "Debt-payment timing is incomplete, so this paycheck plan is not final.", the unplaced minimums listed with their total, one next focus with "Add due dates", and a dashed, muted "Partial calculation · known items only" block ending in "Known-item remainder (partial)" with "Required debt minimums ($X) are not included yet, so this is not the final remainder." Complete: itemized Keep available, reserved funds / inflows / clamp as their own rows, one "Next focus" box. |
| `src/components/overview/balance-update.tsx` (new) | Update control inside the Balance line (inline form, focus managed, returns focus on close). Replaces the standalone "Current balance" card. |
| `src/routes/_authenticated/overview.tsx` | Removed the standalone balance card and the free-text "Your focus" line. |
| `src/components/paycheck-cards.tsx` | Removed the now-orphaned `CashOnHandEditor`. |
| `scripts/prove-plan-status.ts` + `npm run validate:plan-status` | 30 proof cases (see below). Not wired into CI: `ci.yml` edits take effect immediately and need CEO sign-off. |

**Defects in the retired design found and fixed while doing this** (each was visible in the
retired stimulus or one step behind it):

- The old editor invalidated query keys the money state does not read, so a saved balance did not
  refresh the briefing until a reload. Now invalidates `["profile", userId]` plus the Money Meeting
  keys.
- With spendable accounts on file the engine ignores `profile.cash_on_hand`, so the old "Update"
  silently changed nothing. When accounts supply the balance, the control now says so and links to
  the accounts; only the buffer (which lives on the profile) stays editable there.
- With no balance on file the engine used $0 and showed a healthy-looking briefing. That is now a
  setup state with the balance entry inline. (When a balance IS on file but payday or cadence is
  missing, the Update control stays available there too; the review caught that the first version
  of this change had dropped it.)
- When balance < buffer the old rows did not add up to the remainder (the engine floors at $0). The
  rows now include an explicit "counted as $0" line, and a sweep proof asserts they sum to the
  engine's remainder in all 450 combinations tried.
- The retired shortfall box used `text-destructive` on a destructive tint (4.43:1 light, 4.15:1
  dark; WCAG AA needs 4.5:1). Now ink text on the tint.

**Verified.**

- `npm run validate:plan-status` 30/30; `validate:grounding` 157/157; `validate:decision-engine`
  13/13 (unchanged). The plan-status proof was mutation-tested: disabling the incomplete trigger,
  dropping the clamp row, or letting a known shortfall outrank incomplete each fails the proof.
- `npm run build` passes; `tsc --noEmit` shows only the existing `src/routes/__root.tsx` error that
  is also present at baseline; scoped ESLint is clean on every file this pass owns.
- 56 fixture captures (14 states x light/dark x desktop 1440 / mobile 390): 0 axe violations, 0
  horizontal overflow, 0 page errors, 0 unmocked network requests. 12/12 interaction flows pass
  (update open / cancel / save and recompute, accounts-backed update, first-time balance entry,
  and Update staying available in the setup state when only payday is missing).

**How the captures were made.** A local dev server (`localhost:8080`) with every Supabase request
fulfilled from in-memory fixtures and anything unmocked aborted: no credentials, no live database,
nothing read from or written to the prototype project. "Today" is pinned to 2026-10-09. The fixture
scenario mirrors the retired stimulus (balance $640, buffer $100, two bills in window, $875 saved,
$2,790 owed, $115/mo of minimums) with the dates advanced to the current pay cycle.

## 3. Debt timing: data-model and UI impact (no migration introduced)

### 3.1 Where the product stands

- `debts` has `minimum_payment` (nullable) but NO due date, due day, frequency, or next-payment
  field. `buildEngineInput` in `src/lib/mm.ts` hard-codes every debt's `dueDate: null`, so every debt with a positive
  minimum is "unknown timing" today and any account with such a debt is an INCOMPLETE plan.
- The engine already does the placing: `buildFundingPlan` puts a debt in the plan when its
  `dueDate` is a real ISO date inside `[today, next_pay_date]` (inclusive at both ends), excludes a
  real date outside the window without flagging it, and lists a debt with no usable date in
  `debtsWithUnknownTiming`. Proven in `scripts/prove-decision-engine.ts`. The ONLY blocker is
  that nothing ever supplies a date.
- The only debt-writing UI is `src/routes/_authenticated/debt.tsx`: an add form (name, balance,
  APR, optional minimum) and Log payment / Archive. There is no edit path for an existing debt's
  minimum, APR or timing.
- Consequence for this pass: the incomplete state works today, but its next focus ("Add the due
  date for ...") and its "Add due dates" button go to a page that cannot accept a due date yet.
  Until the capture below exists that instruction cannot be followed, and any account with a debt
  minimum can never leave the incomplete state. This branch is therefore NOT a candidate for any
  participant-facing or user-facing use until Section 3 lands; the proofs show the intended end
  state.

### 3.2 Minimum prototype implementation (recommended: Option C)

Supports exactly the three things the ruling names: debt minimum, due date / timing, inclusion in
the correct paycheck window.

| Requirement | What is needed |
|---|---|
| Debt minimum | Already stored (`minimum_payment`). Add an edit path (none exists). |
| Due date / timing | ONE additive nullable column: `ALTER TABLE public.debts ADD COLUMN due_day smallint CHECK (due_day BETWEEN 1 AND 31);` Monthly day-of-month. No default, no backfill, no new table / index / policy / grant (the existing row-level policy and grants cover it), reversible with `DROP COLUMN`. Existing rows stay NULL, so they stay honestly "unknown" until the person enters the day. |
| Inclusion in the right window | A small pure helper `nextOccurrenceOnOrAfter(dueDay, todayIso)` (UTC arithmetic; day 29-31 clamped to the month length) and that `dueDate: null` line becomes `dueDate = due_day ? nextOccurrenceOnOrAfter(due_day, todayIso) : null`. The engine is unchanged. |

**Why `due_day` and not a stored one-off date.** A stored `due_date` goes stale after it passes:
`hasUsableDueDate` stays true, the date is now outside the window, and the debt falls out of both
the plan AND the unknown list, leaving a healthy-looking plan with a missing required payment. That
is the exact failure the ruling targets. A due day resolved to its next occurrence is always on or
after today, so it cannot go stale, and NULL stays honestly unknown.

**Files (Option C).**

- `supabase/migrations/<timestamp>_debts_due_day.sql` (new)
- `src/integrations/supabase/types.ts` (regenerate, do not hand-edit)
- `src/lib/money.ts` (`Debt.due_day`)
- `src/lib/due-day.ts` (new helper) and the `dueDate: null` line in `buildEngineInput` (`src/lib/mm.ts`)
- `src/routes/_authenticated/debt.tsx`: due-day input on the add form, an edit path for existing
  debts (minimum and due day), and a "due the 15th" display
- `src/routes/_authenticated/money-meeting.tsx:209-220`: the assistant's hand-built debt payload
  passes the same computed date instead of `null` (two sites must change together)
- Wording only: `src/lib/grounding.ts` (comments / strings stating there is "no due-date column")
  and `src/lib/mm-chat.functions.ts:138-139` (prompt). These are PR #10 locked files; see ruling 6.
- `src/components/overview/paycheck-briefing.tsx`: per-debt "add due day" links (the incomplete
  state UI, already built; only the link targets deepen)
- New cases in `scripts/prove-decision-engine.ts` / `prove-grounding.ts` for the helper

### 3.3 Alternatives considered

- **A. No schema change: due day in browser `localStorage`.** Fast, no governance question, but
  not durable, not shared across devices, absent from the data export, and misleading as evidence
  about a durable product. Acceptable only for a moderated single-device usability check; not a
  shippable data model, and it would not satisfy "resolved for the prototype".
- **B. No schema change: link each debt to a recurring bill (`planned_expenses`, category debt).**
  Rejected. The link would be a name convention with no integrity, two sources of truth for the
  minimum, and the engine does not roll recurring bills forward, so after the first date passes the
  debt silently leaves the plan while looking "known". It needs the same roll-forward helper as C,
  so it is not smaller.

### 3.4 Known limits of C (stated, not hidden)

- Monthly only. A weekly / biweekly / semimonthly debt payment is not expressible; it stays unknown
  (incomplete) or is entered approximately. A later `payment_frequency` column extends C without
  redoing it.
- One occurrence per debt: a window exactly one month wide whose end falls on the due day under-
  counts one payment in a rare corner.
- `debt_payments` is not read, so a minimum already paid this cycle still counts until its due date
  passes (a conservative over-count that can show a spurious shortfall). Reading it is a separate
  product decision.
- A minimum due ON payday counts in this window (inclusive end, as for bills).

### 3.5 Classifier gaps that must be decided before the incomplete trigger ships to real users

- A paid-off, un-archived debt with a minimum and a $0 balance is still "unknown timing" (the Debt
  page reduces the balance on a logged payment but does not archive), so it would hold the plan
  incomplete forever. This pass follows the engine exactly and does NOT filter it.
- An active debt with balance > 0 but no minimum entered is in neither the plan nor the unknown list
  (the form calls the minimum "optional"), so it vanishes silently.

### 3.6 Same trust class, out of scope

Recurring bills with a stale stored `due_date`, and overdue unpaid bills, silently drop out of the
plan. Not addressed here; flagged so it is a decision, not a surprise.

### 3.7 Governance

The prototype has its own Supabase project (`.env.example`), and the production repo is
untouched. The migration FILE is what would later carry to production, so it is treated as a
governed schema change. It is not applied, committed, or pushed in this pass. It is also not
determinable from the repo whether pushing a migration file to this Lovable-connected branch
auto-applies it to the prototype database; that must be confirmed before any push.

### 3.8 Pre-existing data-loading risks that the incomplete state now depends on

Found by the independent review of this diff; neither is changed here.

- The money-state queries (`src/hooks/use-money-state.ts`) swallow errors (`data ?? []`). If the
  debts query fails, the briefing computes from "no debts" and shows a healthy, complete-looking
  plan with the required debt missing, which is the exact false-complete failure this work exists
  to prevent. A small fix (surface the error and show an error state instead of a figure) is
  proposed but not made, because it changes shared data loading.
- `loading` waits for profile, accounts, expenses, debts and goals but not reserved funds, caps or
  overrides, so the first paint can show a larger remainder before those arrive.

## 4. Rulings needed (default = what this pass assumed)

1. **Approve Option C** (additive `debts.due_day`, prototype project, migration file carried to
   production later under separate governance). Without it the healthy COMPLETE proof with debts
   cannot be produced and Definition-of-Done item 2 stays open. Alternative: a healthy stimulus
   with no debts is genuinely complete today, but it does not resolve debt timing.
2. **Monthly day-of-month timing sufficient for the prototype?** Default yes.
3. **Paid-off ($0 balance), un-archived debts and debts with no minimum:** default follows the
   engine exactly (the first holds the plan incomplete; the second is ignored). Excluding $0-balance
   debts is possible inside `plan-status.ts` without touching locked files (it already receives the
   engine input), but then the Overview would call a plan complete while the engine's own headline
   and the assistant still say debt timing is incomplete. Matching them exactly needs an engine
   change, which touches the locked PR #10 surface. This is a design call, not a technical limit.
4. **Incomplete + known shortfall:** default is incomplete dominates, and the known shortfall is
   shown as a lower bound ("Known-item shortfall (partial) ... could be larger").
5. **Partial figure visible or hidden:** default visible but subordinate, per the ruling's example.
   Hiding the dollar figure entirely in the incomplete state is the stricter alternative.
6. **Cross-surface consistency.** The assistant's grounded `plan_complete` claim reads
   `snap.complete` (setup-complete). It can say "the plan is complete" while the Overview says "not
   final". Reconciling it means touching `grounding.ts` / `decision-engine.ts` (PR #10 locked) and
   re-running its 157 + 13 proofs. Default: Overview only, flagged as a known inconsistency.
7. **Debt-free card beside an incomplete plan.** It still shows a payoff date ("Aug 2029") under an
   incomplete banner; a reviewer called the focus line and this card "pulling in different
   directions". Default: unchanged (the ruling's KEEP list does not name the cards).
8. **Next focus for a complete plan.** Default: the earliest-due item in the plan, stated as fact
   ("Electric bill, $85.00, is due October 12."), with no advice on what to do with the remainder.
9. **Free-text "Your focus" removed from the Overview** (it was the onboarding goal string, not
   derived from the plan). Default: removed.
10. **CI:** wire `validate:plan-status` into `ci.yml`? Default: no, until signed off.
11. **Fix the two data-loading risks in Section 3.8** (surface query errors; wait for every query
    the engine reads before showing a figure). Default: not changed in this pass.
12. **Instrument:** confirm the corrected instrument (eligibility attestation, D1 / D2, 48-72 hour
    collection, 5 entirely new participants) is frozen only AFTER the proofs are approved, and that
    rubric items B and E are re-worded to match the new screen.

## 5. Sequencing and what is blocked

1. CEO rules on Section 4 (item 1 gates everything below it).
2. On approval of C: migration + types + helper + debt page + assistant payload + proofs, then the
   healthy COMPLETE-plan proof (debts with due days: one placed in the window, one outside it) and
   a regenerated incomplete proof.
3. CEO approves the exact proofs. Only then: freeze the new stimulus, freeze the corrected
   instrument, run the five-person study within 48-72 hours of the freeze, score once.
4. Gate 3 readiness (planning only, no production port) proceeds in parallel and is not started in
   this pass.

## 6. Evidence index

Captures, per-state text dumps, axe results, and interaction-flow screenshots are in the
accompanying proof folder (`Remediation Proofs - 2026-10-09`). Headline pair:
`incomplete-plan__*` and `healthy-complete-interim__*`. The healthy capture is INTERIM: it uses a
scenario with no required debt minimums because debt due days cannot be captured until Section 3
lands, so it is not a candidate freeze stimulus.
