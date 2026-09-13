# Roadmap

## Money Meeting upgrade (full technical scope from the uploaded brief)
- [x] Data layer: accounts, reserved funds, caps, imports, artifacts, pattern rules, priority overrides, sessions/messages
- [x] Pattern detection on raw descriptions, stored as data and user-extensible
- [x] Flexible column mapper for CSV/TSV/XLS/XLSX + reconciliation diff
- [ ] Decision engine: pay-cycle projected minimum balance, ranked funding allocator, pay-vs-hold, reserved funds, leak detection
- [ ] Disambiguation loop (max 3 batched questions before analysis finalises)
- [ ] Artifacts: cash-flow dashboard, payoff schedule, printable checklist, budget vs actual, savings phase tracker — saved, re-openable, recomputable, persisted check state
- [ ] Conversational assistant over the engine snapshot, with the Section 5 behaviour rules
- [ ] Screenshot balance reading (balance, due date, minimum payment)
- [ ] Rebuild /money-meeting around the new tabs
- [ ] Per-mode headings and captions (weekly vs monthly vs assistant) — not one shared title
- [ ] No paywall: every part of Money Meeting is free
