// Deterministic, network-free proof of the SME/CEO debt-completeness ruling
// (Option C, binding): ONE semantic truth for "is the paycheck plan
// complete", fixed AT THE SOURCE (src/lib/decision-engine.ts) and read by
// the assistant (src/lib/grounding.ts) without weakening the Overview.
//
// The ruling, in the terms this script proves:
//  - a debt with balance <= 0 is NOT a required current payment;
//  - an ACTIVE debt (balance > 0) with an UNKNOWN minimum payment makes the
//    plan INCOMPLETE -- it must not silently vanish;
//  - an explicit minimum of exactly 0 is KNOWN ("no payment required"), not
//    incomplete;
//  - EngineSnapshot.complete stays "setup only"; EngineSnapshot.planComplete
//    is the plan-complete truth, and grounding's plan_complete/
//    plan_incomplete read it (never the setup-only flag).
//
// Everything here drives the REAL computeSnapshot/buildFundingPlan and the
// REAL checkGrounding. The grounding payload is built from a real
// computeSnapshot result plus the context fields grounding expects (it is
// written independently of scripts/prove-grounding.ts's hand-made fixture).
//
// Run with: npx tsx scripts/prove-completeness.ts

import {
  buildFundingPlan,
  classifyDebt,
  computeSnapshot,
  debtsMissingMinimum,
  type BillObligation,
  type DebtObligation,
  type EngineInput,
  type EngineSnapshot,
  type Window,
} from "../src/lib/decision-engine";
import { checkGrounding, type AskResponseContract } from "../src/lib/grounding";

let pass = 0;
let fail = 0;

