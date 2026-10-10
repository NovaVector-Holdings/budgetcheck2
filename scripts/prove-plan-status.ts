// Deterministic, network-free proof of src/lib/plan-status.ts -- the Gate 2
// remediation's plan-COMPLETENESS state (CEO ruling "GATE 2 RESULT + FINAL
// REMEDIATION PATH", 2026-10-09).
//
// What this proves, against the REAL engine (computeSnapshot is called, never
// hand-built):
//   1. The plan is "incomplete" exactly when the ENGINE says so
//      (snapshot.planComplete === false once setup is on file): an ACTIVE debt
//      (balance > 0) whose due day is unknown, or whose minimum payment is
//      unknown (SME/CEO return). Known dates, dates outside the window, a
//      PAID-OFF debt (balance <= 0) and an explicit $0 minimum never do.
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
//   6. The exact words a person is told, for every combination of reasons
//      (timing only / minimum only / both), and that the Debt-free goal card
//      never shows a confident payoff date when the date would be built on a
//      missing minimum, and qualifies it when only due days are missing.
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
import {
  derivePlanStatus,
  oldestAsOf,
  planStatusFromState,
  type PlanStatus,
} from "../src/lib/plan-status";
import { balanceSource, buildEngineInput, type MmAccount } from "../src/lib/mm";
import { debtFreeCardState, joinDebtNames } from "../src/lib/debt-free-card";
import type { Debt, Profile } from "../src/lib/money";

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
  // SME/CEO return, REVERSING the first version of this case: an ACTIVE debt
  // with an UNKNOWN minimum (null) used to vanish and read as "healthy". It now
  // makes the plan incomplete. An explicit $0 minimum is the person saying "no
  // payment is required" -- known, so still complete.
  const a = status({ debts: [debt({ minPayment: null })], bills: [bill()] }).ps;
  const b = status({ debts: [debt({ minPayment: 0 })], bills: [bill()] }).ps;
  record(
    "COMPLETE 3: an explicit $0 minimum is KNOWN (no payment required) -> complete; a NULL minimum is unknown -> incomplete",
    b.kind === "healthy" && a.kind === "incomplete",
    `${a.kind} / ${b.kind}`,
  );
  record(
    "INCOMPLETE 3: an active debt with no minimum on file is named, flagged 'minimum' (not 'timing'), and has no dollar amount",
    a.kind === "incomplete" &&
      a.unplaced.length === 1 &&
      a.unplaced[0].reason === "minimum" &&
      a.unplaced[0].minPayment === null &&
      a.hasUnknownAmount === true &&
      a.reasons.minimum === true &&
      a.reasons.timing === false,
    JSON.stringify(a),
  );
}

