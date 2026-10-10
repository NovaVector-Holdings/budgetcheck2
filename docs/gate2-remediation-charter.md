# Gate 2 Remediation: Charter, Implementation Record, Debt Timing and Completeness

Status: PR #12 OPEN / UNMERGED. Participant study HOLD. Gate 3 / production port HOLD. The
d5ad524f / 83e294b2 stimulus is RETIRED (kept in `docs/gate2-stimulus/` as historical evidence
only, never reused). This branch is NOT participant-facing or user-facing: the database column
behind Option C has not been applied (Section 4), and the final proof pair has not been approved.

Governing rulings, in order: CEO / PRODUCT RULING "GATE 2 RESULT + FINAL REMEDIATION PATH"
(2026-10-09), then the SME / CEO RETURN of the same day (UI proofs approved with conditions;
Option C authorized for the prototype; classifier rules, assistant/Overview consistency,
Debt-free card and data-loading changes required). Sections 1-3 are the standing charter and the
record of the first pass; Section 5 maps every SME item to what was done; Sections 6-8 hold the
limits, the open rulings and the evidence index.

## 1. Charter

**Scope (bounded).** The PLAN INCOMPLETE state; debt timing resolved for the prototype; one
balance with its Update inside the calculation; one next focus per state; a healthy
COMPLETE-plan proof and an incomplete-plan proof for approval; the corrected research
instrument, frozen only after the proof pair is approved.

**Acceptance.**

- An incomplete plan never shows the normal "Estimated remaining". The incomplete message is the
  dominant element; any known-item figure is labeled PARTIAL, says required debt minimums are
  not included, and is visually subordinate.
- The visible calculation provably sums to the engine's own remainder in every state.
- Exactly one next focus in every computed state; no free-text "Your focus" line.
- One balance figure, with Update inside the calculation, and Update changes the number the
  engine actually uses.
- "Incomplete" is ONE semantic truth, fixed at the engine: the Overview, the Debt-free card and
  the assistant's "the plan is complete" claim read the same flag.
- A failed required query is an explicit UNAVAILABLE state, and no figure renders before every
  engine source has loaded.
- 0 axe violations (WCAG 2.0/2.1 A + AA), both themes, desktop and 390px mobile; no overflow.
- The locked proofs stay green and unedited: `scripts/prove-grounding.ts` 157/157,
  `scripts/prove-decision-engine.ts` 13/13. `.github/workflows/ci.yml` untouched.

**Exit condition (Definition of Done).** (1) incomplete-plan behavior implemented; (2) debt timing
resolved for the prototype; (3) balance / remainder hierarchy cleaned up; (4) the exact healthy
and incomplete proof pair APPROVED; (5) corrected instrument frozen; (6) five clean participants
complete the study; (7) one official score issued. If mandatory D fails again: STOP iterating on
microcopy and return for a product-strategy decision.

**Deferred.** Production port or merge; any production schema change; weekly / biweekly /
semimonthly debt cadences; recurring-bill roll-forward and overdue handling; bank-connectivity
copy (a separate Financial Data Connectivity workstream, SME item 15); repo-wide lint cleanup;
Gate 3 readiness (planning only, separate track).

## 2. First pass (commit 9af0916, reviewed and approved with conditions)

`derivePlanStatus` over the one governed snapshot; the dominant PLAN INCOMPLETE banner with the
known-item figure demoted to a dashed, muted "Known-item remainder (partial)"; itemized Keep
available; reserved funds, the $0 floor and certain inflows as their own rows (a sweep proof
asserts the rows sum to the engine remainder); the Update control on the Balance line (replacing
the standalone card and the free-text "Your focus"); the accounts-backed balance link; no balance
on file is a setup state, not a $0; the shortfall text contrast fix. CI on that exact SHA:
success (run 38008374973).

## 3. This pass: what changed

