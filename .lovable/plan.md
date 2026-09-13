# Clarify the Overview money figures

## Team recommendation
“Money on hand” and “Estimated left this month” answer different questions in theory, but the current monthly estimate is misleading: it subtracts only future bills from monthly income and does not account for money already spent. That makes it easy to mistake as available cash and duplicates the more reliable payday view.

## Changes
- Remove the standalone “Estimated left this month” card from Overview.
- Rename “Money on hand” to “Available balance now” and keep its as-of date, making clear it is the manually entered starting balance.
- Keep “Am I okay until my next paycheck?” as the forecast: available balance minus bills due before payday and the user’s chosen buffer.
- Move the data-completeness checklist into the payday card area so users still know what improves the forecast.
- Preserve monthly income for the chosen budgeting method and reports; do not present it as cash remaining.
- Correct the sign-in page hydration mismatch without changing its visible behavior.

## Validation
- Check Overview with complete and missing information at desktop and mobile sizes.
- Confirm only one current-balance figure and one clearly labeled payday forecast appear.
- Confirm sign-in loads without hydration errors.
