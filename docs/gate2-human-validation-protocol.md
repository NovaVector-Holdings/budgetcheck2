# Gate 2 — Human Validation Protocol (FINALIZED RESEARCH INSTRUMENT)

CEO rulings "GATE 1 APPROVED / GATE 2 FREEZE PREP" (2026-09-24) and "GATE 2 STUDY INSTRUMENT
FINALIZATION" (2026-09-24). This document is the complete, frozen research instrument for the
human-perception study to be run against the stimulus frozen in `docs/gate2-stimulus-freeze.md`.

**This document records the protocol; running the actual study with real participants is the
CEO/team's own action, not something performed by this session. No participant responses have
been collected as of this document.**

Nothing below may change once collection begins: not the questions, not their order, not the
stimulus, not the scoring rubric, not the thresholds. If any of it needs to change, STOP and open
a new round rather than amending this one mid-study.

## Stimulus (unchanged from the freeze — verify hashes before every session)

Exactly the two frozen images committed at `docs/gate2-stimulus/`:

- `gate2-stimulus-desktop-light.png` — SHA-256 `d5ad524f1aef8a19791c698a8e5d32b810ab1474b5a8a0f82c8e8791276cbb97`
- `gate2-stimulus-mobile-390.png` — SHA-256 `83e294b2158205838ad391f2c826595423138c8c71037859f1adc2ef95959198`

