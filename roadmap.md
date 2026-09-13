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
