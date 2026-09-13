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