| Area | Change |
|---|---|
| Engine (locked surface, one isolated commit `0f2429a`) | `classifyDebt` is the ONE place a debt's role is decided: paid-off (balance <= 0) first, then unknown minimum, then explicit $0 minimum, then unknown timing, then in / outside the window. `buildFundingPlan` builds every bucket from it. New `FundingPlan.debtsWithUnknownMinimum`, new `EngineSnapshot.planComplete` (setup on file AND both unknown lists empty), optional `account.balanceKnown`, exported `debtsMissingMinimum`. Every existing string is byte-identical when the new list is empty; new sentence variants only add an honest clause. `EngineSnapshot.complete` keeps its setup-only meaning (two locked proofs pin it). |
| Grounding + prompt (same commit) | `planIsComplete` (strict, fail-closed: setup flag, engine flag, and both raw lists empty) now backs `plan_complete` / `plan_incomplete`, so the assistant and the Overview cannot disagree. `snapshot.complete` removed from the fact paths. Caveats extended without digits or "N debts" phrasing. Stale "no due-date column" text updated; the reason string the locked proof pins is untouched. |
| Option C (`6af7145`, `0d0178d`) | Migration `20261009210000_debts_due_day.sql` (additive, idempotent, no default, no backfill); `src/lib/due-day.ts` (pure, UTC, clamps 29-31, 56,606-case property sweep); `mm.ts` and the assistant payload both call the SAME `resolveDebtDueDate` with the engine's own `todayIso`; Debt page: due-day field on add, inline Edit of minimum AND due day for existing debts, "due the 15th" display, `?edit=<id>` deep link. |
| Data gating (`71fd83b`, `8bebdea`) | Every engine query throws on error; `loading` is `isPending` over ALL nine engine sources; a failed source is UNAVAILABLE even when old data is retained; Money Meeting and the Overview render only inside the gate; the Debt, Bills and repair surfaces never read a pending or failed read as an empty list. |
| Overview integration (`25b54b7`) | One `PlanStatus` shared by the briefing and the Debt-free card. Three honest incomplete variants (timing only keeps the approved wording; minimum only; both), each debt linking to its own editor. Debt-free card: qualified date when only due days are missing, NO date when any minimum is missing. Always-100% progress bar removed. |
| Review fixes (`b1751b6`) | See Section 6 (what an independent adversarial review found and what was fixed). |

## 4. Debt timing: Option C, how it works and how it is applied

**Data model.** `debts.due_day smallint`, nullable, `CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31)`.
NULL means honestly unknown. Never a stored one-off date (it would go stale and silently fall out
of the window while still looking known).

**Resolution.** `nextOccurrenceOnOrAfter(dueDay, todayIso)`: this month's day if it has not
passed (due day == today counts), else next month's; days 29-31 clamp to the real month length;
anything invalid resolves to null, which the engine lists as unknown timing (fails closed).

**Placement.** Unchanged engine rule: a debt is a plan item only when its resolved date falls in
`[today, next payday]` (inclusive); a real date outside the window is a known exclusion, not an
unknown. Worked example (today 2026-10-09, payday 2026-10-16): due the 14th is inside; due the
24th and due the 5th (which resolves to Nov 5) are outside.

**Governance: does pushing the migration apply it? No.** Lovable's own documentation states that
it "does not run migration files that you add through Git" and "does not deploy a changed Edge
Function or run a new migration file when your commits sync", and that it syncs ONE branch (by
default the repository's default branch), so a feature branch does not reach it until merged
(docs.lovable.dev/integrations/git-sync-overview and /integrations/github, read 2026-10-09). The
prototype project (`ifmphqppwcaueherhfwm`) is also not in the company's own Supabase
organization, so it is Lovable-managed and no tool here can write to it. Consequences:

