// Deterministic, network-free proof of src/lib/plan-status.ts -- the Gate 2
// remediation's plan-COMPLETENESS state (CEO ruling "GATE 2 RESULT + FINAL
// REMEDIATION PATH", 2026-10-09).
//
// What this proves, against the REAL engine (computeSnapshot is called, never
// hand-built):
//   1. A required debt minimum with no known due date makes the plan
//      "incomplete" -- and only that does. Known dates, dates outside the
//      window, and debts with no minimum never do.
//   2. Incomplete DOMINATES: it wins over a known shortfall and over an empty
//      window, and the engine's own `complete` flag (setup-complete) is left
//      alone -- plan-status is a separate derivation, not a repurposing.
//   3. The footing rows the Overview prints (Balance - Keep available -
//      Reserved - Buffer ... ) always sum to the engine's own remainder
//      (available - totalRequested), including the clamp, reserved-funds and
//      inflow corner cases -- the "$640 - known obligations - buffer =
//      remainder" relationship is arithmetic, not decoration.
//   4. Every state carries exactly ONE next-focus string, and the complete
//      healthy state never repeats the remainder figure in its status text.
//   5. balanceSource tells "no balance on file" apart from a real $0 and
//      follows the same accounts-over-profile precedence buildEngineInput uses.
//
// Run with: npx tsx scripts/prove-plan-status.ts

import {
  computeSnapshot,
  type EngineInput,
  type DebtObligation,
  type BillObligation,
  type ReservedFund,
  type PendingFlow,
} from "../src/lib/decision-engine";
import { derivePlanStatus, oldestAsOf, type PlanStatus } from "../src/lib/plan-status";
import { balanceSource, buildEngineInput, type MmAccount } from "../src/lib/mm";
import type { Profile } from "../src/lib/money";

let pass = 0;
let fail = 0;