function record(name: string, ok: boolean, detail?: string) {
  console.log(ok ? `PASS  ${name}` : `FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  if (ok) pass++;
  else fail++;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TODAY = "2026-10-09";
const NEXT = "2026-10-16";
const WINDOW: Window = { start: TODAY, end: NEXT };
const IN_WINDOW = "2026-10-12";
const OUT_WINDOW = "2026-10-28";

function baseInput(
  debts: DebtObligation[],
  opts: {
    bills?: BillObligation[];
    balance?: number;
    balanceKnown?: boolean;
    nextDepositDate?: string | null;
    cadence?: EngineInput["cycle"]["cadence"];
  } = {},
): EngineInput {
  return {
    todayIso: TODAY,
    account: {
      currentBalance: opts.balance ?? 5000,
      ...(opts.balanceKnown === undefined ? {} : { balanceKnown: opts.balanceKnown }),
      pendingOutflows: [],
      pendingInflows: [],
      reservedFunds: [],
    },
    cycle: {
      lastDepositDate: "2026-10-02",
      nextDepositDate: opts.nextDepositDate === undefined ? NEXT : opts.nextDepositDate,
      nextDepositAmount: 1500,
      cadence: opts.cadence === undefined ? "biweekly" : opts.cadence,
    },
    obligations: { bills: opts.bills ?? [], debts, savingsGoals: [] },
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

function debt(o: Partial<DebtObligation>): DebtObligation {
  return {
    id: "d1",
    creditor: "Visa card",
    balance: 1200,
    apr: 24.99,
    minPayment: 35,
    dueDate: null,
    ...o,
  };
}

function bill(o: Partial<BillObligation> = {}): BillObligation {
  return {
    id: "b1",
    name: "Rent",
    amount: 900,
    dueDate: IN_WINDOW,
    category: "housing",
    autopay: false,
    ...o,
  };
}

const RENT = bill();
const plan = (debts: DebtObligation[], bills: BillObligation[] = []) =>
  buildFundingPlan(baseInput(debts, { bills }), WINDOW);
const snap = (debts: DebtObligation[], bills: BillObligation[] = []) =>
  computeSnapshot(baseInput(debts, { bills }));

const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort();
const rawMin = (n: unknown) => n as number | null;

// ---------------------------------------------------------------------------
// ENGINE
// ---------------------------------------------------------------------------

// E1-E3: a paid-off debt is never a required payment and never holds the
// plan incomplete, whatever its other fields say.
{
  const s = snap([debt({ balance: 0, minPayment: 35, dueDate: null })]);
  const f = s.funding!;
  record(
    "ENGINE 1: paid-off debt (balance 0, min 35, no date) is ignored -- no list, no item, planComplete true",
    f.debtsWithUnknownTiming.length === 0 &&
      f.debtsWithUnknownMinimum.length === 0 &&
      f.items.length === 0 &&
      s.planComplete === true,
    JSON.stringify({ t: f.debtsWithUnknownTiming, m: f.debtsWithUnknownMinimum }),
  );
}
{
  const p = plan([debt({ balance: 0, minPayment: 35, dueDate: IN_WINDOW })]);
  const p2 = plan([debt({ balance: -20, minPayment: 35, dueDate: IN_WINDOW })]);
  record(
    "ENGINE 2: paid-off debt with an IN-WINDOW due date is not an item and adds 0 to totalRequested",
    p.items.length === 0 &&
      p.totalRequested === 0 &&
      p2.items.length === 0 &&
      p2.totalRequested === 0,
    JSON.stringify({ p: p.items, p2: p2.items }),
  );
}
{
  const s = snap([debt({ balance: 0, minPayment: rawMin(null), dueDate: null })]);
  record(
    "ENGINE 3: paid-off debt with a NULL minimum is ignored (not an unknown minimum) -- planComplete true",
    s.funding!.debtsWithUnknownMinimum.length === 0 && s.planComplete === true,
  );
}

// E4: the headline ruling.
{
  const s = snap([debt({ minPayment: rawMin(null), dueDate: null })]);
  const f = s.funding!;
  record(
    "ENGINE 4: active debt, min null, no date -> ONLY in debtsWithUnknownMinimum; totalRequested 0; planComplete FALSE; setup `complete` still true",
    ids(f.debtsWithUnknownMinimum).join() === "d1" &&
      f.debtsWithUnknownTiming.length === 0 &&
      f.items.length === 0 &&
      f.totalRequested === 0 &&
      s.planComplete === false &&
      s.complete === true,
    JSON.stringify({ m: f.debtsWithUnknownMinimum, pc: s.planComplete, c: s.complete }),
  );
  record(
    "ENGINE 4b: the unknown-minimum entry carries the creditor and real balance",
    f.debtsWithUnknownMinimum[0]?.creditor === "Visa card" &&
      f.debtsWithUnknownMinimum[0]?.balance === 1200,
  );
}

// E5: every non-dollar minimum is UNKNOWN, none vanishes, none is an item.
{
  const shapes: [string, unknown][] = [
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["-5", -5],
    ["undefined", undefined],
    ["blank string", "   "],
  ];
  let ok = true;
  const bad: string[] = [];
  for (const [label, v] of shapes) {
    const s = snap([debt({ minPayment: v as unknown as number, dueDate: IN_WINDOW })]);
    const f = s.funding!;
    const good =
      ids(f.debtsWithUnknownMinimum).join() === "d1" &&
      f.debtsWithUnknownTiming.length === 0 &&
      f.items.length === 0 &&
      f.totalRequested === 0 &&
      s.planComplete === false;
    if (!good) {
      ok = false;
      bad.push(label);
    }
  }
  record(
    "ENGINE 5: NaN / Infinity / -Infinity / -5 / undefined / blank-string minimum are ALL unknown minimum (even with an in-window date), never an item, never $∞",
    ok,
    bad.join(","),
  );
}

// E6: explicit 0 is KNOWN.
{
  const s = snap([debt({ minPayment: 0, dueDate: null })]);
  const f = s.funding!;
  record(
    "ENGINE 6: active debt with an explicit $0 minimum is KNOWN (no payment required) -- in no list, no item, planComplete true",
    f.debtsWithUnknownMinimum.length === 0 &&
      f.debtsWithUnknownTiming.length === 0 &&
      f.items.length === 0 &&
      s.planComplete === true &&
      classifyDebt(debt({ minPayment: 0 }), () => true) === "no_payment_required",
  );
}

// E7: simple conservative rule -- unknown minimum beats a known date.
{
  const out = snap([debt({ minPayment: rawMin(null), dueDate: OUT_WINDOW })]);
  const inn = snap([debt({ minPayment: rawMin(null), dueDate: IN_WINDOW })]);
  record(
    "ENGINE 7: unknown minimum + a KNOWN due date (outside OR inside the window) is still unknown minimum -> planComplete false",
    ids(out.funding!.debtsWithUnknownMinimum).join() === "d1" &&
      out.planComplete === false &&
      ids(inn.funding!.debtsWithUnknownMinimum).join() === "d1" &&
      inn.planComplete === false &&
      inn.funding!.items.length === 0,
  );
}

// E8-E10: takeaway sentences.
{
  const f = plan([debt({ minPayment: rawMin(null) })], [RENT]);
  const t = f.takeaway;
  record(
    "TAKEAWAY E: unknown minimum + every placeable item funded -> NOT the unqualified 'Everything due before', says the minimum is not on file, headline === takeaway",
    f.cutoffIndex === -1 &&
      !/^Everything due before/.test(t) &&
      t.includes("minimum payment is not on file") &&
      /do(es)? not confirm every required payment/.test(t) &&
      snap([debt({ minPayment: rawMin(null) })], [RENT]).headline === t,
    t,
  );
}
{
  const f = plan([debt({ minPayment: rawMin(null) })]);
  record(
    "TAKEAWAY F: unknown minimum + no items -> NOT 'Nothing you've entered is due'; says a required payment may still belong",
    f.items.length === 0 &&
      !/Nothing you've entered is due/.test(f.takeaway) &&
      f.takeaway.startsWith("No item with a known due date is currently scheduled") &&
      f.takeaway.includes("minimum payment is not on file") &&
      f.takeaway.includes("may still belong in this period"),
    f.takeaway,
  );
}
{
  const input = baseInput([debt({ minPayment: rawMin(null) })], { bills: [RENT], balance: 100 });
  const f = buildFundingPlan(input, WINDOW);
  const clean = buildFundingPlan(baseInput([], { bills: [RENT], balance: 100 }), WINDOW);
  record(
    "TAKEAWAY G: real shortfall + unknown minimum -> the shortfall sentence is kept byte-for-byte and the minimum caveat is appended",
    f.cutoffIndex !== -1 &&
      f.shortfall > 0 &&
      f.takeaway.startsWith(clean.takeaway) &&
      f.takeaway.length > clean.takeaway.length &&
      f.takeaway.includes("short across") &&
      f.takeaway.includes("minimum payment is also not on file"),
    f.takeaway,
  );
}
{
  const both = [
    debt({ id: "t", creditor: "Timing card", minPayment: 40, dueDate: null }),
    debt({ id: "m", creditor: "Minimum card", minPayment: rawMin(null) }),
  ];
  const noItems = plan(both);
  const covered = plan(both, [RENT]);
  const short = buildFundingPlan(baseInput(both, { bills: [RENT], balance: 100 }), WINDOW);
  const timingOnly = (b: BillObligation[], bal = 5000) =>
    buildFundingPlan(
      baseInput([debt({ id: "t", minPayment: 40, dueDate: null })], { bills: b, balance: bal }),
      WINDOW,
    );
  const ok =
    noItems.takeaway.startsWith(timingOnly([]).takeaway) &&
    covered.takeaway.startsWith(timingOnly([bill()]).takeaway) &&
    short.takeaway.startsWith(timingOnly([bill()], 100).takeaway) &&
    [noItems, covered, short].every((p) =>
      p.takeaway.endsWith(" A debt's minimum payment is also not on file."),
    );
  record(
    "TAKEAWAY H: BOTH lists non-empty -> the existing timing wording is kept in all three branches and ' A debt's minimum payment is also not on file.' is appended",
    ok,
    covered.takeaway,
  );
}
{
  // Existing strings are byte-identical when the new list is empty.
  const clean = plan([], [RENT]);
  const timing = plan([debt({ minPayment: 35, dueDate: null })], [RENT]);
  const none = plan([]);
  record(
    "TAKEAWAY I: with an EMPTY unknown-minimum list every pre-existing takeaway string is byte-identical",
    clean.takeaway ===
      `Everything due before October 16 is covered, with $4,100.00 left after your buffer.` &&
      none.takeaway ===
        `Nothing you've entered is due between October 9 and October 16. That means nothing you've told us about — not that nothing is coming.` &&
      timing.takeaway ===
        `The items with known timing due before October 16 are covered, with $4,100.00 left after your buffer. Debt-minimum timing is still incomplete, so this does not confirm every required payment for this paycheck window.`,
    `${clean.takeaway} | ${timing.takeaway}`,
  );
}

// E11: planComplete matrix over setup x timing x minimum.
{
  const timingDebt = debt({ id: "t", creditor: "Timing card", minPayment: 40, dueDate: null });
  const minDebt = debt({ id: "m", creditor: "Minimum card", minPayment: rawMin(null) });
  const rows: [string, EngineSnapshot, { planComplete: boolean; complete: boolean }][] = [
    [
      "clean",
      snap([debt({ minPayment: 35, dueDate: IN_WINDOW })], [RENT]),
      { planComplete: true, complete: true },
    ],
    ["timing only", snap([timingDebt]), { planComplete: false, complete: true }],
    ["minimum only", snap([minDebt]), { planComplete: false, complete: true }],
    ["both", snap([timingDebt, minDebt]), { planComplete: false, complete: true }],
    [
      "setup missing (no cadence)",
      computeSnapshot(baseInput([], { cadence: null })),
      { planComplete: false, complete: false },
    ],
    [
      "no payday (early return)",
      computeSnapshot(baseInput([], { nextDepositDate: null, cadence: "irregular" })),
      { planComplete: false, complete: false },
    ],
  ];
  const bad = rows
    .filter(([, s, want]) => s.planComplete !== want.planComplete || s.complete !== want.complete)
    .map(([n, s]) => `${n}: planComplete=${s.planComplete} complete=${s.complete}`);
  record(
    "ENGINE 11: planComplete matrix {clean, timing only, minimum only, both, setup missing, no payday}",
    bad.length === 0,
    bad.join("; "),
  );
  const noPayday = rows[5][1];
  record(
    "ENGINE 11b: the no-payday early return has funding null AND planComplete false (fail-closed)",
    noPayday.funding === null && noPayday.planComplete === false,
  );
}

// E12: a mixed book lands every debt in exactly its own bucket.
{
  const debts = [
    debt({ id: "paid", creditor: "Paid card", balance: 0, minPayment: 25, dueDate: IN_WINDOW }),
    debt({ id: "nomin", creditor: "Null card", minPayment: rawMin(null), dueDate: IN_WINDOW }),
    debt({ id: "zero", creditor: "Zero card", minPayment: 0, dueDate: null }),
    debt({ id: "notime", creditor: "Undated card", minPayment: 45, dueDate: null }),
    debt({ id: "inwin", creditor: "In-window card", minPayment: 60, dueDate: IN_WINDOW }),
    debt({ id: "outwin", creditor: "Later card", minPayment: 70, dueDate: OUT_WINDOW }),
  ];
  const f = plan(debts, [RENT]);
  const itemIds = f.items.map((i) => i.id).sort();
  record(
    "ENGINE 12: mixed book -- items are Rent + the in-window debt only; each other debt sits in exactly its own bucket",
    itemIds.join() === "bill:b1,debt:inwin" &&
      ids(f.debtsWithUnknownMinimum).join() === "nomin" &&
      ids(f.debtsWithUnknownTiming).join() === "notime" &&
      f.totalRequested === 960,
    `items=${itemIds} unkMin=${ids(f.debtsWithUnknownMinimum)} unkTime=${ids(f.debtsWithUnknownTiming)}`,
  );
}

// E13: partition sweep -- balance x minimum x due. Every ACTIVE debt is in
// exactly one bucket (item / unknown timing / unknown minimum / known-and-
// not-needed); a paid-off debt is in none; and classifyDebt agrees with the
// plan's own buckets (they are built from the same function).
{
  const balances = [0, 1200];
  const minimums: [string, unknown][] = [
    ["null", null],
    ["0", 0],
    ["NaN", Number.NaN],
    ["Inf", Number.POSITIVE_INFINITY],
    ["-1", -1],
    ["35", 35],
  ];
  const dues: [string, string | null][] = [
    ["null", null],
    ["in", IN_WINDOW],
    ["out", OUT_WINDOW],
    ["garbage", "2026-13-45"],
  ];
  let combos = 0;
  const bad: string[] = [];
  for (const bal of balances) {
    for (const [mLabel, m] of minimums) {
      for (const [dLabel, due] of dues) {
        combos++;
        const d = debt({ balance: bal, minPayment: m as number | null, dueDate: due });
        const f = buildFundingPlan(baseInput([d]), WINDOW);
        const inItems = f.items.filter((i) => i.id === "debt:d1").length;
        const inTiming = f.debtsWithUnknownTiming.filter((x) => x.id === "d1").length;
        const inMin = f.debtsWithUnknownMinimum.filter((x) => x.id === "d1").length;
        const total = inItems + inTiming + inMin;
        const cls = classifyDebt(d, (iso) => iso >= WINDOW.start && iso <= WINDOW.end);
        const label = `bal=${bal} min=${mLabel} due=${dLabel} -> ${cls}`;
        const expectBucket =
          cls === "due_in_window"
            ? inItems === 1 && total === 1
            : cls === "unknown_timing"
              ? inTiming === 1 && total === 1
              : cls === "unknown_minimum"
                ? inMin === 1 && total === 1
                : total === 0; // paid_off, no_payment_required, due_outside_window
        const expectClass =
          bal === 0
            ? cls === "paid_off"
            : mLabel === "35"
              ? dLabel === "in"
                ? cls === "due_in_window"
                : dLabel === "out"
                  ? cls === "due_outside_window"
                  : cls === "unknown_timing" // null AND garbage date are both unusable
              : mLabel === "0"
                ? cls === "no_payment_required"
                : cls === "unknown_minimum";
        if (!expectBucket || !expectClass) bad.push(label);
      }
    }
  }
  record(
    `ENGINE 13: partition sweep over balance{0,1200} x min{null,0,NaN,Inf,-1,35} x due{null,in,out,garbage} -- ${combos} debts, each in exactly the bucket classifyDebt names, paid-off in none`,
    bad.length === 0 && combos === 48,
    bad.slice(0, 3).join("; "),
  );
}

// E14: classifier ordering details.
{
  const inW = () => true;
  const paidBeatsUnknown = classifyDebt(debt({ balance: 0, minPayment: rawMin(null) }), inW);
  const nanBalance = classifyDebt(debt({ balance: Number.NaN, minPayment: rawMin(null) }), inW);
  const infBalance = classifyDebt(debt({ balance: Number.POSITIVE_INFINITY, minPayment: 35 }), inW);
  const nullBalance = classifyDebt(
    debt({ balance: null as unknown as number, minPayment: rawMin(null) }),
    inW,
  );
  record(
    "ENGINE 14: classifier order -- paid-off beats unknown-minimum; a NaN/Infinity/null balance is NEVER read as paid off (stays active, fails closed)",
    paidBeatsUnknown === "paid_off" &&
      nanBalance === "unknown_minimum" &&
      nullBalance === "unknown_minimum" &&
      infBalance !== "paid_off",
    JSON.stringify({ paidBeatsUnknown, nanBalance, infBalance, nullBalance }),
  );
}

// E15: `complete` keeps its setup-only meaning.
{
  const s = snap([debt({ minPayment: 35, dueDate: null })]);
  record(
    "ENGINE 15: existing `complete` is STILL true when only debt timing is unresolved (setup-only), while planComplete is false",
    s.complete === true && s.missing.length === 0 && s.planComplete === false,
  );
}

// E16: balanceKnown hook.
{
  const unknown = computeSnapshot(baseInput([], { balance: 0, balanceKnown: false }));
  const known = computeSnapshot(baseInput([], { balance: 0 }));
  const knownExplicit = computeSnapshot(baseInput([], { balance: 0, balanceKnown: true }));
  record(
    "ENGINE 16: balanceKnown:false reports the balance missing (complete + planComplete false); omitted/true keeps a real $0 balance complete",
    unknown.complete === false &&
      unknown.planComplete === false &&
      unknown.missing.some((m) => m.field === "balance") &&
      known.complete === true &&
      known.planComplete === true &&
      knownExplicit.complete === true &&
      knownExplicit.planComplete === true,
    JSON.stringify({ u: unknown.missing, k: known.missing }),
  );
}

// E17: the standalone helper -- usable with no plan and no window.
{
  const debts = [
    debt({ id: "a", creditor: "A", minPayment: rawMin(null) }),
    debt({ id: "b", creditor: "B", balance: 0, minPayment: rawMin(null) }),
    debt({ id: "c", creditor: "C", minPayment: 0 }),
    debt({ id: "d", creditor: "D", minPayment: Number.NaN, balance: 80.555 }),
  ];
  const helper = debtsMissingMinimum(debts);
  const noPayday = computeSnapshot(baseInput(debts, { nextDepositDate: null, cadence: null }));
  const viaPlan = plan(debts).debtsWithUnknownMinimum;
  record(
    "ENGINE 17: debtsMissingMinimum works with funding null (no payday), skips paid-off and explicit-$0 debts, and equals the plan's own list",
    noPayday.funding === null &&
      ids(helper).join() === "a,d" &&
      helper.find((h) => h.id === "d")?.balance === 80.56 &&
      JSON.stringify(helper) === JSON.stringify(viaPlan),
    JSON.stringify(helper),
  );
}

// ---------------------------------------------------------------------------
// GROUNDING -- driven off a REAL computeSnapshot result
// ---------------------------------------------------------------------------

/** The grounding payload the chat sends: the real engine snapshot plus the
 *  context entities grounding resolves names against. `due` is the engine's
 *  own resolved dueDate (never recomputed here). */
function payloadFor(input: EngineInput, s: EngineSnapshot) {
  return {
    snapshot: s,
    accounts: [{ name: "Everyday checking", kind: "checking", balance: 5000, limit: null }],
    reserved: [],
    bills: input.obligations.bills.map((b) => ({
      name: b.name,
      amount: b.amount,
      due: b.dueDate,
      paid: false,
    })),
    debts: input.obligations.debts.map((d) => ({
      name: d.creditor,
      balance: d.balance,
      apr: d.apr,
      minimum: Number.isFinite(d.minPayment as number) ? d.minPayment : null,
      due: d.dueDate,
    })),
    goals: [{ name: "Emergency fund", target: 1000, saved: 250 }],
    payFrequency: "biweekly",
    nextPayDate: NEXT,
  };
}

type Mutator = (p: ReturnType<typeof payloadFor>) => void;
function groundingJson(debts: DebtObligation[], bills: BillObligation[] = [], mutate?: Mutator) {
  const input = baseInput(debts, { bills });
  const s = computeSnapshot(input);
  const p = payloadFor(input, s);
  mutate?.(p);
  return JSON.stringify(p);
}

function ground(response: AskResponseContract, snapshotJson: string, userMessage = "ok?") {
  return checkGrounding(response, {
    snapshotJson,
    currentUserMessage: userMessage,
    injectedSpans: [],
  });
}

const stateClaim = (stateCode: string): AskResponseContract => ({
  answerParts: [{ type: "claim", claimIndex: 0 }],
  claims: [{ kind: "state", stateCode }] as AskResponseContract["claims"],
  missing: [],
  nextActionType: "lookup_value",
});
const actionResp = (code: string, targetFieldPath?: string): AskResponseContract =>
  ({
    answerParts: [{ type: "action" }],
    claims: [],
    missing: [],
    nextActionType: "concrete_action",
    action: { code, ...(targetFieldPath ? { targetFieldPath } : {}) },
  }) as AskResponseContract;

const CLEAN_DEBT = debt({ id: "c", creditor: "Clean card", minPayment: 35, dueDate: IN_WINDOW });
const TIMING_DEBT = debt({ id: "t", creditor: "Timing card", minPayment: 40, dueDate: null });
const MIN_DEBT = debt({
  id: "m",
  creditor: "Minimum card",
  minPayment: rawMin(null),
  dueDate: null,
});

// G1-G7: plan_complete / plan_incomplete.
{
  const v = ground(stateClaim("plan_complete"), groundingJson([CLEAN_DEBT], [RENT]));
  record(
    "GROUNDING 1: plan_complete PASSES on a genuinely complete real snapshot, rendered 'the plan is complete'",
    v.grounded === true && /the plan is complete/i.test(v.renderedAnswer ?? ""),
    JSON.stringify(v),
  );
}
{
  const v = ground(stateClaim("plan_complete"), groundingJson([TIMING_DEBT], [RENT]));
  record(
    "GROUNDING 2: plan_complete FAILS when a debt's timing is unresolved (setup `complete` is true, planComplete is false)",
    v.grounded === false &&
      (v.reason ?? "").includes("claimed the plan is complete, but it is not"),
    JSON.stringify(v),
  );
}
{
  const v = ground(stateClaim("plan_complete"), groundingJson([MIN_DEBT], [RENT]));
  record(
    "GROUNDING 3: plan_complete FAILS when ONLY an active debt's minimum is unknown",
    v.grounded === false &&
      (v.reason ?? "").includes("claimed the plan is complete, but it is not"),
    JSON.stringify(v),
  );
}
{
  // Inconsistent payloads: planComplete true but a non-empty RAW list --
  // including entries that are malformed -- must never read as complete.
  const mk = (m: Mutator) => groundingJson([CLEAN_DEBT], [RENT], m);
  const variants: [string, string][] = [
    [
      "well-formed timing entry",
      mk((p) => {
        (p.snapshot.funding as unknown as Record<string, unknown>).debtsWithUnknownTiming = [
          { id: "x", creditor: "Ghost", minPayment: 10 },
        ];
      }),
    ],
    [
      "well-formed minimum entry",
      mk((p) => {
        (p.snapshot.funding as unknown as Record<string, unknown>).debtsWithUnknownMinimum = [
          { id: "x", creditor: "Ghost", balance: 10 },
        ];
      }),
    ],
    [
      "malformed minimum entries",
      mk((p) => {
        (p.snapshot.funding as unknown as Record<string, unknown>).debtsWithUnknownMinimum = [
          null,
          42,
          {},
        ];
      }),
    ],
    [
      "malformed timing entries",
      mk((p) => {
        (p.snapshot.funding as unknown as Record<string, unknown>).debtsWithUnknownTiming = [
          "oops",
        ];
      }),
    ],
    [
      "minimum list not an array",
      mk((p) => {
        (p.snapshot.funding as unknown as Record<string, unknown>).debtsWithUnknownMinimum = "none";
      }),
    ],
  ];
  const bad = variants
    .filter(([, j]) => ground(stateClaim("plan_complete"), j).grounded !== false)
    .map(([n]) => n);
  record(
    "GROUNDING 4: plan_complete FAILS closed on an inconsistent payload (planComplete:true but a non-empty / malformed / non-array raw list)",
    bad.length === 0,
    bad.join(","),
  );
}
{
  const dropFlag = groundingJson([CLEAN_DEBT], [RENT], (p) => {
    delete (p.snapshot as unknown as Record<string, unknown>).planComplete;
  });
  const dropMinList = groundingJson([CLEAN_DEBT], [RENT], (p) => {
    delete (p.snapshot.funding as unknown as Record<string, unknown>).debtsWithUnknownMinimum;
  });
  const noFunding = groundingJson([CLEAN_DEBT], [RENT], (p) => {
    (p.snapshot as unknown as Record<string, unknown>).funding = null;
  });
  const flagFalse = groundingJson([CLEAN_DEBT], [RENT], (p) => {
    (p.snapshot as unknown as Record<string, unknown>).planComplete = false;
  });
  const results = [dropFlag, dropMinList, noFunding, flagFalse].map(
    (j) => ground(stateClaim("plan_complete"), j).grounded,
  );
  record(
    "GROUNDING 5: plan_complete FAILS when planComplete is absent, false, the unknown-minimum list is absent, or funding is null (a missing field never defaults to 'complete')",
    results.every((r) => r === false),
    JSON.stringify(results),
  );
}
{
  const v = ground(stateClaim("plan_incomplete"), groundingJson([TIMING_DEBT], [RENT]));
  const v2 = ground(stateClaim("plan_incomplete"), groundingJson([MIN_DEBT], [RENT]));
  record(
    'GROUNDING 6: plan_incomplete PASSES (timing unresolved, and minimum unknown), rendered "isn\'t complete yet"',
    v.grounded === true &&
      v2.grounded === true &&
      (v.renderedAnswer ?? "").includes("isn't complete yet"),
    JSON.stringify([v, v2]),
  );
}
{
  const v = ground(stateClaim("plan_incomplete"), groundingJson([CLEAN_DEBT], [RENT]));
  record(
    "GROUNDING 7: plan_incomplete FAILS on a genuinely complete plan",
    v.grounded === false && (v.reason ?? "").includes("claimed the plan is incomplete"),
    JSON.stringify(v),
  );
}

// G8: the has/no_shortfall caveat.
{
  const v = ground(stateClaim("no_shortfall"), groundingJson([MIN_DEBT], [RENT]));
  const text = v.renderedAnswer ?? "";
  const vb = ground(stateClaim("no_shortfall"), groundingJson([MIN_DEBT, TIMING_DEBT], [RENT]));
  const vClean = ground(stateClaim("no_shortfall"), groundingJson([CLEAN_DEBT], [RENT]));
  record(
    "GROUNDING 8: no_shortfall renders a digit-free minimum caveat when only a minimum is unknown, a combined caveat when both, and NO caveat on a clean plan",
    v.grounded === true &&
      /no known minimum payment/.test(text) &&
      !/\d/.test(text) &&
      vb.grounded === true &&
      /no known due date/.test(vb.renderedAnswer ?? "") &&
      /no known minimum payment/.test(vb.renderedAnswer ?? "") &&
      vClean.grounded === true &&
      !/doesn't account for/.test(vClean.renderedAnswer ?? ""),
    JSON.stringify([text, vb.renderedAnswer]),
  );
}

// G9: debt_timing_unavailable on a paid-off debt.
{
  const paid = debt({ id: "p", creditor: "Paid card", balance: 0, minPayment: 35, dueDate: null });
  const json = groundingJson([paid, TIMING_DEBT], [RENT]);
  const vPaid = ground(actionResp("debt_timing_unavailable", "debt:Paid card.minimum"), json);
  const vActive = ground(actionResp("debt_timing_unavailable", "debt:Timing card.minimum"), json);
  record(
    "GROUNDING 9: debt_timing_unavailable FAILS on a paid-off (balance 0) debt, still PASSES on an active undated one",
    vPaid.grounded === false &&
      (vPaid.reason ?? "").includes("paid off") &&
      vActive.grounded === true,
    JSON.stringify([vPaid, vActive]),
  );
  record(
    "GROUNDING 9b: the debt_timing_unavailable sentence names the remedy (the Debt page's due day) and keeps the original limitation wording",
    /doesn't have Timing card's due date yet/.test(vActive.renderedAnswer ?? "") &&
      /Add its due day on the Debt page\./.test(vActive.renderedAnswer ?? ""),
    vActive.renderedAnswer,
  );
}

// G10: prioritize_extra_debt_payment on an unknown-minimum debt.
{
  const decision = (target: string): AskResponseContract =>
    ({
      answerParts: [{ type: "decision" }],
      claims: [],
      missing: [],
      nextActionType: "user_decision",
      decision: {
        options: [
          { code: "prioritize_goal", targetFieldPath: "goal:Emergency fund.saved" },
          { code: "prioritize_extra_debt_payment", targetFieldPath: target },
        ],
      },
    }) as AskResponseContract;
  const json = groundingJson([MIN_DEBT, CLEAN_DEBT], [RENT]);
  const vMin = ground(decision("debt:Minimum card.balance"), json);
  const vOk = ground(decision("debt:Clean card.balance"), json);
  record(
    "GROUNDING 10: prioritize_extra_debt_payment FAILS on a debt whose own minimum is unknown, but a debt with a known, placed minimum still PASSES",
    vMin.grounded === false &&
      (vMin.reason ?? "").includes("own required minimum is unknown") &&
      vOk.grounded === true,
    JSON.stringify([vMin, vOk]),
  );
}

// G11: snapshot.complete is no longer an addressable fact.
{
  const v = ground(
    {
      answerParts: [{ type: "claim", claimIndex: 0 }],
      claims: [{ kind: "fact", fieldPath: "snapshot.complete" }],
      missing: [],
      nextActionType: "lookup_value",
    },
    groundingJson([CLEAN_DEBT], [RENT]),
  );
  record(
    "GROUNDING 11: fact 'snapshot.complete' (the setup-only flag) is no longer an addressable fact -> FAIL",
    v.grounded === false,
    JSON.stringify(v),
  );
}

// G12: missing_minimum.
{
  const missing = (target: string): AskResponseContract =>
    ({
      answerParts: [{ type: "missing", missingIndex: 0 }],
      claims: [],
      missing: [{ code: "missing_minimum", targetFieldPath: target }],
      nextActionType: "clarifying_question",
    }) as AskResponseContract;
  const zero = debt({ id: "z", creditor: "Zero card", minPayment: 0, dueDate: null });
  const json = groundingJson([MIN_DEBT, zero], [RENT]);
  const vNull = ground(missing("debt:Minimum card.minimum"), json);
  const vZero = ground(missing("debt:Zero card.minimum"), json);
  record(
    "GROUNDING 12: missing_minimum PASSES on a null-minimum debt and FAILS ('already on file') on an explicit $0 minimum",
    vNull.grounded === true &&
      vZero.grounded === false &&
      (vZero.reason ?? "").includes("already on file"),
    JSON.stringify([vNull, vZero]),
  );
}

// G13: the production path Option C opens -- a debt with a RESOLVED in-window
// due date whose minimum is funded.
{
  const json = groundingJson([CLEAN_DEBT], [RENT]);
  const v = ground(actionResp("pay_required_minimum", "debt:Clean card.minimum"), json);
  const parsed = JSON.parse(json) as ReturnType<typeof payloadFor>;
  const item = parsed.snapshot.funding!.items.find((i) => i.id === "debt:c");
  record(
    "GROUNDING 13: a debt with a resolved in-window due date and a funded engine item -> pay_required_minimum PASSES (the plan and grounding agree)",
    item?.status === "funded" && v.grounded === true,
    JSON.stringify({ item, v }),
  );
}

// G14: the unchanged gates, characterised (escalated separately).
{
  const v = ground(actionResp("no_action_needed"), groundingJson([MIN_DEBT], [RENT]));
  record(
    "GROUNDING 14: no_action_needed's gate is UNCHANGED (setup-complete, no shortfall) and its rendering now carries the minimum caveat",
    v.grounded === true && /no known minimum payment/.test(v.renderedAnswer ?? ""),
    JSON.stringify(v),
  );
}

// G15: the whole chain agrees -- one semantic truth.
{
  const cases: [string, DebtObligation[], boolean][] = [
    ["clean", [CLEAN_DEBT], true],
    ["timing unknown", [TIMING_DEBT], false],
    ["minimum unknown", [MIN_DEBT], false],
    ["paid-off null minimum", [debt({ id: "p", balance: 0, minPayment: rawMin(null) })], true],
    ["explicit $0 minimum", [debt({ id: "z", minPayment: 0 })], true],
  ];
  const bad: string[] = [];
  for (const [label, debts, expectComplete] of cases) {
    const input = baseInput(debts, { bills: [RENT] });
    const s = computeSnapshot(input);
    const json = JSON.stringify(payloadFor(input, s));
    const claimsComplete = ground(stateClaim("plan_complete"), json).grounded;
    const claimsIncomplete = ground(stateClaim("plan_incomplete"), json).grounded;
    if (
      s.planComplete !== expectComplete ||
      claimsComplete !== expectComplete ||
      claimsIncomplete !== !expectComplete
    )
      bad.push(label);
  }
  record(
    "GROUNDING 15: engine planComplete, plan_complete and plan_incomplete agree on all five debt shapes (one semantic truth, no disagreement possible)",
    bad.length === 0,
    bad.join(","),
  );
}

console.log("");
console.log(`${pass}/${pass + fail} completeness proof cases passed`);

if (fail > 0) {
  console.error(`${fail} completeness proof case(s) FAILED.`);
  process.exit(1);
}