{
  // A PAID-OFF debt (balance <= 0) is not a required current payment, whatever
  // minimum / due day is still on the row.
  const noDate = status({ debts: [debt({ balance: 0, minPayment: 45 })], bills: [bill()] }).ps;
  const nullMin = status({ debts: [debt({ balance: 0, minPayment: null })], bills: [bill()] }).ps;
  const inWin = status({
    debts: [debt({ balance: 0, minPayment: 45, dueDate: "2026-10-14" })],
    bills: [bill()],
  }).ps;
  record(
    "COMPLETE 5: a PAID-OFF debt never holds the plan incomplete (undated, null minimum, or dated in the window) and never enters Keep available",
    noDate.kind === "healthy" &&
      nullMin.kind === "healthy" &&
      inWin.kind === "healthy" &&
      !inWin.keepItems.some((k) => /Visa/.test(k.label)),
    `${noDate.kind} / ${nullMin.kind} / ${inWin.kind}`,
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

// ---- 1b. exactly what a person is told, per reason ----------------------------

{
  const timingOne = status({ debts: [debt()], bills: [bill()] }).ps;
  const timingMany = status({
    debts: [
      debt({ id: "d1", creditor: "Visa card" }),
      debt({ id: "d2", creditor: "Store card", minPayment: 25 }),
    ],
    bills: [bill()],
  }).ps;
  const minOne = status({ debts: [debt({ minPayment: null })], bills: [bill()] }).ps;
  const minMany = status({
    debts: [
      debt({ id: "d1", creditor: "Visa card", minPayment: null }),
      debt({ id: "d2", creditor: "Store card", minPayment: null }),
    ],
    bills: [bill()],
  }).ps;
  const both = status({
    debts: [
      debt({ id: "d1", creditor: "Visa card", minPayment: null }),
      debt({ id: "d2", creditor: "Store card", minPayment: 25 }),
    ],
    bills: [bill()],
  }).ps;
  const pick = (ps: PlanStatus) => (ps.kind === "incomplete" ? ps : null);
  record(
    "COPY 1: timing-only keeps the APPROVED headline and 'Add due dates' wording exactly",
    pick(timingOne)?.headline ===
      "Debt-payment timing is incomplete, so this paycheck plan is not final." &&
      pick(timingOne)?.ctaLabel === "Add due dates →" &&
      pick(timingMany)?.headline === pick(timingOne)?.headline &&
      pick(timingMany)?.nextFocus === "Add the due date for each payment listed above." &&
      pick(timingMany)?.totalLabel === "Not yet placed in this paycheck" &&
      pick(timingMany)?.unplacedTotal === 60,
    JSON.stringify([pick(timingOne), pick(timingMany)]),
  );
  record(
    "COPY 2: minimum-only gets its OWN honest sentence (never 'timing'), singular and plural",
    pick(minOne)?.headline ===
      "A required debt payment amount is missing, so this paycheck plan is not final." &&
      pick(minOne)?.nextFocus === "Add the minimum payment for Visa card." &&
      pick(minOne)?.ctaLabel === "Add the minimum payment →" &&
      pick(minMany)?.nextFocus === "Add the minimum payment for each debt listed above." &&
      pick(minMany)?.ctaLabel === "Add minimum payments →" &&
      !/due/i.test(pick(minOne)?.headline ?? "") &&
      !/due/i.test(pick(minOne)?.lead ?? ""),
    JSON.stringify([pick(minOne), pick(minMany)]),
  );
  record(
    "COPY 3: both reasons -> a neutral 'details' headline, the unplaced debts listed in the order they were entered, and the total labeled 'Known minimums'",
    pick(both)?.headline ===
      "Debt-payment details are incomplete, so this paycheck plan is not final." &&
      pick(both)
        ?.unplaced.map((d) => `${d.name}:${d.reason}`)
        .join(",") === "Visa card:minimum,Store card:timing" &&
      pick(both)?.totalLabel === "Known minimums not yet placed" &&
      pick(both)?.unplacedTotal === 25 &&
      pick(both)?.hasUnknownAmount === true,
    JSON.stringify(pick(both)),
  );
  record(
    "COPY 4: no state's headline or lead ever contains 'Estimated remaining' or a dollar figure (the remainder is not restated in the warning)",
    [timingOne, timingMany, minOne, minMany, both].every(
      (ps) =>
        ps.kind === "incomplete" && !/Estimated remaining|\$/.test(ps.headline + " " + ps.lead),
    ),
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
      for (const debtCase of [
        "none",
        "unknown",
        "in-window",
        "out-of-window",
        "no-min",
        "zero-min",
        "paid-off",
        "paid-off-dated",
      ] as const) {
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
                      : debtCase === "no-min"
                        ? [debt({ minPayment: null })]
                        : debtCase === "zero-min"
                          ? [debt({ minPayment: 0 })]
                          : debtCase === "paid-off"
                            ? [debt({ balance: 0 })]
                            : [debt({ balance: 0, dueDate: "2026-10-14" })];
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
            const unknown =
              snap.funding!.debtsWithUnknownTiming.length > 0 ||
              snap.funding!.debtsWithUnknownMinimum.length > 0;
            // ONE semantic truth: Overview "incomplete" <=> engine planComplete false
            // <=> an unplaced debt is listed.
            if ((ps.kind === "incomplete") !== unknown) badKind++;
            if ((ps.kind === "incomplete") !== !snap.planComplete) badKind++;
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
    `SWEEP (${n} states): 'incomplete' <=> engine planComplete is false <=> an active debt is unplaced, in every one`,
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

// ---- 7. Debt-free goal card + shared PlanView + balanceKnown ---------------------------

{
  const prof = (o: Partial<Profile> = {}): Profile =>
    ({
      id: "u",
      cash_on_hand: 640,
      spending_buffer: 100,
      balance_as_of: "2026-10-08",
      next_pay_date: PAYDAY,
      pay_frequency: "biweekly",
      ...o,
    }) as unknown as Profile;
  const row = (
    id: string,
    name: string,
    balance: number,
    minimum_payment: number | null,
    due_day: number | null,
    apr = 20,
  ): Debt =>
    ({
      id,
      user_id: "u",
      name,
      balance,
      apr,
      minimum_payment,
      due_day,
      archived: false,
      created_at: "2026-09-01",
    }) as unknown as Debt;
  const run = (debts: Debt[], profile: Profile | null = prof()) => {
    const engineInput = buildEngineInput({
      todayIso: TODAY,
      profile,
      accounts: [],
      reserved: [],
      caps: [],
      expenses: [],
      debts,
      goals: [],
      savedByGoal: new Map<string, number>(),
      overrides: [],
    });
    const snapshot = computeSnapshot(engineInput);
    const view = planStatusFromState({ profile, accounts: [], snapshot, engineInput });
    const card = debtFreeCardState({
      debts,
      obligations: engineInput.obligations.debts,
      status: view.status,
    });
    return { engineInput, snapshot, view, card };
  };

  // all minimums known, due days known (one inside the window, two outside)
  const dated = [
    row("d1", "Visa card", 1450, 45, 14),
    row("d2", "Store card", 640, 25, 24),
    row("d3", "Personal loan", 700, 45, 5),
  ];
  const complete = run(dated);
  record(
    "CARD 1: complete plan (every debt has a minimum and a due day) -> healthy status AND an UNQUALIFIED payoff date",
    complete.view.status.kind === "empty" || complete.view.status.kind === "healthy"
      ? complete.card.kind === "estimate" && complete.card.dueDatesIncomplete === false
      : false,
    JSON.stringify([complete.view.status.kind, complete.card.kind]),
  );
  record(
    "CARD 2: due-day placement is real -- Visa (due the 14th) lands INSIDE the window, Store card (24th) and Personal loan (5th -> Nov 5) outside",
    complete.view.status.kind === "healthy" &&
      complete.view.status.keepItems.map((k) => k.label).join("|") === "Visa card minimum",
    JSON.stringify(complete.view.status),
  );

  // due days missing on some debts, every minimum known
  const timing = run([
    row("d1", "Visa card", 1450, 45, 14),
    row("d2", "Store card", 640, 25, null),
    row("d3", "Personal loan", 700, 45, null),
  ]);
  record(
    "CARD 3: only due days missing -> the date is KEPT but QUALIFIED (dueDatesIncomplete), and the card's link target is the first debt missing a due day",
    timing.view.status.kind === "incomplete" &&
      timing.card.kind === "estimate" &&
      timing.card.dueDatesIncomplete === true &&
      timing.card.firstTimingId === "d2",
    JSON.stringify([timing.view.status.kind, timing.card]),
  );

  // an active debt with NO minimum -> no date at all
  const nomin = run([row("d1", "Visa card", 1450, null, 14), row("d2", "Store card", 640, 25, 24)]);
  record(
    "CARD 4: an active debt with an UNKNOWN minimum -> NO payoff date (it would be built on $0 for that debt); names it and links to it",
    nomin.view.status.kind === "incomplete" &&
      nomin.card.kind === "blocked" &&
      nomin.card.names === "Visa card" &&
      nomin.card.count === 1 &&
      nomin.card.firstId === "d1",
    JSON.stringify(nomin.card),
  );

  // even with NO payday yet (setup status, funding === null) the suppression still holds
  const setupNoDate = run([row("d1", "Visa card", 1450, null, 14)], prof({ next_pay_date: null }));
  record(
    "CARD 5: the unknown-minimum suppression does NOT depend on a funding plan -- it still holds in the 'setup' status (no payday yet)",
    setupNoDate.view.status.kind === "setup" && setupNoDate.card.kind === "blocked",
    JSON.stringify([setupNoDate.view.status.kind, setupNoDate.card.kind]),
  );

  // paid-off debts are ignored; all-$0 rows get their own sentence
  const paidOff = run([row("d1", "Old card", 0, 35, null)]);
  const none = run([]);
  record(
    "CARD 6: paid-off ($0) debts never block or qualify the card; 'every debt at $0' is distinguished from 'no debts tracked'",
    paidOff.card.kind === "no-debts" &&
      (paidOff.card as { hadRows: boolean }).hadRows === true &&
      none.card.kind === "no-debts" &&
      (none.card as { hadRows: boolean }).hadRows === false &&
      paidOff.view.status.kind !== "incomplete",
    JSON.stringify([paidOff.card, none.card]),
  );

  // explicit zero minimums -> nothing to pay -> cannot estimate, with the existing copy
  const zero = run([row("d1", "Visa card", 500, 0, null)]);
  record(
    "CARD 7: explicit $0 minimums (no payment required) are KNOWN -> plan complete, and the card says it cannot estimate yet (never a date)",
    zero.view.status.kind !== "incomplete" &&
      zero.card.kind === "cannot-estimate" &&
      zero.card.reason === "no-payment",
    JSON.stringify([zero.view.status.kind, zero.card]),
  );
  record(
    "CARD 8: names are joined without a count word the assistant's entity-count guard would misread ('Visa card and 2 other debts')",
    joinDebtNames(["A"]) === "A" &&
      joinDebtNames(["A", "B"]) === "A and B" &&
      joinDebtNames(["A", "B", "C"]) === "A and 2 other debts",
  );

  // balanceKnown reaches the engine: an absent balance is a SETUP gap, not a real $0
  const noBal = run([], prof({ cash_on_hand: null, balance_as_of: null }));
  record(
    "BALANCE 7: no balance on file -> the ENGINE reports it missing (balanceKnown=false): complete and planComplete are false and the Overview is in 'setup'",
    noBal.engineInput.account.balanceKnown === false &&
      noBal.snapshot.missing.some((m) => m.field === "balance") &&
      noBal.snapshot.complete === false &&
      noBal.snapshot.planComplete === false &&
      noBal.view.status.kind === "setup" &&
      noBal.view.status.needsBalance === true,
    JSON.stringify(noBal.snapshot.missing),
  );
  record(
    "BALANCE 8: a real $0 balance on file stays a legitimate calculation (balanceKnown=true)",
    run([], prof({ cash_on_hand: 0 })).engineInput.account.balanceKnown === true,
  );

  // planStatusFromState: one derivation, shared context
  record(
    "VIEW 1: planStatusFromState carries the source and the OLDEST 'as of' date, so the setup state's inline balance form is never shown a fresher date than the data has",
    (() => {
      const accts = [
        {
          id: "a1",
          user_id: "u",
          name: "A",
          kind: "checking",
          institution: null,
          current_balance: 300,
          credit_limit: null,
          balance_as_of: "2026-10-08",
          archived: false,
        },
        {
          id: "a2",
          user_id: "u",
          name: "B",
          kind: "cash",
          institution: null,
          current_balance: 340,
          credit_limit: null,
          balance_as_of: "2026-09-24",
          archived: false,
        },
      ] as unknown as MmAccount[];
      const profile = prof();
      const engineInput = buildEngineInput({
        todayIso: TODAY,
        profile,
        accounts: accts,
        reserved: [],
        caps: [],
        expenses: [],
        debts: [],
        goals: [],
        savedByGoal: new Map<string, number>(),
        overrides: [],
      });
      const v = planStatusFromState({
        profile,
        accounts: accts,
        snapshot: computeSnapshot(engineInput),
        engineInput,
      });
      return (
        v.ctx.balanceSource === "accounts" &&
        v.ctx.balanceAsOf === "2026-09-24" &&
        engineInput.account.currentBalance === 640
      );
    })(),
  );
}

console.log("");
console.log(`${pass}/${pass + fail} plan-status proof cases passed`);

if (fail > 0) {
  console.error(`${fail} plan-status proof case(s) FAILED.`);
  process.exit(1);
}
