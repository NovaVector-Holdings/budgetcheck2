# Overview refinements from the usability survey

## What the survey is probing
The seven questions test five things: (1) whether the screen's purpose is obvious, (2) whether one number clearly matters most, (3) whether it feels like a real product or a prototype, (4) whether "Estimated remaining" is understood and trusted enough to act on, and (5) whether "Keep available" vs "Buffer" is confusing. Each maps to a concrete fix below — no math changes, only presentation and wording.

## Planned changes

### 1. One number that obviously matters most
- Make **Estimated remaining** the visual anchor of the paycheck briefing: larger type, and a one-line plain-language label directly under it: "What's left after the bills due before payday and your buffer."
- De-emphasize the intermediate rows (Balance, Keep available, Buffer) with smaller, quieter styling so the eye lands on the result first.

### 2. "Estimated remaining" meaning and trust
- Rename the label to **"Left over until payday (estimate)"** so the timeframe is in the name, not just the explainer.
- Keep the existing honesty line ("not a live bank balance…") but tighten it to one sentence and place it immediately under the number, where confidence is decided.
- When debt minimums lack due dates, keep the existing note — it already explains why the estimate can't confirm every payment.

### 3. "Keep available" vs "Buffer" confusion
- Rename the row **"Keep available for N items"** to **"Bills due before payday (N)"** — it says what the money is *for*, not an instruction.
- Rename **"Buffer"** to **"Your safety cushion"** with a tooltip-style sub-line: "Extra you chose to leave untouched."
- In the Current balance card, change "buffer kept aside" to the same "safety cushion" wording so the term is consistent everywhere.

### 4. "What should I do next?" clarity
- The briefing card ends with a single next-step line tied to the result: covered → "You're covered through {date}. Next: put the leftover toward your focus — {money goal}."; shortfall → link to move a due date or add cash; no obligations → link to Savings/Debt.
- This replaces the separate "Plan status" box's role as the action source, so there's one answer to "what now?".

### 5. Real-product feel
- Add the "as of {date}" freshness cue to the briefing card (already on Current balance) so numbers feel current, not static prototype data.
- Consistent card headings: "Paycheck briefing" stays; ensure the greeting, focus line, and cards share one visual rhythm (spacing, eyebrow styles) on desktop and mobile.

## Out of scope
- No changes to the paycheck math, stored data, or the no-guessing rule.
- No new cards; this is wording, hierarchy, and one next-step line.

## Technical notes
- Files touched: `src/components/paycheck-cards.tsx` (labels, hierarchy, next-step line), `src/routes/_authenticated/overview.tsx` (greeting/focus spacing if needed).
- Copy only — no schema, no server functions.

## Validation
- Typecheck with `bunx tsgo --noEmit`.
- Playwright pass on `/overview` (demo account) at desktop and mobile widths: confirm one dominant number, new labels, next-step line, and no console errors.
