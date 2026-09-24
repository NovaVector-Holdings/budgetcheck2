# Gate 1 — BudgetChek 2.0 Overview Human-Evidence Remediation

CEO directive "BUDGETCHEK 2.0 — OVERVIEW HUMAN-EVIDENCE REMEDIATION" (2026-09-17). Round-2
perception research tested `paycheck-planner-plus`'s older `d713c47` Overview; that build is not
touched by this work. This document is the Gate 1 return package for `budgetcheck2`'s own
Overview page (`src/routes/_authenticated/overview.tsx`), the repo the CEO designated as
authoritative for Gate 1 and Gate 2 (design + human validation), with `paycheck-planner-plus`'s
prior `feature/overview-briefing-phase1` work treated strictly as reference evidence for
calculation presentation and terminology, not transplanted code.

**2026-09-23 update — "GATE 1 BOUNDED FINALIZATION."** Design direction approved; 3 bounded UX
corrections applied (no redesign, no architecture change):

1. **Keep available vs Buffer explanation** — Round-2 evidence showed the labels alone aren't
   self-evident. One compact line, no new card: *"Keep available is for the items listed before
   payday. Buffer is the extra amount you chose to leave untouched."* — shown only when at least
   one of the two terms it defines is actually on screen.
2. **State-aware "Next money move" vs "Plan status"** — the heading no longer claims an action
   exists when the engine is only reporting coverage/status. A real action exists ONLY in the
   shortfall case (the headline literally says "start with the one at the cutoff line"); every
   non-shortfall headline is now labeled **Plan status** instead of **Next money move**. See
   `Briefing`'s `shortfall` boolean in `paycheck-briefing.tsx` — already the exact right signal,
   no new state needed.
3. **Realistic Gate-2 fixture data** — the shortfall proof's temporary obligation was re-captured
   using a neutral, realistic label ("Car repair", $900) instead of the internal QA label from
   the first pass. See `overview-shortfall-state.png` (replaced).

All 5 proofs (desktop light/dark, mobile 390, missing-data, shortfall) recaptured against the
current code and current demo-account dates (the account's `next_pay_date`/bill due dates needed
a routine refresh forward in time since the first capture — a fixed-date demo fixture goes stale
as real time passes; refreshed to a current, realistic near-future cycle, not a data model
change). axe-core re-run: 0 violations, both themes, unchanged.

## 1. Baseline assessment

Before this change, `overview.tsx`:

- Computed its numbers via `src/lib/paycheck.ts`'s `buildPaycheckPlan`, a **separate** engine
  from `src/lib/decision-engine.ts`'s `computeSnapshot` — the one Money Meeting, Weekly Check-in,
  and Ask a Question all already use. Two parallel calculation engines existed in the same app.
- Had no single dominant decision amount. Three roughly equal-weight cards (current balance /
  "am I okay" card / next-money-move card) then a three-up strip (Saved so far / Owed so far /
  Debt-free goal) that visually competed with them.
- Had no "Keep available" / "Buffer" distinction — `PaycheckPlanCard` showed a "Buffer you keep
  aside" row only when non-zero, with no framing of what the buffer concept means.
