// The Money Meeting decision engine.
//
// This module is deliberately UI-free and dependency-free so it can be tested
// on its own and reused by both the chat assistant and the dashboard views.
//
// Two architectural commitments, both from the brief:
//
//  1. Every "can I afford this" answer is evaluated over [today, next deposit],
//     NOT over the calendar month. A monthly view hides timing risk; a
//     pay-cycle view exposes it.
//  2. When funds run short the answer RANKS obligations and shows where funding
//     runs out. It never reports a bare deficit number.
//
// It never guesses. Any input that is missing is named, and the result is
// marked incomplete rather than filled in with an average.
//
// CEO directive, "PR #10 CONSOLIDATED TRUST CLOSURE" part B: debt
// minimums used to enter buildFundingPlan's ranked items unconditionally
// (filtered only by minPayment > 0) while bills required a real due
// date inside the window -- an asymmetry that let an obligation with
// genuinely UNKNOWN timing (every debt's dueDate is null today; there is
// no persistent due-date column on the debts table at all) drive
// shortfall/no-shortfall as though it were verified as due this cycle.
// Fixed: a debt minimum now requires the same real-due-date-in-window
// proof as a bill before it enters this cycle's plan. Debts with a real
// minimum but no known due date are excluded (never silently assumed
// due, and never silently assumed NOT due either) and surfaced
// separately via FundingPlan.debtsWithUnknownTiming, so a "fully
// covered"/"no shortfall" claim built on top of this can be qualified
// honestly rather than implying timing was evaluated when it wasn't.

export type Cadence = "weekly" | "biweekly" | "semimonthly" | "monthly" | "irregular";

export interface PendingFlow {
  id: string;
  desc: string;
  amount: number;
  /** ISO date the money is expected to land or leave. */
  date: string;
  /** False when the person told us it might not happen or might differ. */
  certain: boolean;
}

export interface ReservedFund {
  id: string;
  label: string;
  amount: number;
  purpose: string;
  /** Amount already drawn down and owed back to itself. */
  tapped: number;
}

export interface AccountState {
  /** Sum of the spendable accounts the person entered, minus nothing. */
  currentBalance: number;
  pendingOutflows: PendingFlow[];
  pendingInflows: PendingFlow[];
  reservedFunds: ReservedFund[];
}

export interface PayCycle {
  lastDepositDate: string | null;
  nextDepositDate: string | null;
  nextDepositAmount: number | null;
  cadence: Cadence | null;
}

export interface BillObligation {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  category: string;
  autopay: boolean;
}

export interface DebtObligation {
  id: string;
  creditor: string;
  balance: number;
  apr: number | null;
  minPayment: number | null;
  dueDate: string | null;
}

export interface GoalObligation {
  id: string;
  label: string;
  target: number;
  current: number;
  monthlyContribution: number;
}

export interface Obligations {
  bills: BillObligation[];
  debts: DebtObligation[];
  savingsGoals: GoalObligation[];
}

export interface DiscretionaryModel {
  monthlyAvgObserved: number | null;
  currentCycleSpent: number | null;
  /** The ceiling the person committed to — never the observed average. */
  cap: number | null;
  leakCategories: string[];
}

export interface PriorityOverride {
  refKind: "expense" | "debt" | "goal" | "custom";
  refId: string;
  tier: number;
  reason: string;
}

export interface EngineInput {
  todayIso: string;
  account: AccountState;
  cycle: PayCycle;
  obligations: Obligations;
  discretionary: DiscretionaryModel;
  overrides: PriorityOverride[];
  /** Buffer the person wants left untouched, above reserved funds. */
  safeBuffer: number;
  /** Named obligations the person mentioned that aren't saved as line items. */
  namedConstraints: { label: string; amount: number }[];
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};

