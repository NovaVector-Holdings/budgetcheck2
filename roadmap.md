# Roadmap — BudgetChek member accounts & money tools

- [x] Enable Lovable Cloud + email/password auth + Google sign-in
- [x] Database schema with RLS (profiles, savings, debts, expenses, meetings, alerts) — security lint clean
- [x] Sign in / sign up / Google / forgot password (`/auth`, `/reset-password`)
- [x] 3-step onboarding (`/onboarding`) with gate redirecting new members
- [x] Overview, Savings, Debt Strategy, Future Expenses, Calendar, Money Meeting, Analytics, Import & Analyze, Alerts, Archives, Settings
- [x] Session-aware header (Sign in ↔ My money/Sign out) + mobile menu
- [x] Smoke test: pages return 200, /overview redirects signed-out visitors to /auth, hydration fixed

## Open / blocked
- [ ] Google sign-in untested end-to-end — preview has no signed-in session to inject; test manually after first signup
- [ ] Email confirmation is ON: new signups must click the email link before signing in (default, safer)

## Done (demo)
- [x] Demo account (demo@budgetchek.app) with seeded sample data + "Explore the demo account" button on /auth — verified end-to-end

## Open
- [x] Hero on homepage with two value cards (learn + my money), verified desktop + mobile

## Survey + competitor alignment (Sept 13)
- [x] Overview leads with "Estimated left this month" + plain math, caution, completeness meter
- [x] Chart keys added to Reports
- [x] Nav cut to 5 primary tools (Overview, Bills, Savings, Debt, Reports) + "More"
- [x] Renames: Future Expenses→Bills & expenses, Analytics→Reports, Debt Strategy→Debt, Import & Analyze→Import spending, Alerts→Reminders, Archives→Archive

- [x] Import & Analyze outputs a full plain-language review (KPIs, month-by-month, categories, largest charges, wins/gaps, next steps)
- [x] Monthly guided review session in Money meeting (guide avatar, CSV step with loading spinner, balance updates with pause, report + next move, saved to Archive)
- [x] "More" tab now opens and closes the extra tools row

- [x] Debt-free date: projection chart on Debt, card on Overview, hero promise on home

## Legacy-app feature review (Sept 13) — full scope
Source: uploaded `money-meeting-build-prompt.md` (76 features, 8 areas from paycheck-planner-plus).
Review team: build lead (CTO), UX lead, marketing judge (competitor + literacy-org alignment).

Research verdict (marketing judge, real sources):
- 50/30/20 taught by CFPB (flyer + high-school Building Blocks activity); envelope/cash-stuffing taught by university extension + CUNY OER; zero-based real but commercially branded (YNAB/Ramsey/Fidelity) and matches FDIC Money Smart Module 4's "assign every dollar" plan.
- "Snowball budget" is Ramsey-branded whole-budget framing — do NOT ship as a budget method; keep snowball only as debt-payoff order.
- Pay-yourself-first = savings-automation principle, layer it on, not a 4th method.
- "Safe to spend / payday view" exists in Rocket Money (Payday View) and PocketGuard (In My Pocket) — both require bank linking. Manual-entry version is our differentiator.
- CFPB + Penn State Extension both publish separate irregular-income guidance → letting users pick a method is supported.

Build tasks:
- [ ] Cash on hand + pay schedule inputs (new `financial_snapshots`-style fields; manual entry only, no bank link)
- [ ] Paycheck-cycle engine: obligations due before next payday, holdback, safe-to-spend, risk level; returns "needs more info" instead of guessing
- [ ] "Am I okay until my next paycheck?" card on Overview
- [ ] "Your next money move" card on Overview
- [ ] Educational-not-advice disclaimer on every recommendation surface
- [ ] Budget method picker (50/30/20, Zero-based, Envelope) — one method shown at a time, chosen in Settings, with a "which fits me?" helper
- [ ] Needs/wants category buckets shared across methods (exhaustive map so a new category can't fall through)
- [ ] Review remaining legacy features (transaction analysis red flags, subscription audit, spending caps, month archive) and adopt only what doesn't re-crowd the app
- [ ] Do NOT build: 7-step archived-month meeting wizard, gamification streaks, month-snapshot system (covered by existing Money meeting + Import spending)
