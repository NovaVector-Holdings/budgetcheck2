// Artifact builders.
//
// An artifact is a saved, re-openable, recomputable answer — a dashboard, a
// dated payoff schedule, a printable checklist, a budget-versus-actual
// comparison, or a phased savings plan. Every one carries a plain-language
// takeaway sentence at the top, never a bare table.

import type { EngineInput, EngineSnapshot, RankedItem } from "./decision-engine";
import { buildFundingPlan, computeSnapshot, formatDay, formatShort, addDays, day } from "./decision-engine";
import type { IngestTxn } from "./ingest";
import { CLASS_META, type PatternClass } from "./pattern-rules";
import type { Debt, SavingsGoal } from "./money";

export type ArtifactKind = "cash_flow" | "payoff_schedule" | "checklist" | "budget_actual" | "savings_phases";

export const ARTIFACT_META: Record<ArtifactKind, { label: string; blurb: string }> = {
  cash_flow: { label: "Where you stand", blurb: "Balance today, the low point before your next payday, and where funding runs out." },
  payoff_schedule: { label: "Payoff schedule", blurb: "A dated, pay-cycle-by-pay-cycle table down to a zero balance." },
  checklist: { label: "Checklist", blurb: "The same plan as boxes you can tick off, and printing keeps the ticks." },
  budget_actual: { label: "Planned against actual", blurb: "Category by category, with anything unusual called out rather than buried." },
  savings_phases: { label: "Savings phases", blurb: "A staged plan that steps up as each trigger is met." },
};

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ArtifactBase {
  kind: ArtifactKind;
  title: string;
  takeaway: string;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Cash-flow dashboard
// ---------------------------------------------------------------------------

export interface CashFlowPayload extends ArtifactBase {
  kind: "cash_flow";
  balanceToday: number;
  reservedHeld: number;
  projectedMinBalance: number;
  windowStart: string;
  windowEnd: string;
  items: RankedItem[];
  cutoffIndex: number;
  debts: { creditor: string; balance: number; apr: number | null; minPayment: number | null }[];
  goals: { label: string; current: number; target: number; pct: number }[];
  ledger: { date: string; desc: string; delta: number; balance: number }[];
  missing: { field: string; label: string; to: string }[];
}

export function buildCashFlow(
  input: EngineInput,
  extras: { debts: Debt[]; goals: SavingsGoal[]; savedByGoal: Map<string, number> },
): CashFlowPayload {
  const snap: EngineSnapshot = computeSnapshot(input);
  const funding = snap.funding;

  return {
    kind: "cash_flow",
    title: `Where you stand — ${formatShort(input.todayIso)}`,
    takeaway: snap.headline,
    generatedAt: new Date().toISOString(),
    balanceToday: round2(input.account.currentBalance),
    reservedHeld: snap.reservedTotal,
    projectedMinBalance: snap.projection?.projectedMinBalance ?? 0,
    windowStart: snap.window?.start ?? input.todayIso,
    windowEnd: snap.window?.end ?? input.todayIso,
    items: funding?.items ?? [],
    cutoffIndex: funding?.cutoffIndex ?? -1,
    debts: extras.debts.map((d) => ({
      creditor: d.name,
      balance: Number(d.balance),
      apr: d.apr == null ? null : Number(d.apr),
      minPayment: d.minimum_payment == null ? null : Number(d.minimum_payment),
    })).sort((a, b) => Number(b.apr ?? 0) - Number(a.apr ?? 0)),
    goals: extras.goals.map((g) => {
      const current = extras.savedByGoal.get(g.id) ?? 0;
      const target = Number(g.target_amount);
      return { label: g.name, current, target, pct: target ? Math.min(100, Math.round((current / target) * 100)) : 0 };
    }),
    ledger: (snap.projection?.ledger ?? []).map((l) => ({ date: l.date, desc: l.desc, delta: l.delta, balance: l.balance })),
    missing: snap.missing,
  };
}

// ---------------------------------------------------------------------------
// Payoff schedule — by pay cycle, not by calendar month
// ---------------------------------------------------------------------------

export interface ScheduleRow {
  n: number;
  date: string;
  fixedObligations: number;
  extraPayment: number;
  interest: number;
  resultingBalance: number;
  done: boolean;
}

export interface PayoffPayload extends ArtifactBase {
  kind: "payoff_schedule";
  target: string;
  cadence: string;
  perCycleExtra: number;
  minPerCycle: number;
  rows: ScheduleRow[];
  freeDate: string | null;
  totalInterest: number;
  impossibleReason: string | null;
}

const CADENCE_DAYS: Record<string, number> = { weekly: 7, biweekly: 14, semimonthly: 15, monthly: 30, irregular: 30 };

/**
 * Simulates one debt cycle by cycle. Interest is that debt's APR prorated to
 * the cycle length; a debt with no APR is treated as 0% rather than assumed.
 */
export function buildPayoffSchedule(args: {
  debt: Debt;
  cadence: string;
  startIso: string;
  extraPerCycle: number;
  fixedPerCycle: number;
}): PayoffPayload {
  const { debt, cadence, startIso, extraPerCycle, fixedPerCycle } = args;
  const step = CADENCE_DAYS[cadence] ?? 30;
  const apr = Number(debt.apr ?? 0);
  const min = Number(debt.minimum_payment ?? 0);
  const perCycle = round2(min + Math.max(0, extraPerCycle));

  const base: PayoffPayload = {
    kind: "payoff_schedule",
    title: `Paying off ${debt.name}`,
    takeaway: "",
    generatedAt: new Date().toISOString(),
    target: debt.name,
    cadence,
    perCycleExtra: round2(Math.max(0, extraPerCycle)),
    minPerCycle: round2(min),
    rows: [],
    freeDate: null,
    totalInterest: 0,
    impossibleReason: null,
  };

  let balance = Number(debt.balance);
  if (balance <= 0) {
    return { ...base, takeaway: `${debt.name} is already at zero.`, impossibleReason: "already-clear" };
  }
  if (perCycle <= 0) {
    return {
      ...base,
      takeaway: `A schedule needs a payment amount. Add a minimum payment for ${debt.name}, or set an extra amount here.`,
      impossibleReason: "no-payment",
    };
  }

  const cycleRate = apr / 100 / (365 / step);
  if (perCycle <= balance * cycleRate) {
    return {
      ...base,
      takeaway: `At ${money(perCycle)} per cycle the interest on ${debt.name} grows faster than the payment, so it never clears. Even ${money(Math.ceil(balance * cycleRate) + 25 - perCycle)} more per cycle turns that around.`,
      impossibleReason: "payment-too-small",
    };
  }

  const rows: ScheduleRow[] = [];
  let date = startIso;
  let totalInterest = 0;
  let n = 0;
  while (balance > 0.01 && n < 600) {
    n++;
    date = addDays(date, step);
    const interest = round2(balance * cycleRate);
    totalInterest = round2(totalInterest + interest);
    balance = round2(balance + interest);
    const pay = Math.min(balance, perCycle);
    balance = round2(balance - pay);
    rows.push({
      n,
      date,
      fixedObligations: round2(fixedPerCycle),
      extraPayment: round2(Math.max(0, pay - min)),
      interest,
      resultingBalance: balance,
      done: false,
    });
  }

  const freeDate = rows.length ? rows[rows.length - 1].date : null;
  return {
    ...base,
    rows,
    freeDate,
    totalInterest,
    takeaway: `Holding ${money(perCycle)} every ${cadence === "biweekly" ? "two weeks" : cadence} clears ${debt.name} by ${freeDate ? formatDay(freeDate) : "—"} — ${rows.length} payments and ${money(totalInterest)} of interest along the way.`,
  };
}

// ---------------------------------------------------------------------------
// Printable checklist
// ---------------------------------------------------------------------------

export interface ChecklistPayload extends ArtifactBase {
  kind: "checklist";
  items: { key: string; label: string; detail: string; amount: number | null }[];
}

export function checklistFromSchedule(p: PayoffPayload): ChecklistPayload {
  return {
    kind: "checklist",
    title: `${p.target} — payment checklist`,
    takeaway: p.takeaway,
    generatedAt: new Date().toISOString(),
    items: p.rows.map((r) => ({
      key: `row-${r.n}`,
      label: `Payment ${r.n} · ${formatDay(r.date)}`,
      detail: `${money(r.minPerCycleSafe ?? 0)}`.replace("undefined", "") ||
        `Balance after this payment: ${money(r.resultingBalance)}`,
      amount: round2(p.minPerCycle + r.extraPayment),
    })),
  };
}

export function checklistFromCashFlow(p: CashFlowPayload): ChecklistPayload {
  const items = p.items.map((it, i) => ({
    key: it.id,
    label: it.label,
    detail:
      i === p.cutoffIndex
        ? `Funding runs out here — ${money(it.funded)} of ${money(it.amount)} covered`
        : `${it.tierLabel}${it.dueDate ? ` · due ${formatDay(it.dueDate)}` : ""}`,
    amount: it.amount,
  }));
  return {
    kind: "checklist",
    title: `Before ${formatShort(p.windowEnd)} — what to pay, in order`,
    takeaway: p.takeaway,
    generatedAt: new Date().toISOString(),
    items,
  };
}

// ---------------------------------------------------------------------------
// Budget vs actual
// ---------------------------------------------------------------------------

export interface BudgetActualRow {
  category: string;
  label: string;
  planned: number | null;
  actual: number;
  diff: number | null;
  note: string | null;
}

export interface BudgetActualPayload extends ArtifactBase {
  kind: "budget_actual";
  periodStart: string;
  periodEnd: string;
  rows: BudgetActualRow[];
  anomalies: string[];
  unplannedTotal: number;
}

/**
 * Compares what the person planned against what the file shows. The catch-all
 * bucket is called out explicitly when it grows, rather than left to hide in a
 * row near the bottom.
 */
export function buildBudgetActual(args: {
  txns: IngestTxn[];
  planned: { name: string; amount: number; category: string }[];
  caps: { category: string; cap_amount: number }[];
}): BudgetActualPayload {
  const { txns, planned, caps } = args;
  const spend = txns.filter((t) => t.amount < 0);

  const actual = new Map<PatternClass, number>();
  for (const t of spend) actual.set(t.klass, round2((actual.get(t.klass) ?? 0) + Math.abs(t.amount)));

  const plannedByCat = new Map<string, number>();
  for (const p of planned) plannedByCat.set(p.category, round2((plannedByCat.get(p.category) ?? 0) + Number(p.amount)));
  for (const c of caps) plannedByCat.set(c.category, round2((plannedByCat.get(c.category) ?? 0) + Number(c.cap_amount)));

  const cats = new Set<string>([...actual.keys(), ...plannedByCat.keys()]);
  const rows: BudgetActualRow[] = [...cats].map((cat) => {
    const act = actual.get(cat as PatternClass) ?? 0;
    const plan = plannedByCat.has(cat) ? plannedByCat.get(cat)! : null;
    const meta = CLASS_META[cat as PatternClass];
    return {
      category: cat,
      label: meta?.label ?? cat,
      planned: plan,
      actual: act,
      diff: plan == null ? null : round2(act - plan),
      note: plan == null ? "Nothing planned for this — it's all unplanned spending" : null,
    };
  }).sort((a, b) => b.actual - a.actual);

  const anomalies: string[] = [];
  const other = rows.find((r) => r.category === "other");
  if (other && other.actual > 0) {
    const totalSpend = rows.reduce((s, r) => s + r.actual, 0);
    const share = totalSpend ? other.actual / totalSpend : 0;
    if (share > 0.15) {
      anomalies.push(
        `${money(other.actual)} — ${Math.round(share * 100)}% of everything you spent — landed in "unlabelled". That's the biggest single thing to fix here: a category you can't name is a category you can't manage.`,
      );
    }
  }
  for (const r of rows) {
    if (r.planned != null && r.diff != null && r.diff > Math.max(25, r.planned * 0.25)) {
      anomalies.push(`${r.label} came in ${money(r.diff)} over the ${money(r.planned)} you planned.`);
    }
  }
  const signals = rows.filter((r) => CLASS_META[r.category as PatternClass]?.signal && r.actual > 0);
  for (const s of signals) {
    anomalies.push(`${s.label}: ${money(s.actual)}. ${CLASS_META[s.category as PatternClass].why}`);
  }

  const unplannedTotal = round2(rows.filter((r) => r.planned == null).reduce((s, r) => s + r.actual, 0));
  const totalActual = round2(rows.reduce((s, r) => s + r.actual, 0));
  const totalPlanned = round2(rows.reduce((s, r) => s + (r.planned ?? 0), 0));

  return {
    kind: "budget_actual",
    title: `Planned against actual`,
    takeaway:
      totalPlanned > 0
        ? `You planned ${money(totalPlanned)} and spent ${money(totalActual)}${totalActual > totalPlanned ? `, ${money(totalActual - totalPlanned)} over` : `, ${money(totalPlanned - totalActual)} under`}. ${unplannedTotal > 0 ? `${money(unplannedTotal)} of it had no plan at all — start there.` : ""}`
        : `You spent ${money(totalActual)} across this file, none of it against a plan yet. Setting a number on your two largest categories is the whole first step.`,
    generatedAt: new Date().toISOString(),
    periodStart: txns[0]?.date ?? "",
    periodEnd: txns[txns.length - 1]?.date ?? "",
    rows,
    anomalies,
    unplannedTotal,
  };
}

// ---------------------------------------------------------------------------
// Savings phase tracker
// ---------------------------------------------------------------------------

export interface SavingsPhase {
  n: number;
  percentOfCheck: number;
  destination: string;
  trigger: string;
  amountPerCheck: number | null;
  status: "active" | "next" | "later";
}

export interface SavingsPhasesPayload extends ArtifactBase {
  kind: "savings_phases";
  phases: SavingsPhase[];
  depositAmount: number | null;
  debtRemaining: number;
}

/**
 * A staged plan that steps up as each trigger is met. Percentages are the
 * person's own choice; the trigger conditions come from their own balances.
 */
export function buildSavingsPhases(args: {
  depositAmount: number | null;
  debtRemaining: number;
  goals: { name: string }[];
  percents?: number[];
}): SavingsPhasesPayload {
  const { depositAmount, debtRemaining, goals } = args;
  const percents = args.percents ?? [10, 15, 20];
  const dest = (i: number) => goals[i]?.name ?? goals[0]?.name ?? "your savings goal";

  const phases: SavingsPhase[] = percents.map((p, i) => ({
    n: i + 1,
    percentOfCheck: p,
    destination: dest(i),
    trigger:
      i === 0
        ? debtRemaining > 0
          ? `Starts once your debts are under ${money(Math.max(0, debtRemaining * 0.25))} — a quarter of where they are now`
          : "Starts now, since you have no debt balances saved"
        : `Moves up from ${percents[i - 1]}% once ${dest(i - 1)} holds three months of your bills`,
    amountPerCheck: depositAmount != null ? round2((depositAmount * p) / 100) : null,
    status: i === 0 ? (debtRemaining > 0 ? "next" : "active") : i === 1 ? "next" : "later",
  }));

  return {
    kind: "savings_phases",
    title: "Savings phases",
    takeaway:
      depositAmount != null
        ? `Phase one puts ${money((depositAmount * percents[0]) / 100)} of every ${money(depositAmount)} deposit into ${dest(0)}, and each phase only starts when the one before it is genuinely done.`
        : `Add what a typical deposit is and each phase will show the exact dollar amount instead of a percentage.`,
    generatedAt: new Date().toISOString(),
    phases,
    depositAmount,
    debtRemaining: round2(debtRemaining),
  };
}

export type ArtifactPayload =
  | CashFlowPayload
  | PayoffPayload
  | ChecklistPayload
  | BudgetActualPayload
  | SavingsPhasesPayload;