- Committing and pushing the migration file here applies nothing. Nothing was applied.
- Applying it is a deliberate CEO action: paste the SQL from the migration file into the Lovable
  chat ("apply this migration exactly as written") or run it in the SQL editor. The statements are
  idempotent, so a Lovable-recorded duplicate is harmless. After it exists, Lovable regenerates
  `src/integrations/supabase/types.ts`; the three hand-matched `due_day` lines should come out
  identical (diff them).
- Until then the app degrades safely: add and edit send `due_day` only when it carries
  information, so adding a debt or editing a minimum still works on the current database; only
  entering a due day needs the column.
- This remains a docs-based confirmation, not a live test; it was deliberately not tested by
  pushing a migration. A production migration is a separate approval.

## 5. SME return: item by item

| SME item | Status | Evidence |
|---|---|---|
| 1 UI accepted | Kept | prior proofs; incomplete state, one next focus, one balance |
| 2D overdrawn + no buffer label | DONE | `prove-plan-status` OVERDRAWN 1 and 2, FOOTING 3b: exact label "Balance is overdrawn, so available money is counted as $0", rows `balance,floor`, never "set aside"; capture in the return package; mutation-checked |
| 3 Option C | DONE (code); NOT applied to any database | Section 4 |
| 4 monthly only, never approximate | DONE | no other cadence anywhere; unsupported timing stays incomplete |
| 5A paid-off debt not required | DONE | `classifyDebt`; COMPLETE 5; `prove-completeness` |
| 5B active debt + unknown minimum incomplete | DONE | engine list + `planComplete`; Overview copy variant; Debt-free card suppression; Debt page prompt |
| 6 incomplete + shortfall | DONE | incomplete outranks; "Known-item shortfall (partial)... could be larger" |
| 7 partial remainder | DONE | label, exclusion note, de-emphasis; never "Estimated remaining" |
| 8 assistant / Overview consistency | DONE for the completeness claim; PARTIAL for two gates | Section 7 ruling R1 |
| 9 Debt-free card | DONE | qualified (timing only) or no date (minimum unknown), also with no payday; Debt page itself also stops printing a date while a minimum is missing |
| 10A failed query is unavailable | DONE on every surface that prints a figure from the engine; the Debt and Bills pages | Savings and Analytics are outside the engine, see R4 |
| 10B no figure before all sources load | DONE | `isPending` over nine sources; flow D0 |
| 11 CTA / edit path | DONE | `/debt?edit=<id>` per debt and from the banner; minimum AND due day editable for existing debts |
| 12 CI | HELD per the ruling | Section 7 ruling R8; CI for the exact final SHA is in the return package |
| 13 healthy-with-debts proof | DONE | one debt inside, two outside, rows sum to the engine, one next focus, no warning, correct cards |
| 14 instrument | NOT frozen | awaiting the pair approval |
| 15 bank-connectivity copy | NOT touched | backlog |

## 6. Independent adversarial review (5 lenses, 54 findings, each skeptic-verified)

Fixed in `b1751b6`: the repair tab printed a headline and projection from empty or failed
sources; the Debt and Bills pages read a failed read as "No debts listed - worth celebrating" /
"Nothing planned"; the Debt page printed a payoff date built on a missing minimum counted as $0;
unparsable text in a number field silently erased a saved minimum; add and edit would have
failed against a database without the new column; the Weekly Check-in said "Nothing urgent this
week" under an incomplete plan and printed a never-entered balance as $0.00 and blamed debts for
a setup gap; the monthly review recommended paying a paid-off debt and gave a payoff direction
that ignored unplaced minimums; a transient refetch error unmounted the page and discarded
input; one grounding caveat read as one debt when two were missing different things; duplicated
link names; two different minus signs.

Refuted by the skeptics and left alone: a claim that the at-a-glance projection was a blocker;
"due-day resolution can silently produce a complete plan" (documented limit, Section 8);
"no CI evidence for the exact HEAD" (checked separately); gate copy asserting nothing changed.

## 7. Open rulings (each with a recommendation; none is a prerequisite for the proof pair)