Both light theme, both the same healthy-state financial scenario (Balance $640.00 / Keep
available for 2 items −$205.00 / Buffer −$100.00 / **Estimated remaining $335.00** / "Plan
status" heading). No dark mode, no missing-data or shortfall state, no prior-round or `d713c47`
screenshot — those remain QA/reference evidence only, never shown to a participant.

## Stimulus presentation — locked

1. **Order:** show **Desktop light first, then Mobile 390 light**, to every participant, in that
   order, no exceptions.
2. Both images represent the same financial scenario — say so if a participant asks.
3. Participants may inspect/zoom as needed. **The images must remain readable at all times.**
4. Do NOT render the desktop image so small that financial labels can't be read.
5. Do NOT crop either image.
6. Do NOT replace either frozen image with a live app session.
7. Do NOT show dark mode, shortfall, missing-data, `d713c47`, or any alternate/draft screenshot.
8. **Record the exact survey/presentation mechanism used** (e.g., the specific form tool, PDF,
   or slide deck) in the response record for each session. If the mechanism auto-shrinks images
   (e.g., an embedded form thumbnail), provide participants a way to open each image at full,
   readable resolution before they answer — and record that this was available.

## The instrument — exact participant-facing wording

Use this exact wording, exact order, same instructions, for all five participants. Do not
paraphrase, reorder, or add explanation beyond what's written here.

### Introduction (read/shown before Question 1)

> "Please review both BudgetChek screens below as if you had opened the app to check your money.
>
> There are no right or wrong answers. We are testing the product, not you.
>
> Please answer based only on what the screens communicate to you. Do not assume BudgetChek
> knows information that is not shown."

### Question order — LOCKED, do not reorder for any reason, including a participant's own answers

1. Decision comprehension
2. Primary amount
3. Product authenticity
4. Trust boundary
5. Next action / status
6. Keep available / Buffer diagnostic

Question 6 is deliberately last: asking it earlier could teach terminology that would leak into
and contaminate Questions 1–5.

### Question 1 — Decision comprehension

> "In your own words, what is this screen mainly helping you understand?"

### Question 2 — Primary amount

> "If you had to pay attention to one dollar amount on this screen right now, which amount would
> it be, and why?"

### Question 3 — Product authenticity

> "What does this feel like to you: a real financial product, an internal dashboard/prototype, or
> something else? What makes you say that?"

### Question 4 — Trust boundary

> "What do you think the 'Estimated remaining' amount means?
>
> How confident would you be using that number to decide whether to spend money today, and why?"

### Question 5 — Next action / status

> "After looking at this screen, what do you think BudgetChek is telling you to do or know next?"

### Question 6 — Keep available / Buffer diagnostic

> "In your own words, what's the difference between 'Keep available' and 'Buffer'?"

**Do NOT explain "Keep available" or "Buffer" before this question.**

### Do not coach — for all six questions

Never lead a participant toward any of these terms/concepts before they say it themselves:
**Estimated remaining, entered information, live bank balance, permission to spend, paycheck
coverage, buffer.** These must come from the participant unprompted. If a participant asks a
direct question mid-session (e.g. "is this a real app?"), redirect neutrally to "what does the
screen tell you?" rather than answering.

## Scoring rubric — LOCKED before response #1, applied only after all 5 are collected

**Do not score or issue any verdict after each individual participant.** Collect all 5 sessions
in full first, then score the complete set against this rubric in one pass.

### A — Decision comprehension (threshold: ≥ 4/5)

**PASS** when the response substantially identifies the paycheck-cycle decision: what money must
cover before payday, what remains after upcoming items/buffer, or an understanding of the
next/current paycheck plan. Exact BudgetChek terminology is NOT required.

**FAIL** when the participant mainly describes generic budgeting, debt tracking, savings
tracking, account-balance monitoring, or financial-dashboard metrics, without recognizing the
paycheck-cycle decision.

### B — Primary amount (threshold: ≥ 4/5)

**PASS** when the participant chooses **Estimated remaining / $335** or an unmistakable semantic
equivalent such as "what's left after those items and the buffer."

**FAIL** when the selected primary amount is $640 (current balance), $205 (keep available), $100
(buffer), $875 (savings), $2,790 (debt), or the debt-free date/payment.

### C — Product authenticity (threshold: ≤ 1 authenticity failure across all 5)

**PASS** unless the participant clearly characterizes the experience as an internal/admin
dashboard, an unfinished mockup/prototype, or a developer/testing interface. A comment that a
specific element could be improved does NOT itself fail C.

**FAIL** only when the participant's overall perception is that it does not feel like a
consumer-facing financial product.

### D — Trust boundary (threshold: 5/5 mandatory — never averaged away)

**MANDATORY PASS** requires the participant's answer, taken as a whole, to demonstrate BOTH:

1. Estimated remaining is calculated from information entered/shown and may be incomplete if
   information is missing, AND
2. it is not treated as automatic permission/guarantee that $335 can be spent.

The participant does not have to repeat the exact words "not a live bank balance" — equivalent
understanding counts.

**FAIL** if the participant says or clearly implies "$335 is what I have available to spend," "I
can spend the $335," "BudgetChek says I have $335 free," or that they would confidently
spend/invest it merely because the app displays the number — **unless** they independently
qualify that decision by checking whether their entered information is complete/current.

**If Gate D fails for even one participant: HOLD.** Do not average it away against the other
gates or the other four participants.

### E — Next action / status (diagnostic only, no threshold)

Record whether the person understands the current healthy state as: known-timing items are
covered; there is still incomplete debt-minimum timing; the screen is communicating status rather
than forcing an unnecessary action.

### Keep available / Buffer diagnostic (diagnostic only, no threshold)

Expected understanding: **Keep available** = money associated with identified items before
payday; **Buffer** = additional money intentionally left untouched. Record actual responses as
evidence. **Do not create a mandatory threshold on this probe after seeing responses.**

## Participant eligibility

- **5 NEW people.**
- Exclude: anyone from Round 1, anyone from Round 2, anyone currently developing/reviewing
  BudgetChek, anyone already coached on this exact design.
- No finance-expert requirement — ordinary users are preferable, since this measures spontaneous
  comprehension.

## Response record — preserve for each participant

- Participant ID only (P1–P5) — no other identifying information
- Exact/verbatim response to each of the 6 questions
- Date completed
- Confirmation both stimuli (desktop light, then mobile 390 light) were reviewed, at full
  readable resolution
- The exact survey/presentation mechanism used
- A score, B score, C score, D score, E diagnostic note, Keep available/Buffer diagnostic note

**Do not rewrite or paraphrase participant responses before scoring.**

## Scoring process

1. Collect all 5 participant sessions in full — no scoring or verdict in between.
2. Score the complete set against the locked rubric above.
3. Report:
   - A: `__/5`
   - B: `__/5`
   - C: `__` authenticity failures
   - D: `__/5`
   - E: diagnostic summary
   - Keep available / Buffer: diagnostic summary
4. State the verdict per the locked thresholds: **GATE 2 PASS** or **GATE 2 HOLD**.
5. Evidence hierarchy: (1) verbatim responses, (2) this locked rubric, (3) CEO/owner official
   score, (4) any supplementary AI analysis — never a substitute for the human gate.

## Program-layer direction (context for whoever runs the session — not a study variable)

BudgetChek is evolving into a turnkey financial-wellness program delivered through the existing
Decide → Learn → Apply → Review → Improve loop. The participant-facing promise under test remains
**"Know what your next paycheck needs to do."** Do not introduce program/employer/B2B framing
into the participant session.

## Status

**Instrument finalized and frozen.** No participant responses have been collected. Per the CEO's
own ruling, once this document and the stimulus freeze are both in place, Gate 2 participant
collection is authorized — no further product/design review is required before the study begins.
