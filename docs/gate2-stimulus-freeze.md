# Gate 2 — Frozen Stimulus Record

CEO ruling "GATE 1 APPROVED / GATE 2 FREEZE PREP" (2026-09-24): Gate 1 is COMPLETE. This document
is the frozen, tamper-evident record of the exact Gate 2 primary participant stimulus. The two
images below are committed into this repo at this exact commit (`docs/gate2-stimulus/`) rather
than left only on disk, so the freeze is verifiable via git history, not a folder that could be
silently edited.

**If either image or its hash ever fails to match this record, STOP the study and open a new
round — per the CEO's own instruction, do not continue with a changed stimulus.**

## Frozen at

- **Final Gate 1 commit SHA:** `084b7a7558cee9bcfacfb56f405cdba63edf2d5a`
- **PR:** [budgetcheck2#12](https://github.com/NovaVector-Holdings/budgetcheck2/pull/12)
- **Frozen:** 2026-09-24

## A. Desktop stimulus

- **Filename:** `docs/gate2-stimulus/gate2-stimulus-desktop-light.png`
- **SHA-256:** `d5ad524f1aef8a19791c698a8e5d32b810ab1474b5a8a0f82c8e8791276cbb97`
- **Dimensions:** 1440 × 1439 px (full-page capture)
- **Viewport:** 1440×1400 (desktop-class), captured via Playwright/Chromium
- **Theme:** light (`colorScheme: "light"`)

## B. Mobile stimulus

- **Filename:** `docs/gate2-stimulus/gate2-stimulus-mobile-390.png`
- **SHA-256:** `83e294b2158205838ad391f2c826595423138c8c71037859f1adc2ef95959198`
- **Dimensions:** 390 × 2015 px (full-page capture)
- **Viewport:** 390×1400 (iPhone-width class), captured via Playwright/Chromium
- **Theme:** light (`colorScheme: "light"`)

Both captured in the same batch run against the same live account state — guaranteed to
represent the identical underlying financial scenario (same balance, same obligations, same
window). Neither is a mockup; both are real, screenshotted renders of the actual `/overview`
route running the code at the commit above.

## Exact financial scenario represented (identical in both images)

| Line | Value |
|---|---|
| Window | "Through October 2" |
| Balance | $640.00 |
| Keep available for 2 items | −$205.00 |
| Buffer | −$100.00 |
| **Estimated remaining** | **$335.00** |
| Keep available / Buffer explanation | "Keep available is for the items listed before payday. Buffer is the extra amount you chose to leave untouched." |
| Trust-boundary sentence | "Based on what you've entered, minus what's listed above — not a live bank balance, not permission to spend, and not aware of anything you haven't entered yet." |
| Status heading | **Plan status** (not "Next money move" — this is the non-shortfall, status-only case) |
| Status sentence | "The items with known timing due before October 2 are covered, with $335.00 left after your buffer. Debt-minimum timing is still incomplete, so this does not confirm every required payment for this paycheck window." |
| Current balance (secondary card) | $640.00, "As of September 24 · $100.00 buffer kept aside" |
| Saved so far (secondary) | $875.00 |
| Owed so far (secondary) | $2,790.00 |
| Debt-free goal (secondary) | Jun 2029, "2 years, 9 months away at $115.00/mo" |

This is the healthy/complete state — funding fully covered, no shortfall, no missing setup data.
The 2 items behind "Keep available for 2 items" are Electric bill ($85) and Groceries ($120),
both due within the paycheck window; other real bills on the demo account (Car insurance, Rent,
Phone bill) fall outside this window and are correctly excluded from the calculation, per
`decision-engine.ts`'s existing window logic (untouched by Gate 1).

## What is explicitly NOT part of the Gate 2 primary stimulus

Per the CEO's ruling, these exist only as QA/reference evidence and must never be shown to
participants:

- Dark mode (`overview-desktop-dark.png`)
- Missing-data state (`overview-missing-data-state.png`)
- Shortfall state (`overview-shortfall-state.png`)
- Any prior-round or `d713c47` screenshot
- Any alternate/draft version

## CI / build state at freeze

- CI: GREEN — [run `35946920352`](https://github.com/NovaVector-Holdings/budgetcheck2/actions/runs/35946920352)
- No UI changed after the CEO's "GATE 1 APPROVED" ruling — the only commit since is this
  documentation freeze plus the §7/§8 documentation correction in
  `docs/gate1-overview-2.0-remediation.md` (also documentation-only).
