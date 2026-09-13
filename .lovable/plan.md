# Simplify the My Money Overview

## Team assessment
The Overview has grown to roughly ten separate cards. Several repeat another card’s answer or belong on a deeper page. The first screen should answer three questions only: **What do I have now? Am I covered until payday? What should I do next?**

## Keep and strengthen
- Keep **Am I okay until my next paycheck?** as the main forecast.
- Keep **Your next money move** as the single recommended action.
- Rename **Money on hand** to **Current available balance** and visually integrate it with the payday forecast as its starting number.
- Keep a compact **Your progress** summary linking to Savings and Debt, without separate oversized cards.
- Show setup completeness only when information is missing, as a compact prompt rather than another permanent card.

## Remove from Overview
- Remove **Estimated left this month**. Its current formula subtracts remaining bills from full monthly income, but ignores spending already made and the current balance. It can look like spendable money when it is not.
- Remove the second **One move to make next** card because it duplicates **Your next money move**.
- Remove the standalone **Coming up** card because the payday forecast already lists the urgent bills; the full 30-day list remains on Bills.

## Move to more appropriate pages
- Keep the full **budget method** breakdown in Reports, where users expect analysis rather than immediate action.
- Keep the full **debt-free date** projection on Debt; Overview will link to it through the compact debt summary.

## Resulting hierarchy
1. Greeting and current focus
2. Current available balance + payday forecast
3. Your next money move
4. Compact savings/debt progress links

## Technical notes
- Preserve all existing calculations and stored data except the misleading monthly estimate display.
- Reuse the existing design system and responsive patterns.
- Correct the unrelated sign-in hydration mismatch without changing sign-in behavior.

## Validation
- Check complete-data and missing-data states.
- Verify desktop and mobile layouts.
- Confirm Overview presents one actual balance, one forecast, and one next action without duplicate cards.
- Confirm sign-in loads without hydration errors.