export const formatDay = (iso: string) =>
  new Date(day(iso)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

export const formatShort = (iso: string) =>
  new Date(day(iso)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export const addDays = (iso: string, n: number) =>
  new Date(day(iso) + n * 86400000).toISOString().slice(0, 10);

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

// CEO directive, "PR #10 CONSOLIDATED TRUST CLOSURE" round-9 adversarial
// review: a due date is only "usable" evidence if it's a real,
// calendar-valid ISO yyyy-mm-dd string that round-trips exactly back to
// itself. Without this, a malformed-but-non-null value (empty string,
// whitespace, non-ISO garbage, an ISO datetime WITH a time-of-day/
// offset component -- the actual shape a timestamptz column returns)
// fell through BOTH the debt-timing-unknown bucket and the in-window
// check and vanished from the plan with zero trace -- worse than the
// original bug this round fixed, since even that at least counted the
// obligation. Separately, a shape-valid but calendar-invalid date like
// "2026-13-45" was silently rolled over by Date.UTC into an unrelated,
// genuinely different valid date instead of being rejected. This
// predicate is applied symmetrically to BOTH bills and debts so neither
// side of the fix this round made regains a silent-disappearance gap.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const hasUsableDueDate = (iso: string | null | undefined): iso is string => {
  if (iso == null || !ISO_DATE_RE.test(iso)) return false;
  const ms = day(iso);
  if (!Number.isFinite(ms)) return false;
  return new Date(ms).toISOString().slice(0, 10) === iso;
};

// A real, current-cycle minimum payment must be a genuine, finite,
// positive number -- Infinity satisfies `> 0` in JS but is not a real
// dollar amount and poisons totalRequested/shortfall arithmetic into
// "$∞ short" if admitted.
const isFinitePositive = (n: unknown): boolean => {
  const v = Number(n ?? 0);
  return Number.isFinite(v) && v > 0;
};

/** Projects the next deposit date from a cadence when the person gave us one. */
export function projectNextDeposit(cycle: PayCycle, todayIso: string): string | null {
  if (cycle.nextDepositDate && day(cycle.nextDepositDate) >= day(todayIso))
    return cycle.nextDepositDate;
  if (!cycle.lastDepositDate || !cycle.cadence || cycle.cadence === "irregular") return null;
  const step =
    cycle.cadence === "weekly"
      ? 7
      : cycle.cadence === "biweekly"
        ? 14
        : cycle.cadence === "semimonthly"
          ? 15
          : 30;
  let d = cycle.lastDepositDate;
  for (let i = 0; i < 120 && day(d) < day(todayIso); i++) d = addDays(d, step);
  return d;
}

// ---------------------------------------------------------------------------
// 2.2 The one computation everything else depends on
// ---------------------------------------------------------------------------

export interface Window {
  start: string;
  end: string;
}

export interface BalanceProjection {
  window: Window;
  startingBalance: number;
  certainInflows: number;
  certainOutflows: number;
  uncertainOutflows: number;
  discretionaryCommitted: number;
  reservedHeld: number;
  /** The number the whole engine hangs on. */
  projectedMinBalance: number;
  /** Day-by-day low point, so the risk isn't hidden by an end-of-window total. */
  lowPoint: { date: string; balance: number } | null;
  ledger: { date: string; desc: string; delta: number; balance: number; certain: boolean }[];
}

/**
 * projectedMinBalance = currentBalance
 *   + certain inflows in window
 *   − certain outflows in window
 *   − committed discretionary cap prorated to the window
 * Reserved funds are excluded from the starting balance entirely (2.7).
 */
export function projectMinBalance(input: EngineInput, window: Window): BalanceProjection {
  const { account, discretionary } = input;
  const inWindow = (iso: string) => day(iso) >= day(window.start) && day(iso) <= day(window.end);

  const reservedHeld = round2(
    account.reservedFunds.reduce((s, r) => s + Math.max(0, r.amount - r.tapped), 0),
  );
  const startingBalance = round2(account.currentBalance - reservedHeld);

  const inflows = account.pendingInflows.filter((f) => inWindow(f.date));
  const outflows = account.pendingOutflows.filter((f) => inWindow(f.date));

  const certainInflows = round2(
    inflows.filter((f) => f.certain).reduce((s, f) => s + Math.abs(f.amount), 0),
  );
  const certainOutflows = round2(
    outflows.filter((f) => f.certain).reduce((s, f) => s + Math.abs(f.amount), 0),
  );
  const uncertainOutflows = round2(
    outflows.filter((f) => !f.certain).reduce((s, f) => s + Math.abs(f.amount), 0),
  );

  // A cap is a commitment, so it is spent in the projection. With no cap set,
  // nothing is assumed — the observed average is never substituted in.
  const days = Math.max(1, Math.round((day(window.end) - day(window.start)) / 86400000) + 1);
  const discretionaryCommitted =
    discretionary.cap != null ? round2((discretionary.cap / 30) * days) : 0;

  const events = [
    ...inflows.map((f) => ({
      date: f.date,
      desc: f.desc,
      delta: Math.abs(f.amount),
      certain: f.certain,
    })),
    ...outflows.map((f) => ({
      date: f.date,
      desc: f.desc,
      delta: -Math.abs(f.amount),
      certain: f.certain,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  let running = startingBalance;
  const ledger = events
    .filter((e) => e.certain)
    .map((e) => {
      running = round2(running + e.delta);
      return { ...e, balance: running };
    });

  const lowPoint = ledger.length
    ? ledger.reduce(
        (lo, e) => (e.balance < lo.balance ? { date: e.date, balance: e.balance } : lo),
        {
          date: ledger[0].date,
          balance: ledger[0].balance,
        },
      )
    : null;

  const projectedMinBalance = round2(
    startingBalance + certainInflows - certainOutflows - discretionaryCommitted,
  );

  return {
    window,
    startingBalance,
    certainInflows,
    certainOutflows,
    uncertainOutflows,
    discretionaryCommitted,
    reservedHeld,
    projectedMinBalance,
    lowPoint: lowPoint && lowPoint.balance < projectedMinBalance ? lowPoint : lowPoint,
    ledger,
  };
}

// ---------------------------------------------------------------------------
// 2.5 Ranked-funding allocator
// ---------------------------------------------------------------------------

export const FUNDING_TIERS: { tier: number; label: string; blurb: string }[] = [
  { tier: 1, label: "Housing", blurb: "Never late — everything else moves before this does." },
  { tier: 2, label: "Safety-critical", blurb: "Things that stop you earning if they break." },
  { tier: 3, label: "Cascading cost", blurb: "Small now, much larger later if it's missed." },
  { tier: 4, label: "Debt minimums", blurb: "Highest interest rate first inside this group." },
  {
    tier: 5,
    label: "Essential living",
    blurb: "Food and getting around, sized to this pay cycle.",
  },
  { tier: 6, label: "Everyday spending", blurb: "Capped, not open-ended." },
  {
    tier: 7,
    label: "Extra payoff or saving",
    blurb: "Only from genuine surplus after everything above.",
  },
];

const CATEGORY_TIER: Record<string, number> = {
  housing: 1,
  utilities: 3,
  health: 2,
  transport: 2,
  debt: 4,
  food: 5,
  insurance: 3,
  subscription: 6,
  personal: 6,
  fun: 6,
  other: 5,
};

export interface RankedItem {
  /** Round-9 adversarial review: a bill and a debt minimum can end up
   *  with the identical `label` string (a bill named to collide with
   *  the "<creditor> minimum" convention, or simply by coincidence).
   *  grounding.ts's item-lookup helpers now require this to match too,
   *  never label text alone, so one entity's funded/shortfall status
   *  can no longer be misattributed to a different, same-labeled one.
   *  "named"/"cap" are the two synthetic line items below (a person's
   *  named-in-conversation obligation, and the everyday-spending cap) --
   *  neither is addressable via a bill:/debt: fieldPath, so grounding.ts
   *  never looks them up by kind, but every RankedItem carries one. */
  kind: "bill" | "debt" | "named" | "cap";
  id: string;
  label: string;
  amount: number;
  tier: number;
  tierLabel: string;
  dueDate: string | null;
  /** Explains any move away from the default tier. */
  reasonMoved: string | null;
  funded: number;
  status: "funded" | "partial" | "unfunded";
}

export interface FundingPlan {
  available: number;
  items: RankedItem[];
  /** Index of the first item that isn't fully covered, or -1 when all are. */
  cutoffIndex: number;
  totalRequested: number;
  shortfall: number;
  takeaway: string;
  /** Debts with a real minimum payment but NO known due date -- excluded
   *  from this cycle's ranked plan on purpose, because their timing was
   *  never verified, not because they're actually due later. Unknown
   *  timing is never treated as "not due this cycle" for shortfall
   *  purposes either -- it's simply not evaluated at all, and this
   *  field is how that stays visible rather than silently disappearing
   *  into an unqualified "no shortfall". See buildFundingPlan below. */
  debtsWithUnknownTiming: { id: string; creditor: string; minPayment: number }[];
}

/**
 * Ranks obligations and walks the money down the list, so the answer is
 * "funding runs out here", not "you are short $X".
 */
export function buildFundingPlan(input: EngineInput, window: Window): FundingPlan {
  const { obligations, overrides, account, discretionary, namedConstraints, safeBuffer } = input;
  const inWindow = (iso: string) => day(iso) >= day(window.start) && day(iso) <= day(window.end);
  const overrideFor = (kind: string, id: string) =>
    overrides.find((o) => o.refKind === kind && o.refId === id) ?? null;

  const items: RankedItem[] = [];

  for (const b of obligations.bills.filter(
    (b) => hasUsableDueDate(b.dueDate) && inWindow(b.dueDate),
  )) {
    const ov = overrideFor("expense", b.id);
    const baseTier = CATEGORY_TIER[b.category] ?? 5;
    items.push({
      kind: "bill",
      id: `bill:${b.id}`,
      label: b.name,
      amount: round2(b.amount),
      tier: ov?.tier ?? baseTier,
      tierLabel: FUNDING_TIERS[(ov?.tier ?? baseTier) - 1]?.label ?? "Essential living",
      dueDate: b.dueDate,
      reasonMoved: ov ? ov.reason : null,
      funded: 0,
      status: "unfunded",
    });
  }

  // Debt minimums sit in tier 4, ordered by APR descending inside the
  // tier -- but ONLY when a real due date puts them in this window,
  // exactly like bills above. Unknown timing (dueDate === null, true
  // for every debt today -- there is no persistent due-date field on
  // the debts table at all) must never be silently treated as "due this
  // cycle": that would let an unverified obligation drive shortfall/
  // no-shortfall for a debt BudgetChek genuinely cannot place in this
  // window without guessing. A real due date that's simply outside the
  // window is a different, unproblematic case -- correctly excluded
  // either way, but not because it was unknown.
  const debtsWithUnknownTiming = obligations.debts
    .filter((d) => isFinitePositive(d.minPayment) && !hasUsableDueDate(d.dueDate))
    .map((d) => ({ id: d.id, creditor: d.creditor, minPayment: round2(Number(d.minPayment)) }));
  const mins = obligations.debts
    .filter(
      (d) => isFinitePositive(d.minPayment) && hasUsableDueDate(d.dueDate) && inWindow(d.dueDate),
    )
    .sort((a, b) => Number(b.apr ?? 0) - Number(a.apr ?? 0));
  for (const d of mins) {
    const ov = overrideFor("debt", d.id);
    items.push({
      kind: "debt",
      id: `debt:${d.id}`,
      label: `${d.creditor} minimum`,
      amount: round2(Number(d.minPayment)),
      tier: ov?.tier ?? 4,
      tierLabel: FUNDING_TIERS[(ov?.tier ?? 4) - 1]?.label ?? "Debt minimums",
      dueDate: d.dueDate,
      reasonMoved: ov ? ov.reason : d.apr != null ? `${d.apr}% interest rate` : null,
      funded: 0,
      status: "unfunded",
    });
  }

  // Things the person named in conversation but hasn't saved as a line item.
  for (const c of namedConstraints) {
    items.push({
      kind: "named",
      id: `named:${c.label}`,
      label: c.label,
      amount: round2(c.amount),
      tier: 3,
      tierLabel: "Cascading cost",
      dueDate: null,
      reasonMoved: "You told us about this, so it's counted even though it isn't saved as a bill",
      funded: 0,
      status: "unfunded",
    });
  }

  if (discretionary.cap != null && discretionary.cap > 0) {
    const days = Math.max(1, Math.round((day(window.end) - day(window.start)) / 86400000) + 1);
    items.push({
      kind: "cap",
      id: "cap:everyday",
      label: "Everyday spending, at your cap",
      amount: round2((discretionary.cap / 30) * days),
      tier: 6,
      tierLabel: "Everyday spending",
      dueDate: null,
      reasonMoved: null,
      funded: 0,
      status: "unfunded",
    });
  }

  items.sort(
    (a, b) =>
      a.tier - b.tier ||
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
      b.amount - a.amount,
  );

  const reservedHeld = account.reservedFunds.reduce(
    (s, r) => s + Math.max(0, r.amount - r.tapped),
    0,
  );
  const inflows = account.pendingInflows
    .filter((f) => f.certain && inWindow(f.date))
    .reduce((s, f) => s + Math.abs(f.amount), 0);
  const available = round2(
    Math.max(0, account.currentBalance - reservedHeld - safeBuffer) + inflows,
  );

  let pool = available;
  let cutoffIndex = -1;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const give = Math.max(0, Math.min(it.amount, pool));
    it.funded = round2(give);
    it.status = give >= it.amount - 0.01 ? "funded" : give > 0 ? "partial" : "unfunded";
    pool = round2(pool - give);
    if (it.status !== "funded" && cutoffIndex === -1) cutoffIndex = i;
  }

  const totalRequested = round2(items.reduce((s, i) => s + i.amount, 0));
  const shortfall = round2(Math.max(0, totalRequested - available));

  // CEO / PRODUCT REVIEW, "PR #10 FINAL PRE-MERGE CLOSURE" (bounded
  // correction 2): buildFundingPlan correctly excludes a debt minimum
  // with unknown timing from `items`/the arithmetic above, and exposes
  // it via debtsWithUnknownTiming -- but the takeaway sentence below
  // (which computeSnapshot's headline is just an alias of) used to
  // still say "Everything ... is covered" whenever every item that DID
  // make it into the plan was funded, with no mention that a real
  // debt's timing was never evaluated. That's too broad a claim:
  // BudgetChek has only proven everything with VERIFIED timing is
  // covered, never that an undated debt minimum falls outside this
  // window. One semantic truth, not a caveat that only the assistant's
  // own claims carry while this engine-level sentence still overclaims.
  const hasUnknownTiming = debtsWithUnknownTiming.length > 0;
  const unknownTimingNote =
    " Debt-minimum timing is still incomplete, so this does not confirm every required payment for this paycheck window.";

  let takeaway: string;
  if (!items.length) {
    takeaway = hasUnknownTiming
      ? "No item with a known due date is currently scheduled in this paycheck window. Debt-minimum timing is incomplete, so a required minimum may still belong in this period."
      : `Nothing you've entered is due between ${formatDay(window.start)} and ${formatDay(window.end)}. That means nothing you've told us about — not that nothing is coming.`;
  } else if (cutoffIndex === -1) {
    takeaway = hasUnknownTiming
      ? `The items with known timing due before ${formatDay(window.end)} are covered, with ${money(pool)} left after your buffer.${unknownTimingNote}`
      : `Everything due before ${formatDay(window.end)} is covered, with ${money(pool)} left after your buffer.`;
  } else {
    // A real, known-timing shortfall is reported exactly as before --
    // never hidden, never adjusted for the unknown-timing debt (its
    // amount is never added to this arithmetic; BudgetChek does not
    // guess when it's due), only qualified with an honest caveat.
    const first = items[cutoffIndex];
    takeaway = `Your money covers everything down to ${first.label}, then runs out — ${money(shortfall)} short across ${items.length - cutoffIndex} item${items.length - cutoffIndex === 1 ? "" : "s"}. Start with the one at the cutoff line, not the whole gap.${hasUnknownTiming ? " Debt-minimum timing is also incomplete, so a required minimum may still belong in this period beyond what's shown here." : ""}`;
  }

  return {
    available,
    items,
    cutoffIndex,
    totalRequested,
    shortfall,
    takeaway,
    debtsWithUnknownTiming,
  };
}

// ---------------------------------------------------------------------------
// 2.6 Pay-vs-hold debt evaluator
// ---------------------------------------------------------------------------

export type DebtVerdict = "pay_now" | "minimum_only" | "hold_until_next_deposit" | "partial_now";

export interface DebtDecision {
  debtId: string;
  creditor: string;
  verdict: DebtVerdict;
  /** The amount actually recommended, which may be smaller than the maths alone allows. */
  recommendedAmount: number;
  bufferAfter: number;
  reason: string;
  /** Set when a named constraint reduced the recommendation. */
  constrainedBy: string | null;
}

export const HIGH_APR = 15;

export function evaluateDebt(
  input: EngineInput,
  debtId: string,
  window: Window,
): DebtDecision | null {
  const debt = input.obligations.debts.find((d) => d.id === debtId);
  if (!debt) return null;

  const plan = buildFundingPlan(input, window);
  const namedTotal = round2(input.namedConstraints.reduce((s, c) => s + c.amount, 0));
  const surplus = round2(Math.max(0, plan.available - plan.totalRequested));
  const apr = Number(debt.apr ?? 0);
  const safe = input.safeBuffer;
  const bufferAfterFull = round2(surplus - Number(debt.balance));

  const constrainedBy =
    namedTotal > 0 ? input.namedConstraints.map((c) => c.label).join(", ") : null;

  if (plan.shortfall > 0) {
    return {
      debtId,
      creditor: debt.creditor,
      verdict: "hold_until_next_deposit",
      recommendedAmount: round2(Number(debt.minPayment ?? 0)),
      bufferAfter: 0,
      reason: `Bills due before ${formatDay(window.end)} already outrun what's available, so paying this down early would create the shortfall rather than avoid it. Minimum now, and schedule the payoff for your next deposit.`,
      constrainedBy,
    };
  }

  if (apr > 0 && apr < 1) {
    // Treat a fractional rate as the decimal it plainly is.
    return null;
  }

  if (apr === 0) {
    return {
      debtId,
      creditor: debt.creditor,
      verdict: "minimum_only",
      recommendedAmount: round2(Number(debt.minPayment ?? 0)),
      bufferAfter: surplus,
      reason: `This one charges no interest, so clearing it early buys nothing. Minimum only — never spend your buffer or risk a fee to retire a 0% balance early.`,
      constrainedBy,
    };
  }

  if (apr >= HIGH_APR && bufferAfterFull >= safe && namedTotal === 0) {
    return {
      debtId,
      creditor: debt.creditor,
      verdict: "pay_now",
      recommendedAmount: round2(Number(debt.balance)),
      bufferAfter: bufferAfterFull,
      reason: `At ${apr}% this is the most expensive money you hold, and clearing it still leaves ${money(bufferAfterFull)} — above the ${money(safe)} buffer you set. Nothing else you've named is due before ${formatDay(window.end)}.`,
      constrainedBy: null,
    };
  }

  const room = round2(Math.max(0, surplus - safe - namedTotal));
  if (room > Number(debt.minPayment ?? 0)) {
    return {
      debtId,
      creditor: debt.creditor,
      verdict: "partial_now",
      recommendedAmount: Math.min(round2(room), round2(Number(debt.balance))),
      bufferAfter: round2(surplus - room),
      reason: constrainedBy
        ? `${money(room)} is the right number here, not a compromise: it's what's left once ${constrainedBy} is held back and your ${money(safe)} buffer stays intact. Paying more would just borrow from something you've already named.`
        : `${money(room)} is what clears above your ${money(safe)} buffer. Sending more than that turns a good month into a tight one.`,
      constrainedBy,
    };
  }

  return {
    debtId,
    creditor: debt.creditor,
    verdict: "hold_until_next_deposit",
    recommendedAmount: round2(Number(debt.minPayment ?? 0)),
    bufferAfter: surplus,
    reason: `Paying extra now would drop you under the ${money(safe)} buffer you set. Minimum this cycle, then revisit on ${input.cycle.nextDepositDate ? formatDay(input.cycle.nextDepositDate) : "your next payday"}.`,
    constrainedBy,
  };
}

// ---------------------------------------------------------------------------
// 2.7 Reserved funds
// ---------------------------------------------------------------------------

export interface RebuildItem {
  label: string;
  amount: number;
  tier: number;
  reason: string;
}

/**
 * Tapping a reserved fund immediately creates a top-priority rebuild line for
 * the next deposit — the same tier as housing, not "if there's extra".
 */
export function tapReserved(
  fund: ReservedFund,
  amount: number,
): { fund: ReservedFund; rebuild: RebuildItem } {
  const take = round2(Math.min(amount, Math.max(0, fund.amount - fund.tapped)));
  return {
    fund: { ...fund, tapped: round2(fund.tapped + take) },
    rebuild: {
      label: `Rebuild ${fund.label}`,
      amount: take,
      tier: 1,
      reason: `You drew ${money(take)} out of ${fund.label}. Putting it back is first in line on your next deposit, because a buffer you don't refill isn't a buffer.`,
    },
  };
}

export function rebuildItems(funds: ReservedFund[]): RebuildItem[] {
  return funds
    .filter((f) => f.tapped > 0)
    .map((f) => ({
      label: `Rebuild ${f.label}`,
      amount: round2(f.tapped),
      tier: 1,
      reason: `${money(f.tapped)} is still out of ${f.label}. It's first in line on your next deposit.`,
    }));
}

// ---------------------------------------------------------------------------
// 2.8 Leak detection and structural cap enforcement
// ---------------------------------------------------------------------------

export interface CapCheck {
  category: string;
  cap: number;
  observedAvg: number | null;
  cycleSpent: number | null;
  instrumentLabel: string | null;
  instrumentLimit: number | null;
  /** True when the card backing the cap allows more spending than the cap. */
  structuralGap: boolean;
  sentence: string;
}

export function checkCap(args: {
  category: string;
  cap: number;
  observedAvg: number | null;
  cycleSpent: number | null;
  instrumentLabel: string | null;
  instrumentLimit: number | null;
}): CapCheck {
  const { category, cap, observedAvg, cycleSpent, instrumentLabel, instrumentLimit } = args;
  const structuralGap = instrumentLimit != null && instrumentLimit > cap;

  let sentence: string;
  if (structuralGap) {
    sentence = `Your ${category} cap is ${money(cap)} but ${instrumentLabel ?? "the card behind it"} allows ${money(instrumentLimit!)} — a ${money(instrumentLimit! - cap)} gap. Ask for the limit to be lowered to ${money(cap)}. You can't overspend a limit that doesn't exist, and that beats tracking it after the fact.`;
  } else if (cycleSpent != null && cycleSpent > cap) {
    sentence = `${category} is ${money(cycleSpent - cap)} over the ${money(cap)} cap you set this cycle.`;
  } else if (observedAvg != null && observedAvg > cap) {
    sentence = `Your cap is ${money(cap)} while the file shows an average of ${money(observedAvg)}. The cap is the ceiling, not the average — that difference is the change you're making.`;
  } else {
    sentence = `${category} is inside the ${money(cap)} cap you set.`;
  }

  return {
    category,
    cap,
    observedAvg,
    cycleSpent,
    instrumentLabel,
    instrumentLimit,
    structuralGap,
    sentence,
  };
}

export interface LeakMove {
  droppedCategory: string;
  droppedBy: number;
  roseCategory: string;
  roseBy: number;
  sentence: string;
}

/**
 * Compares category deltas month over month. A capped category falling while
 * another rises by a similar amount means the leak moved — it did not close,
 * and reporting the capped number alone would read as a false win.
 */
export function detectLeakMoves(
  byMonth: { month: string; totals: Record<string, number> }[],
  tolerance = 0.4,
): LeakMove[] {
  if (byMonth.length < 2) return [];
  const prev = byMonth[byMonth.length - 2];
  const curr = byMonth[byMonth.length - 1];
  const cats = new Set([...Object.keys(prev.totals), ...Object.keys(curr.totals)]);

  const deltas = [...cats].map((c) => ({
    category: c,
    delta: round2((curr.totals[c] ?? 0) - (prev.totals[c] ?? 0)),
  }));

  const drops = deltas.filter((d) => d.delta < -5).sort((a, b) => a.delta - b.delta);
  const rises = deltas.filter((d) => d.delta > 5).sort((a, b) => b.delta - a.delta);

  const moves: LeakMove[] = [];
  for (const drop of drops) {
    const match = rises.find(
      (r) => Math.abs(r.delta + drop.delta) <= Math.abs(drop.delta) * tolerance,
    );
    if (!match) continue;
    moves.push({
      droppedCategory: drop.category,
      droppedBy: round2(-drop.delta),
      roseCategory: match.category,
      roseBy: round2(match.delta),
      sentence: `${drop.category} fell ${money(-drop.delta)} but ${match.category} rose ${money(match.delta)} in the same stretch. That's the leak moving, not closing — worth naming before counting the drop as a win.`,
    });
  }
  return moves;
}

// ---------------------------------------------------------------------------
// The full snapshot
// ---------------------------------------------------------------------------

export interface MissingInput {
  field: string;
  label: string;
  to: string;
}

export interface EngineSnapshot {
  complete: boolean;
  missing: MissingInput[];
  todayIso: string;
  window: Window | null;
  projection: BalanceProjection | null;
  funding: FundingPlan | null;
  rebuilds: RebuildItem[];
  reservedTotal: number;
  headline: string;
}

/** One call the UI and the assistant both use. */
export function computeSnapshot(input: EngineInput): EngineSnapshot {
  const missing: MissingInput[] = [];
  if (!input.account.currentBalance && input.account.currentBalance !== 0) {
    missing.push({
      field: "balance",
      label: "What's in your spending account right now",
      to: "/money-meeting",
    });
  }
  const next = projectNextDeposit(input.cycle, input.todayIso);
  if (!next) {
    missing.push({
      field: "next_pay_date",
      label: "The date of your next payday",
      to: "/settings",
    });
  }
  if (!input.cycle.cadence) {
    missing.push({ field: "cadence", label: "How often you get paid", to: "/settings" });
  }

  const reservedTotal = round2(
    input.account.reservedFunds.reduce((s, r) => s + Math.max(0, r.amount - r.tapped), 0),
  );

  if (!next) {
    return {
      complete: false,
      missing,
      todayIso: input.todayIso,
      window: null,
      projection: null,
      funding: null,
      rebuilds: rebuildItems(input.account.reservedFunds),
      reservedTotal,
      headline:
        "This can't be worked out yet, and guessing would be worse than waiting. Add your next payday and what's on hand, and the whole picture fills in.",
    };
  }

  const window: Window = { start: input.todayIso, end: next };
  const projection = projectMinBalance(input, window);
  const funding = buildFundingPlan(input, window);

  return {
    complete: missing.length === 0,
    missing,
    todayIso: input.todayIso,
    window,
    projection,
    funding,
    rebuilds: rebuildItems(input.account.reservedFunds),
    reservedTotal,
    headline: funding.takeaway,
  };
}