- Had a persistent "Next step" card driven by a hand-rolled checklist (income / bills / debts /
  goals) that included **optional** richness (a savings goal, having any debts at all) as if it
  were required for the core decision — a real contributor to the "Get started" CTA reading as
  permanent, since some checklist item was often incomplete indefinitely by design (e.g. "no
  debts tracked" is a fine, common end state, not a gap to close).
- `CashOnHandEditor`, still used on this page, had a real bug (found while building this fix, see
  §12): its `editing` state initialized from a `useState` call reading `profile` before the query
  resolved, so it opened in "enter your balance" mode on every fresh page load even when a real
  balance was already on file.

## 2. Round-2 finding → 2.0 design response

| Round-2 finding | 2.0 response |
|---|---|
| Users gravitated to income/balance/debt-countdown instead of consistently identifying "Estimated remaining" | New `PaycheckBriefing` hero (`src/components/overview/paycheck-briefing.tsx`) is the first thing rendered after the page header, the only oversized figure on the page (`font-serif text-3xl`); current balance, saved/owed/debt-countdown all render smaller, below, in their own subordinate cards |
| "Estimated remaining" could read as safe/available/live cash | Trust sentence stated in the same card, same breath as the number (not a disclaimer footnote): "Based on what you've entered, minus what's listed above — not a live bank balance, not permission to spend, and not aware of anything you haven't entered yet." Wording never uses "safe to spend" / "available to spend" / "guaranteed" anywhere in this component |
| Keep available vs Buffer wasn't self-evident from placement alone | Both are explicit, labeled line items in the calculation stack itself, not left to be inferred: `Keep available for N items` (= `funding.totalRequested`) and `Buffer` (= `snap.reservedTotal + engineInput.safeBuffer`) each shown as their own row before the total |
| "Get started" read as a permanent action | The old hand-rolled checklist card is gone entirely. The ONLY setup-gating state left is real and computed (`snap.missing`, straight from `computeSnapshot` — balance / next payday / pay cadence), so it structurally cannot look permanent: once those three are on file, the guided-setup card is replaced by the full briefing, not hidden/dismissed state that could regress |
| Don't lose simplicity, calm, manual-first, credibility | No new dependency, no new data source, no "connect a bank" UI anywhere; the trust micro-copy on `CashOnHandEditor` ("Manual entry only. No bank connection required.") is untouched; visual system (cream/evergreen/brass, Fraunces/Inter, `paper-card` surfaces) is 100% reused, not reinvented |

## 3. Proposed information hierarchy (top to bottom)

1. Page header (unchanged: name greeting + stated focus)
2. **Paycheck briefing** — the decision spine (this Gate's primary deliverable)
3. Current balance editor (manual entry, unchanged component, bug-fixed mount timing)
4. Secondary context, explicitly subordinate: Saved so far / Owed so far / Debt-free goal

No structural navigation change. No new route. No new nav item.

## 4. Exact calculation presentation

```
Balance                              $640.00
Keep available for 1 item            −$85.00
Buffer                                −$100.00
──────────────────────────────────────────────
Estimated remaining                   $455.00
```

Every figure is read directly off `state.snapshot`/`state.engineInput` (the real, already-trusted
2.0 engine — no new arithmetic introduced by this page):

- `Balance` = `engineInput.account.currentBalance` (real accounts if any exist, else the manual
  `profiles.cash_on_hand` fallback — the same fallback `buildEngineInput` already uses).
- `Keep available for N items` = `funding.totalRequested`, only shown when `funding.items.length
  > 0` (a plan with nothing due doesn't claim to be "keeping available" for zero items).
- `Buffer` = `snap.reservedTotal` (reserved funds not tapped) + `engineInput.safeBuffer` (the
  flat buffer the person set), only shown when `> 0`.
- `Estimated remaining` (or `Short by`, in red, when negative) = `funding.available -
  funding.totalRequested` — identical to the formula Weekly Check-in already computes and has
  been running in production data since before this change.

## 5. Trust-boundary treatment

Two sentences, both inside the same card as the number, never a footnote:

- Healthy state: *"Based on what you've entered, minus what's listed above — not a live bank
  balance, not permission to spend, and not aware of anything you haven't entered yet."*
- Shortfall state: *"Based on what you've entered — not a live bank balance."* (shorter
  deliberately — the destructive-red "Short by" framing already carries urgency; the point here
  is only the entered-vs-live distinction, not re-litigating permission-to-spend language against
  a number that's already negative)

Never used anywhere in this component: "safe to spend," "available to spend," "guaranteed,"
"live cash."

## 6. Missing-data state

Gated on `state.snapshot.missing.length > 0` — the real, computed set (balance / next payday /
pay cadence), never a hand-rolled list. Each entry links straight to where it's fixed
(`missing[i].to`). See `overview-missing-data-state.png`.

## 7. Complete-data healthy state

See `overview-desktop-light.png` / `overview-desktop-dark.png` / `overview-mobile-390.png` — all
three captured against the same real account state (funding fully covered, `$455.00` estimated
remaining, the honest debt-timing caveat from PR #10 flowing through automatically since
`snap.headline` already carries it).

## 8. Shortfall state

See `overview-shortfall-state.png` — captured by temporarily adding a real $5,000 obligation to
the demo account, screenshotting, then deleting it (verified restored to the original 5 real
bills afterward). `Short by $4,545.00` renders in the destructive tone, `Next money move` names
the actual cutoff item, and the debt-timing caveat is still present and accurate in the shortfall
sentence too.

## 9–11. Desktop light / desktop dark / mobile 390 proofs

Captured with Playwright (`chromium`, real authenticated session, `networkidle` + settle wait,
full-page screenshots) against the `demo@budgetchek.app` account already used for every prior
visual-QA round in this engagement. Files: `overview-desktop-light.png`, `overview-desktop-dark.png`,
`overview-mobile-390.png` (390×~1400, iPhone-width viewport).

## 12. What changed and why, tied to survey evidence

See §1–§2 above for the full mapping. In one sentence: the old Overview used a different,
un-trust-gated engine and a flat metric grid with no dominant decision amount; the 2.0 Overview
reuses the SAME `computeSnapshot` engine every other trust-hardened surface in this app already
uses, and gives "Estimated remaining" the singular visual weight the Round-2 evidence said it
needs, with the Keep-available/Buffer breakdown and trust sentence stated explicitly rather than
left to be inferred.

One real, pre-existing bug was found and fixed in this same pass because it was directly visible
in this exact deliverable: `CashOnHandEditor`'s `editing` state used to initialize from a
`useState` call reading `profile` before the query resolved, so it always opened in "enter your
balance" mode on a fresh page load, even with a real balance already on file. Fixed by not
mounting the component until `state.loading` is false (`CashOnHandEditor` itself untouched).

## 13. Accessibility / contrast check

`axe-core` (real automated scan, not eyeballed), run via Playwright against the live rendered
page, both color schemes, WCAG 2.0/2.1 A+AA rule sets, scoped to the page's main content:

```
light: 0 violations
dark:  0 violations
```

## 14. Confirmation: no unrelated architecture changed

- No change to `answerParts`, the scenario parser, the grounding contract, structured
  state/action/decision vocabularies, the responsible-obligation guardrail, the debt-timing
  exclusion rule, the funding-item kind discriminator, or the discretionary-room gate (PR #10's
  own locked architecture — verified by re-running `scripts/prove-grounding.ts` (157/157) and
  `scripts/prove-decision-engine.ts` (13/13) after this change; both unaffected, as expected,
  since no file either script covers was touched).
- No change to routing/navigation (`src/routes/_authenticated/route.tsx`'s nav arrays untouched).
- No change to `paycheck-planner-plus` (production repo) — this entire Gate happens in
  `budgetcheck2` only, on a fresh branch (`feature/2.0-overview-human-evidence-remediation`) off
  `main` post-PR-#10-merge.
- No new dependency added to `package.json`.
- `src/components/paycheck-cards.tsx`'s `PaycheckPlanCard`/`NextMoneyMoveCard` are now
  unreferenced (only `overview.tsx` used them) — left in place rather than deleted, since removal
  wasn't requested; flagged here rather than silently pruned.

## Files changed

- `src/routes/_authenticated/overview.tsx` — rewritten to use `useMoneyState`/`computeSnapshot`
  instead of `buildPaycheckPlan`; hierarchy restructured per §3.
- `src/components/overview/paycheck-briefing.tsx` — new. The paycheck briefing hero, setup-needed
  state, and calculation stack.
- `docs/gate1-overview-2.0-remediation.md` — this document.

## Gate 1 exit

Awaiting CEO approval of: desktop light proof, desktop dark proof, mobile proof, hierarchy, trust
treatment, terminology, missing/setup behavior. Approval here means **design direction approved
for human testing** (Gate 2) — not production authorization, not a Gate 3 production-integration
start.
