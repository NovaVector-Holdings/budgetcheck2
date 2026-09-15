// Deterministic, network-free proof that src/lib/decision-engine.ts's
// buildFundingPlan actually implements the CEO's "PR #10 CONSOLIDATED
// TRUST CLOSURE" Part B fix: a debt minimum must require the SAME
// real-due-date-in-window proof as a bill before it enters the current
// cycle's ranked plan, never silently assumed due (unknown timing) and
// never silently assumed not-due (a real date genuinely outside this
// window is a different, unproblematic case).
//
// scripts/prove-grounding.ts's own fixture is hand-constructed for
// test-authoring convenience -- it manually writes funding.items rather
// than mechanically calling buildFundingPlan, so it cannot exercise the
// real engine function at all. This script closes that gap by importing
// buildFundingPlan/computeSnapshot directly and driving them with
// synthetic EngineInput objects.
//
// Run with: npx tsx scripts/prove-decision-engine.ts

import {
  buildFundingPlan,
  computeSnapshot,
  type EngineInput,
  type Window,
  type DebtObligation,
  type BillObligation,
} from "../src/lib/decision-engine";

let pass = 0;
let fail = 0;

function record(name: string, ok: boolean, detail?: string) {
  console.log(ok ? `PASS  ${name}` : `FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  if (ok) pass++;
  else fail++;
}

const WINDOW: Window = { start: "2026-09-13", end: "2026-09-20" };

/** A minimal, otherwise-empty EngineInput -- callers override `debts`
 *  (and occasionally `bills`) per test. Every non-debt field is held
 *  constant so each test isolates the ONE thing it's proving. */
function baseInput(debts: DebtObligation[]): EngineInput {
  return {
    todayIso: "2026-09-13",
    account: {
      currentBalance: 2000,
      pendingOutflows: [],
      pendingInflows: [],
      reservedFunds: [],
    },
    cycle: {
      lastDepositDate: "2026-09-06",
      nextDepositDate: "2026-09-20",
      nextDepositAmount: 1500,
      cadence: "biweekly",
    },
    obligations: {
      bills: [],
      debts,
      savingsGoals: [],
    },
    discretionary: {
      monthlyAvgObserved: null,
      currentCycleSpent: null,
      cap: null,
      leakCategories: [],
    },
    overrides: [],
    safeBuffer: 0,
    namedConstraints: [],
  };
}

function debt(overrides: Partial<DebtObligation>): DebtObligation {
  return {
    id: "d1",
    creditor: "Visa card",
    balance: 1200,
    apr: 24.99,
    minPayment: 35,
    dueDate: null,
    ...overrides,
  };
}

function bill(overrides: Partial<BillObligation>): BillObligation {
  return {
    id: "b1",
    name: "Rent",
    amount: 900,
    dueDate: "2026-09-20",
    category: "housing",
    autopay: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// 1. Debt due UNKNOWN (dueDate: null) -- the real, current, every-debt-
//    today shape. Must be excluded from items, surfaced via
//    debtsWithUnknownTiming, and NEVER counted toward totalRequested/
//    shortfall (an unverified obligation must not drive those numbers).
// ---------------------------------------------------------------------
{
  const plan = buildFundingPlan(baseInput([debt({ dueDate: null })]), WINDOW);
  const inItems = plan.items.some((it) => it.id === "debt:d1");
  const inUnknown = plan.debtsWithUnknownTiming.some((d) => d.id === "d1");
  const notCountedInTotal = plan.totalRequested === 0;
  record(
    "ENGINE: debt with dueDate: null is excluded from items, surfaced via debtsWithUnknownTiming, and not counted in totalRequested",
    !inItems && inUnknown && notCountedInTotal,
    `items=${JSON.stringify(plan.items.map((i) => i.id))} unknown=${JSON.stringify(plan.debtsWithUnknownTiming)} totalRequested=${plan.totalRequested}`,
  );
}

// ---------------------------------------------------------------------
// 2. Debt due IN-WINDOW -- a real due date inside [window.start,
//    window.end] enters the plan exactly like a bill does.
// ---------------------------------------------------------------------
{
  const plan = buildFundingPlan(baseInput([debt({ dueDate: "2026-09-18" })]), WINDOW);
  const item = plan.items.find((it) => it.id === "debt:d1");
  const notInUnknown = !plan.debtsWithUnknownTiming.some((d) => d.id === "d1");
  const counted = plan.totalRequested === 35;
  record(
    "ENGINE: debt with a real due date INSIDE the window enters items normally and is counted in totalRequested",
    !!item && item.status === "funded" && notInUnknown && counted,
    `item=${JSON.stringify(item)} unknown=${JSON.stringify(plan.debtsWithUnknownTiming)} totalRequested=${plan.totalRequested}`,
  );
}

// ---------------------------------------------------------------------
// 3. Debt due OUT-OF-WINDOW -- a real date, just outside the window.
//    Excluded from items (correctly -- it's not due this cycle), but
//    NOT in debtsWithUnknownTiming either, since its timing IS known,
//    just not this cycle. This is the case the CEO's directive
//    explicitly distinguished from "unknown".
// ---------------------------------------------------------------------
{
  const plan = buildFundingPlan(baseInput([debt({ dueDate: "2026-09-25" })]), WINDOW);
  const inItems = plan.items.some((it) => it.id === "debt:d1");
  const inUnknown = plan.debtsWithUnknownTiming.some((d) => d.id === "d1");
  record(
    "ENGINE: debt with a real due date OUTSIDE the window is excluded from items AND from debtsWithUnknownTiming (timing is known, just not this cycle)",
    !inItems && !inUnknown,
    `items=${JSON.stringify(plan.items.map((i) => i.id))} unknown=${JSON.stringify(plan.debtsWithUnknownTiming)}`,
  );
}

// ---------------------------------------------------------------------
// 4. Debt minimum excluded when timing unknown -- restated with a
//    nonzero minimum alongside an otherwise fully-fundable bill, to
//    prove the exclusion doesn't just happen to coincide with an empty
//    plan (test 1 above) but genuinely removes ONLY the unknown-timing
//    debt from an otherwise real, populated plan.
// ---------------------------------------------------------------------
{
  const input = baseInput([
    debt({ id: "d2", creditor: "Store card", minPayment: 25, dueDate: null }),
  ]);
  input.obligations.bills = [
    {
      id: "b1",
      name: "Rent",
      amount: 900,
      dueDate: "2026-09-20",
      category: "housing",
      autopay: false,
    },
  ];
  const plan = buildFundingPlan(input, WINDOW);
  const rentFunded = plan.items.find((it) => it.id === "bill:b1")?.status === "funded";
  const debtExcluded = !plan.items.some((it) => it.id === "debt:d2");
  const debtSurfaced = plan.debtsWithUnknownTiming.some((d) => d.id === "d2");
  const totalIsRentOnly = plan.totalRequested === 900;
  record(
    "ENGINE: an unknown-timing debt minimum is excluded from an otherwise real, populated plan -- Rent still funds normally, the debt minimum does not silently ride along",
    rentFunded && debtExcluded && debtSurfaced && totalIsRentOnly,
    `items=${JSON.stringify(plan.items.map((i) => ({ id: i.id, status: i.status })))} unknown=${JSON.stringify(plan.debtsWithUnknownTiming)} totalRequested=${plan.totalRequested}`,
  );
}

// ---------------------------------------------------------------------
// 5. computeSnapshot (the engine -> snapshot boundary the assistant and
//    dashboard both consume) propagates debtsWithUnknownTiming
//    unmodified -- no re-derivation, no silent drop at the boundary.
// ---------------------------------------------------------------------
{
  const input = baseInput([debt({ dueDate: null })]);
  const snapshot = computeSnapshot(input);
  const propagated =
    snapshot.complete === true &&
    snapshot.funding !== null &&
    snapshot.funding.debtsWithUnknownTiming.some((d) => d.id === "d1");
  record(
    "ENGINE -> SNAPSHOT: computeSnapshot propagates debtsWithUnknownTiming through to EngineSnapshot.funding unmodified",
    propagated,
    `snapshot.funding=${JSON.stringify(snapshot.funding)}`,
  );
}

// ---------------------------------------------------------------------
// Round-9 adversarial review regressions (found by a 7-boundary review
// after the above 5 tests were already green): malformed-but-non-null
// due dates, Infinity minimums, and calendar-invalid dates that
// Date.UTC would otherwise silently roll over.
// ---------------------------------------------------------------------

// 6. Malformed non-null debt dueDate -- empty string, whitespace,
//    non-ISO garbage, and an ISO datetime WITH a time-of-day component
//    (the actual shape a timestamptz column returns) must all be
//    treated exactly like dueDate: null, never silently vanish from
//    BOTH items and debtsWithUnknownTiming.
{
  const malformed = ["", "   ", "not-a-real-date", "09/15/2026", "2026-09-15T10:00:00Z"];
  let allOk = true;
  const details: string[] = [];
  for (const bad of malformed) {
    const plan = buildFundingPlan(baseInput([debt({ dueDate: bad })]), WINDOW);
    const ok =
      plan.items.length === 0 &&
      plan.debtsWithUnknownTiming.some((d) => d.id === "d1") &&
      plan.totalRequested === 0;
    if (!ok) {
      allOk = false;
      details.push(
        `dueDate=${JSON.stringify(bad)} items=${JSON.stringify(plan.items)} unknown=${JSON.stringify(plan.debtsWithUnknownTiming)}`,
      );
    }
  }
  record(
    "ENGINE: malformed non-null debt dueDate values (empty/whitespace/garbage/datetime-with-time) are treated exactly like null -- excluded from items, surfaced via debtsWithUnknownTiming",
    allOk,
    details.join(" | "),
  );
}

// 7. Same malformed-dueDate protection, on the bill side -- a bill with
//    an unusable dueDate is excluded from items (never silently
//    misclassified into a bogus in-window match), and does not corrupt
//    totalRequested.
{
  const input = baseInput([]);
  input.obligations.bills = [
    bill({ dueDate: "" }),
    bill({ id: "b2", name: "Water bill", amount: 150, dueDate: "2026-09-15T10:00:00Z" }),
  ];
  const plan = buildFundingPlan(input, WINDOW);
  record(
    "ENGINE: a bill with a malformed non-null dueDate is excluded from items (symmetric with the debt fix), never silently misclassified as in-window",
    plan.items.length === 0 && plan.totalRequested === 0,
    `items=${JSON.stringify(plan.items)}`,
  );
}

// 8. minPayment = Infinity must not satisfy the "> 0" guard -- excluded
//    from both items and debtsWithUnknownTiming, never poisoning
//    totalRequested/shortfall into Infinity.
{
  const plan = buildFundingPlan(
    baseInput([debt({ minPayment: Infinity, dueDate: "2026-09-15" })]),
    WINDOW,
  );
  const excludedFromItems = !plan.items.some((it) => it.id === "debt:d1");
  const excludedFromUnknown = !plan.debtsWithUnknownTiming.some((d) => d.id === "d1");
  const financesFinite = Number.isFinite(plan.totalRequested) && Number.isFinite(plan.shortfall);
  record(
    "ENGINE: minPayment: Infinity is excluded (not a real dollar amount) -- never poisons totalRequested/shortfall into Infinity",
    excludedFromItems && excludedFromUnknown && financesFinite,
    `items=${JSON.stringify(plan.items)} totalRequested=${plan.totalRequested} shortfall=${plan.shortfall}`,
  );
}

// 9. A shape-valid but calendar-invalid dueDate ("2026-13-45" -- month
//    13, day 45) must be treated as unknown timing, never silently
//    rolled over by Date.UTC into an unrelated, genuinely different
//    valid date and misclassified as "known but not due this cycle".
{
  const plan = buildFundingPlan(baseInput([debt({ dueDate: "2026-13-45" })]), WINDOW);
  record(
    "ENGINE: a calendar-invalid but shape-valid dueDate ('2026-13-45') is treated as unknown timing, not silently rolled over into a different valid date",
    !plan.items.some((it) => it.id === "debt:d1") &&
      plan.debtsWithUnknownTiming.some((d) => d.id === "d1"),
    `items=${JSON.stringify(plan.items)} unknown=${JSON.stringify(plan.debtsWithUnknownTiming)}`,
  );
}

// ---------------------------------------------------------------------
// CEO / PRODUCT REVIEW, "PR #10 FINAL PRE-MERGE CLOSURE" bounded
// correction 2: the rendered takeaway (and snapshot.headline, which is
// just an alias of it) must never say or imply full coverage while a
// real debt's timing is genuinely unknown. Four required cases, each
// testing the ACTUAL rendered string, not just array/state presence.
// ---------------------------------------------------------------------

// A. All known-timing items funded + debtsWithUnknownTiming non-empty
//    -> must NOT claim unqualified full coverage.
{
  const input = baseInput([debt({ dueDate: null })]); // unknown timing
  input.account.currentBalance = 5000; // plenty to fully fund Rent
  input.obligations.bills = [bill({})]; // Rent, due in-window, fully fundable
  const plan = buildFundingPlan(input, WINDOW);
  const snapshot = computeSnapshot(input);
  const allKnownFunded = plan.cutoffIndex === -1 && plan.items.length > 0;
  const hasUnknown = plan.debtsWithUnknownTiming.length > 0;
  const neverClaimsFullCoverage = !/^everything due before/i.test(plan.takeaway);
  const qualifiesKnownTimingOnly = /known timing/i.test(plan.takeaway);
  const headlineMatches = snapshot.headline === plan.takeaway;
  record(
    "TAKEAWAY A: known-timing items all funded, unknown debt timing exists -> takeaway/headline must not claim unqualified full coverage",
    allKnownFunded &&
      hasUnknown &&
      neverClaimsFullCoverage &&
      qualifiesKnownTimingOnly &&
      headlineMatches,
    `takeaway=${JSON.stringify(plan.takeaway)} headline=${JSON.stringify(snapshot.headline)}`,
  );
}

// B. No known-timing items in the window + unknown debt minimum exists
//    -> must NOT imply nothing is due.
{
  const input = baseInput([debt({ dueDate: null })]); // unknown timing, no bills at all
  const plan = buildFundingPlan(input, WINDOW);
  const snapshot = computeSnapshot(input);
  const noKnownItems = plan.items.length === 0;
  const hasUnknown = plan.debtsWithUnknownTiming.length > 0;
  const neverImpliesNothingDue = !/nothing you've entered is due/i.test(plan.takeaway);
  const saysMayStillBelong = /may still belong in this period/i.test(plan.takeaway);
  const headlineMatches = snapshot.headline === plan.takeaway;
  record(
    "TAKEAWAY B: no known-timing items scheduled, unknown debt minimum exists -> takeaway/headline must not imply nothing is due",
    noKnownItems && hasUnknown && neverImpliesNothingDue && saysMayStillBelong && headlineMatches,
    `takeaway=${JSON.stringify(plan.takeaway)} headline=${JSON.stringify(snapshot.headline)}`,
  );
}

// C. A real known-timing shortfall exists + unknown debt timing also
//    exists -> the real shortfall must be preserved exactly (never
//    hidden, never adjusted for the unknown debt's amount, never a
//    guess about when it's due), qualified with the honest caveat.
{
  const input = baseInput([debt({ dueDate: null, minPayment: 999 })]); // unknown timing
  input.account.currentBalance = 500; // not enough to fund both bills below
  input.obligations.bills = [
    bill({}), // Rent, 900, due 2026-09-20
    bill({ id: "b2", name: "Water bill", amount: 150, dueDate: "2026-09-16" }),
  ];
  const plan = buildFundingPlan(input, WINDOW);
  const snapshot = computeSnapshot(input);
  const realShortfall = plan.cutoffIndex !== -1 && plan.shortfall > 0;
  const hasUnknown = plan.debtsWithUnknownTiming.length > 0;
  // The unknown debt's $999 minimum must never enter this arithmetic.
  const shortfallUnaffectedByUnknownDebt = plan.totalRequested === 900 + 150;
  const shortfallStillReported = /short across/i.test(plan.takeaway);
  const caveatPresent = /debt-minimum timing is also incomplete/i.test(plan.takeaway);
  const headlineMatches = snapshot.headline === plan.takeaway;
  record(
    "TAKEAWAY C: known-timing shortfall + unknown debt timing -> real shortfall preserved verbatim, unknown-timing caveat also present, arithmetic untouched by the unknown debt",
    realShortfall &&
      hasUnknown &&
      shortfallUnaffectedByUnknownDebt &&
      shortfallStillReported &&
      caveatPresent &&
      headlineMatches,
    `takeaway=${JSON.stringify(plan.takeaway)} totalRequested=${plan.totalRequested} shortfall=${plan.shortfall}`,
  );
}

// D. All relevant debt timing known (no debtsWithUnknownTiming at all)
//    + all items funded -> the ORIGINAL, unqualified covered wording
//    must still PASS unchanged -- this fix must not regress the common
//    case.
{
  const input = baseInput([]); // no debts at all -- nothing unknown
  input.account.currentBalance = 5000;
  input.obligations.bills = [bill({})];
  const plan = buildFundingPlan(input, WINDOW);
  const snapshot = computeSnapshot(input);
  const noUnknown = plan.debtsWithUnknownTiming.length === 0;
  const claimsFullCoverage = /^everything due before/i.test(plan.takeaway);
  const noCaveatLeaked = !/debt-minimum timing/i.test(plan.takeaway);
  const headlineMatches = snapshot.headline === plan.takeaway;
  record(
    "TAKEAWAY D: no unknown-timing debts at all, all items funded -> the normal unqualified covered wording still PASSES unchanged",
    noUnknown && claimsFullCoverage && noCaveatLeaked && headlineMatches,
    `takeaway=${JSON.stringify(plan.takeaway)} headline=${JSON.stringify(snapshot.headline)}`,
  );
}

console.log("");
console.log(`${pass}/${pass + fail} decision-engine proof cases passed`);

if (fail > 0) {
  console.error(`${fail} decision-engine proof case(s) FAILED.`);
  process.exit(1);
}