function record(name: string, ok: boolean, detail?: string) {
  console.log(ok ? `PASS  ${name}` : `FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  if (ok) pass++;
  else fail++;
}

const TODAY = "2026-10-09";
const PAYDAY = "2026-10-16";

interface Fixture {
  balance?: number;
  buffer?: number;
  debts?: DebtObligation[];
  bills?: BillObligation[];
  reserved?: ReservedFund[];
  inflows?: PendingFlow[];
  payday?: string | null;
  cadence?: EngineInput["cycle"]["cadence"];
}

function input(f: Fixture = {}): EngineInput {
  return {
    todayIso: TODAY,
    account: {
      currentBalance: f.balance ?? 640,
      pendingOutflows: [],
      pendingInflows: f.inflows ?? [],
      reservedFunds: f.reserved ?? [],
    },
    cycle: {
      lastDepositDate: null,
      nextDepositDate: f.payday === undefined ? PAYDAY : f.payday,
      nextDepositAmount: null,
      cadence: f.cadence === undefined ? "biweekly" : f.cadence,
    },
    obligations: { bills: f.bills ?? [], debts: f.debts ?? [], savingsGoals: [] },
    discretionary: {
      monthlyAvgObserved: null,
      currentCycleSpent: null,
      cap: null,
      leakCategories: [],
    },
    overrides: [],
    safeBuffer: f.buffer ?? 100,
    namedConstraints: [],
  };
}

const debt = (o: Partial<DebtObligation> = {}): DebtObligation => ({
  id: "d1",
  creditor: "Visa card",
  balance: 1200,
  apr: 24.99,
  minPayment: 35,
  dueDate: null,
  ...o,
});

const bill = (o: Partial<BillObligation> = {}): BillObligation => ({
  id: "b1",
  name: "Electric bill",
  amount: 85,
  dueDate: "2026-10-12",
  category: "utilities",
  autopay: false,
  ...o,
});

const ctx = { balanceSource: "profile" as const, balanceAsOf: "2026-10-08" };

function status(f: Fixture = {}, c: Parameters<typeof derivePlanStatus>[2] = ctx) {
  const inp = input(f);
  const snap = computeSnapshot(inp);
  return { inp, snap, ps: derivePlanStatus(snap, inp, c) };
}

const sum = (ps: PlanStatus) =>
  ps.kind === "setup" ? NaN : Math.round(ps.footing.reduce((s, r) => s + r.amount, 0) * 100) / 100;

/** footing rows must equal the engine's own remainder */
function footsToEngine(f: Fixture): boolean {
  const { snap, ps } = status(f);
  if (ps.kind === "setup" || !snap.funding) return false;
  const engine = Math.round((snap.funding.available - snap.funding.totalRequested) * 100) / 100;
  return Math.abs(sum(ps) - engine) < 0.005 && Math.abs(ps.remainder - engine) < 0.005;
}

// ---- 1. what makes a plan incomplete --------------------------------------

{
  const { ps, snap } = status({ debts: [debt()], bills: [bill()] });
  record(
    "INCOMPLETE 1: a required minimum with NO due date -> kind 'incomplete', names it, one next focus",
    ps.kind === "incomplete" &&
      ps.unplaced.length === 1 &&
      ps.unplaced[0].name === "Visa card" &&
      ps.unplacedTotal === 35 &&
      ps.nextFocus === "Add the due date for Visa card.",
    JSON.stringify(ps),
  );
  record(
    "INCOMPLETE 1b: engine `complete` (setup) is untouched and still true -- plan-status is a separate derivation",
    snap.complete === true,
  );
}

{
  const { ps } = status({
    debts: [
      debt({ id: "d1", creditor: "Visa card", minPayment: 35 }),
      debt({ id: "d2", creditor: "Car loan", minPayment: 220 }),
    ],
  });
  record(
    "INCOMPLETE 2: two unplaced minimums -> total is their sum, ONE plural next-focus sentence",
    ps.kind === "incomplete" &&
      ps.unplaced.length === 2 &&
      ps.unplacedTotal === 255 &&
      ps.nextFocus === "Add the due date for each payment listed above.",
    JSON.stringify(ps),
  );
}

{
  const { ps } = status({ debts: [debt({ dueDate: "2026-10-14" })], bills: [bill()] });
  record(
    "COMPLETE 1: the SAME debt WITH a due date inside the window is placed in Keep available -> not incomplete",
    ps.kind === "healthy" &&
      ps.keepItems.some((k) => k.label === "Visa card minimum" && k.amount === 35) &&
      ps.remainder === 640 - 100 - 85 - 35,
    JSON.stringify(ps),
  );
}

{
  const { ps } = status({ debts: [debt({ dueDate: "2026-11-14" })], bills: [bill()] });
  record(
    "COMPLETE 2: a real due date OUTSIDE the window is a known, unproblematic exclusion -> complete, not listed",
    ps.kind === "healthy" && !ps.keepItems.some((k) => /Visa/.test(k.label)),
    JSON.stringify(ps),
  );
}

{
  const a = status({ debts: [debt({ minPayment: null })], bills: [bill()] }).ps;
  const b = status({ debts: [debt({ minPayment: 0 })], bills: [bill()] }).ps;
  record(
    "COMPLETE 3: a debt with no (or $0) minimum is not a required payment -> never makes the plan incomplete",
    a.kind === "healthy" && b.kind === "healthy",
    `${a.kind} / ${b.kind}`,
  );
}

{
  const { ps } = status({ debts: [], bills: [bill()] });
  record(
    "COMPLETE 4: no debts at all + covered known bills -> healthy, never 'incomplete'",
    ps.kind === "healthy",
    ps.kind,
  );
}

// ---- 2. incomplete dominates ------------------------------------------------

{
  const { ps, snap } = status({
    balance: 150,
    debts: [debt()],
    bills: [bill({ amount: 400 })],
  });
  record(
    "DOMINANCE 1: incomplete + a KNOWN shortfall -> still 'incomplete' (the known shortfall is only a lower bound)",
    ps.kind === "incomplete" && ps.remainder < 0 && (snap.funding?.shortfall ?? 0) > 0,
    JSON.stringify(ps),
  );
}

{
  const { ps } = status({ debts: [debt()], bills: [] });
  record(
    "DOMINANCE 2: incomplete + NOTHING else due -> 'incomplete', not 'empty' (an undated minimum may still belong here)",
    ps.kind === "incomplete" && !ps.footing.some((r) => r.key === "keep") && ps.remainder === 540,
    JSON.stringify(ps),
  );
}

// ---- 3. the other states ------------------------------------------------------

{
  const { ps, snap } = status({ balance: 150, bills: [bill({ amount: 400 })] });
  record(
    "SHORTFALL: complete plan, known shortfall -> 'shortfall', short = engine shortfall, next focus is the engine's own sentence",
    ps.kind === "shortfall" &&
      ps.short === snap.funding!.shortfall &&
      ps.nextFocus === snap.headline,
    JSON.stringify(ps),
  );
}

{
  const { ps } = status({ bills: [] });
  record(
    "EMPTY: complete plan, nothing due in the window -> 'empty' with the engine's honest 'not that nothing is coming' sentence",
    ps.kind === "empty" &&
      /not that nothing is coming/.test(ps.status) &&
      /Your next payday is/.test(ps.nextFocus),
    JSON.stringify(ps),
  );
}

{
  const { ps } = status({
    bills: [bill({ id: "b2", name: "Phone bill", amount: 60, dueDate: "2026-10-15" }), bill()],
  });
  record(
    "HEALTHY 1: complete + covered -> ONE next focus = the EARLIEST-due item, no advice about the remainder",
    ps.kind === "healthy" && ps.nextFocus === "Electric bill, $85.00, is due October 12.",
    JSON.stringify(ps),
  );
  record(
    "HEALTHY 2: the status sentence never repeats a dollar figure (the remainder appears exactly once, in the calculation)",
    ps.kind === "healthy" && !/\$/.test(ps.status),
    ps.kind === "healthy" ? ps.status : "",
  );
}

// ---- 4. setup -------------------------------------------------------------------

{
  const { ps } = status({ payday: null });
  record(
    "SETUP 1: no payday -> 'setup' listing the engine's own missing fields, balance not flagged",
    ps.kind === "setup" && ps.missing.some((m) => m.field === "next_pay_date") && !ps.needsBalance,
    JSON.stringify(ps),
  );
}

{
  const { ps } = status({}, { balanceSource: "none", balanceAsOf: null });
  record(
    "SETUP 2: NO balance on file (not a real $0) -> 'setup' with needsBalance, even though the engine collapses it to 0",
    ps.kind === "setup" && ps.needsBalance,
    JSON.stringify(ps),
  );
}

{
  const { ps } = status({ balance: 0, bills: [bill()] });
  record(
    "SETUP 3: a REAL $0 balance on file is a legitimate calculation, not a setup gap",
    ps.kind === "shortfall",
    ps.kind,
  );
}

// ---- 5. footing is arithmetic -------------------------------------------------------

record("FOOTING 1: balance - keep - buffer", footsToEngine({ bills: [bill()] }));
record(
  "FOOTING 2: reserved funds get their OWN row and the rows still sum to the engine's remainder",
  footsToEngine({
    reserved: [{ id: "r1", label: "Car fund", amount: 300, purpose: "", tapped: 50 }],
    bills: [bill()],
  }) &&
    status({
      reserved: [{ id: "r1", label: "Car fund", amount: 300, purpose: "", tapped: 50 }],
      bills: [bill()],
    }).ps.kind === "healthy" &&
    (
      status({
        reserved: [{ id: "r1", label: "Car fund", amount: 300, purpose: "", tapped: 50 }],
        bills: [bill()],
      }).ps as Extract<PlanStatus, { kind: "healthy" }>
    ).footing.some((r) => r.key === "reserved" && r.amount === -250),
);
record(
  "FOOTING 3: balance BELOW the buffer (the engine floors at $0) -> an explicit 'counted as $0' row keeps the rows summing to the remainder",
  footsToEngine({ balance: 60, buffer: 100, bills: [] }) &&
    (
      status({ balance: 60, buffer: 100, bills: [] }).ps as Extract<PlanStatus, { kind: "empty" }>
    ).footing.some((r) => r.key === "floor" && r.amount === 40),
);
{
  const overdrawn = status({ balance: -30, buffer: 0, bills: [] }).ps;
  const belowBuffer = status({ balance: 60, buffer: 100, bills: [] }).ps;
  const floorLabel = (ps: PlanStatus) =>
    ps.kind === "setup" ? "" : (ps.footing.find((r) => r.key === "floor")?.label ?? "");
  record(
    "FOOTING 3b: the clamp row's wording matches the cause -- overdrawn says so; 'set aside' only when something IS set aside",
    footsToEngine({ balance: -30, buffer: 0, bills: [] }) &&
      /overdrawn/i.test(floorLabel(overdrawn)) &&
      !/set aside/i.test(floorLabel(overdrawn)) &&
      /set aside/i.test(floorLabel(belowBuffer)),
    `${floorLabel(overdrawn)} | ${floorLabel(belowBuffer)}`,
  );
}
record(
  "FOOTING 4: a certain inflow inside the window gets its own row",
  footsToEngine({
    inflows: [{ id: "i1", desc: "Refund", amount: 120, date: "2026-10-14", certain: true }],
    bills: [bill()],
  }) &&
    (
      status({
        inflows: [{ id: "i1", desc: "Refund", amount: 120, date: "2026-10-14", certain: true }],
        bills: [bill()],
      }).ps as Extract<PlanStatus, { kind: "healthy" }>
    ).footing.some((r) => r.key === "inflows" && r.amount === 120),
);

// A deterministic sweep: every combination below must (a) foot to the engine,
// (b) classify as incomplete iff the engine lists an unplaced minimum, and
// (c) carry exactly one non-empty next-focus string.
{
  let n = 0;
  let badFoot = 0;
  let badKind = 0;
  let badFocus = 0;
  for (const balance of [0, 40, 100, 640, 5000]) {
    for (const buffer of [0, 100, 700]) {
      for (const debtCase of ["none", "unknown", "in-window", "out-of-window", "no-min"] as const) {
        for (const billAmt of [0, 85, 900]) {
          for (const reserved of [0, 250]) {
            const debts =
              debtCase === "none"
                ? []
                : debtCase === "unknown"
                  ? [debt()]
                  : debtCase === "in-window"
                    ? [debt({ dueDate: "2026-10-14" })]
                    : debtCase === "out-of-window"
                      ? [debt({ dueDate: "2026-11-02" })]
                      : [debt({ minPayment: null })];
            const f: Fixture = {
              balance,
              buffer,
              debts,
              bills: billAmt ? [bill({ amount: billAmt })] : [],
              reserved: reserved
                ? [{ id: "r", label: "Fund", amount: reserved, purpose: "", tapped: 0 }]
                : [],
            };
            const { snap, ps } = status(f);
            n++;
            if (ps.kind === "setup") continue;
            const engine =
              Math.round((snap.funding!.available - snap.funding!.totalRequested) * 100) / 100;
            if (Math.abs(sum(ps) - engine) >= 0.005) badFoot++;
            const unknown = snap.funding!.debtsWithUnknownTiming.length > 0;
            if ((ps.kind === "incomplete") !== unknown) badKind++;
            if (typeof ps.nextFocus !== "string" || ps.nextFocus.trim().length === 0) badFocus++;
          }
        }
      }
    }
  }
  record(
    `SWEEP (${n} states): footing rows == engine remainder in every one`,
    badFoot === 0,
    `${badFoot} mismatches`,
  );
  record(
    `SWEEP (${n} states): 'incomplete' <=> engine lists an unplaced minimum, in every one`,
    badKind === 0,
    `${badKind} mismatches`,
  );
  record(
    `SWEEP (${n} states): every state has exactly one non-empty next-focus string`,
    badFocus === 0,
    `${badFocus} missing`,
  );
}

// ---- 6. balanceSource / balance precedence --------------------------------------------

{
  const acct = (o: Partial<MmAccount>): MmAccount => ({
    id: "a1",
    user_id: "u",
    name: "Checking",
    kind: "checking",
    institution: null,
    current_balance: 500,
    credit_limit: null,
    balance_as_of: "2026-10-01",
    archived: false,
    ...o,
  });
  const prof = (cash: number | null): Profile =>
    ({
      id: "u",
      cash_on_hand: cash,
      spending_buffer: 0,
      next_pay_date: PAYDAY,
      pay_frequency: "biweekly",
    }) as unknown as Profile;

  record(
    "BALANCE 1: a live spendable account wins over profile.cash_on_hand",
    balanceSource(prof(640), [acct({})]) === "accounts",
  );
  record(
    "BALANCE 2: archived / non-spendable accounts are ignored -> falls back to profile",
    balanceSource(prof(640), [acct({ archived: true }), acct({ id: "a2", kind: "savings" })]) ===
      "profile",
  );
  record(
    "BALANCE 3: no spendable account and no cash_on_hand -> 'none' (NOT a $0 balance)",
    balanceSource(prof(null), []) === "none" && balanceSource(null, []) === "none",
  );
  record(
    "BALANCE 4: cash_on_hand = 0 is a real entered balance -> 'profile'",
    balanceSource(prof(0), []) === "profile",
  );

  // balanceSource must agree with the number buildEngineInput actually feeds the engine.
  const args = {
    todayIso: TODAY,
    reserved: [],
    caps: [],
    expenses: [],
    debts: [],
    goals: [],
    savedByGoal: new Map<string, number>(),
    overrides: [],
  };
  const withAcct = buildEngineInput({ ...args, profile: prof(640), accounts: [acct({})] });
  const withProf = buildEngineInput({ ...args, profile: prof(640), accounts: [] });
  record(
    "BALANCE 5: balanceSource agrees with buildEngineInput -- accounts -> 500, profile -> 640",
    withAcct.account.currentBalance === 500 && withProf.account.currentBalance === 640,
    `${withAcct.account.currentBalance} / ${withProf.account.currentBalance}`,
  );
  record(
    "BALANCE 6: oldestAsOf picks the stalest date, ignores nulls",
    oldestAsOf(["2026-10-08", null, "2026-09-24"]) === "2026-09-24" &&
      oldestAsOf([null, undefined]) === null,
  );
}

console.log("");
console.log(`${pass}/${pass + fail} plan-status proof cases passed`);

if (fail > 0) {
  console.error(`${fail} plan-status proof case(s) FAILED.`);
  process.exit(1);
}