- **R1. Two assistant gates still read the setup-only flag.** `no_action_needed` and a
  discretionary `user_decision` can still validate while the Overview shows PLAN INCOMPLETE; the
  rendered sentence carries the unknown-debt caveat and shows no figure. Moving both to
  `planIsComplete` is a two-line change but flips two pinned locked-proof PASS cases and one
  pinned reason string, i.e. it requires editing `prove-grounding.ts`. Recommend: do it, with the
  three locked cases deliberately rewritten and the new expectation proven. Needs your explicit
  go because it edits the locked proofs.
- **R2. The engine headline still states "with $X left after your buffer" in the unresolved
  variants.** It is printed by the Weekly Check-in, the Money Meeting at-a-glance card and the
  Ask tab, next to the incomplete wording. Recommend dropping the dollar clause from the
  unresolved variants only (the locked proofs do not assert the amount). Locked wording: needs
  your go.
- **R3. An explicit $0 minimum means "no payment required" (known), blank means unknown.** The
  SME text does not say this; it is the safest reading and is stated in the edit form hint.
- **R4. Savings and Analytics pages are outside the engine and still read a failed query as
  empty; Savings and Settings invalidate keys the engine never reads, so the first paint after
  an edit there can briefly show a pre-save figure.** Recommend a small follow-up.
- **R5. Engine queries no longer refetch on tab focus** (an errored refetch with retained data
  counts as unavailable, so a blip would unmount the page and discard half-typed input). Trade-off:
  edits made on another device appear on next navigation, not on focus.
- **R6. `add_missing_due_date` is still bill-only, and a paid-off debt is still actionable by the
  assistant** (`review_due_date`, `missing_minimum`). Recommend a follow-up with its own proofs.
- **R7. Apply the migration** (Section 4) before any live-data exposure.
- **R8. CI.** After formal acceptance, one isolated commit adds, after the existing
  `validate:grounding` and `validate:decision-engine` steps: `validate:plan-status`,
  `validate:completeness`, `validate:due-day`, `validate:data-status`. Not made yet.
- **R9. The fixture-driven Playwright harness (96 captures, 28+ flows incl. the new gating flows)
  lives outside the repo.** Recommend moving it under `scripts/qa/` with a pinned dev dependency
  so the wiring (not only the pure logic) is regression-tested. Needs your go (adds a dependency).

## 8. Known limits of the debt-timing design (state these wherever the plan is described)

- A due day that already passed this month resolves to NEXT month, so an unpaid earlier-this-month
  minimum drops out of the window without being flagged (same class as overdue bills). The product
  cannot tell paid from unpaid.
- `debt_payments` is never read: a minimum already paid this cycle still counts until its date
  passes (a conservative over-count that can show a spurious shortfall).
- Monthly only; one occurrence per window (a window long enough to contain the due day twice
  counts it once). A minimum due ON payday counts.
- "Today" is the UTC date (`money.ts`), so on a US evening it is already tomorrow; a due day equal
  to the local date can roll a month. The engine's hook also fixes `todayIso` at first render, so
  a tab left open past midnight keeps the old window. Both pre-date this work and apply to bills
  too; recommend a local-date follow-up.
- The Money Meeting lowest-point projection runs over planned bills and income only, never debt
  minimums; it now says "before any debt minimums" whenever an active debt exists.
- Recurring bills with a stale stored date and overdue unpaid bills still vanish from the plan.

## 9. Evidence index

Proofs (all network-free, mutation-checked): `npm run validate:` `grounding` 157/157,
`decision-engine` 13/13 (both unedited), `plan-status` 49, `completeness` 37, `due-day` 13,
`data-status` 30. Typecheck: only the pre-existing `src/routes/__root.tsx` error, identical at
baseline. Captures and flows: see the return package README (counts and the final CI result for
the exact SHA are recorded there, not here, because they are produced after this file is
committed).
