// Row shapes for the Money Meeting tables, plus the one function that turns
// everything the person has entered into a decision-engine input.

import type {
  EngineInput,
  PriorityOverride,
  ReservedFund,
  PendingFlow,
  Cadence,
} from "./decision-engine";
import type { Debt, PlannedExpense, Profile, SavingsGoal } from "./money";
import type { PatternClass, PatternRule } from "./pattern-rules";
import type { IngestTxn } from "./ingest";

export interface MmAccount {
  id: string;
  user_id: string;
  name: string;
  kind: "checking" | "savings" | "credit" | "cash" | "other";
  institution: string | null;
  current_balance: number;
  credit_limit: number | null;
  balance_as_of: string | null;
  archived: boolean;
}

export interface MmReservedFund {
  id: string;
  user_id: string;
  label: string;
  amount: number;
  purpose: string | null;
  tapped_amount: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface MmSpendingCap {
  id: string;
  user_id: string;
  category: string;
  cap_amount: number;
  period: "monthly" | "cycle";
  instrument_label: string | null;
  instrument_limit: number | null;
}

export interface MmImport {
  id: string;
  user_id: string;
  account_id: string | null;
  file_name: string | null;
  period_start: string | null;
  period_end: string | null;
  txn_count: number;
  txns: IngestTxn[];
  created_at: string;
}

export interface MmArtifact {
  id: string;
  user_id: string;
  kind: "cash_flow" | "payoff_schedule" | "checklist" | "budget_actual" | "savings_phases";
  title: string;
  takeaway: string | null;
  payload: Record<string, unknown>;
  check_state: Record<string, boolean>;
  source_import_id: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface MmPatternRuleRow {
  id: string;
  user_id: string;
  pattern: string;
  classify_as: string;
  note: string | null;
  active: boolean;
}

export interface MmPriorityOverride {
  id: string;
  user_id: string;
  ref_kind: "expense" | "debt" | "goal" | "custom";
  ref_id: string;
  label: string;
  tier: number;
  reason: string | null;
  created_at: string;
}

export interface MmSession {
  id: string;
  user_id: string;
  title: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface MmMessage {
  id: string;
  session_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export const ACCOUNT_KINDS: { value: MmAccount["kind"]; label: string; spendable: boolean }[] = [
  { value: "checking", label: "Everyday account", spendable: true },
  { value: "cash", label: "Cash", spendable: true },
  { value: "savings", label: "Savings", spendable: false },
  { value: "credit", label: "Credit card", spendable: false },
  { value: "other", label: "Something else", spendable: false },
];

const spendableKinds = new Set(ACCOUNT_KINDS.filter((k) => k.spendable).map((k) => k.value));

export function toPatternRules(rows: MmPatternRuleRow[]): PatternRule[] {
  return rows.map((r) => ({
    id: r.id,
    pattern: r.pattern,
    classify_as: r.classify_as as PatternClass,
    note: r.note ?? "Your own rule",
    appliesTo: "any" as const,
    source: "user" as const,
    active: r.active,
  }));
}

/**
 * Builds the engine input from everything on file. Nothing is filled in: when a
 * figure is absent it stays absent so the engine can name it.
 */
export function buildEngineInput(args: {
  todayIso: string;
  profile: Profile | null;
  accounts: MmAccount[];
  reserved: MmReservedFund[];
  caps: MmSpendingCap[];
  expenses: PlannedExpense[];
  debts: Debt[];
  goals: SavingsGoal[];
  savedByGoal: Map<string, number>;
  overrides: MmPriorityOverride[];
  namedConstraints?: { label: string; amount: number }[];
  observedLeakAvg?: number | null;
  cycleLeakSpent?: number | null;
}): EngineInput {
  const {
    todayIso, profile, accounts, reserved, caps, expenses, debts, goals,
    savedByGoal, overrides, namedConstraints = [], observedLeakAvg = null, cycleLeakSpent = null,
  } = args;

  // Accounts are the source of truth when any exist; the single profile figure
  // is the fallback for people who haven't added accounts yet.
  const liveAccounts = accounts.filter((a) => !a.archived && spendableKinds.has(a.kind));
  const currentBalance = liveAccounts.length
    ? liveAccounts.reduce((s, a) => s + Number(a.current_balance), 0)
    : Number(profile?.cash_on_hand ?? Number.NaN);

  const reservedFunds: ReservedFund[] = reserved
    .filter((r) => !r.archived)
    .map((r) => ({
      id: r.id,
      label: r.label,
      amount: Number(r.amount),
      purpose: r.purpose ?? "",
      tapped: Number(r.tapped_amount),
    }));

  const pendingOutflows: PendingFlow[] = expenses
    .filter((e) => !e.paid && !e.archived)
    .map((e) => ({
      id: e.id,
      desc: e.name,
      amount: -Number(e.amount),
      date: e.due_date,
      certain: true,
    }));

  const pendingInflows: PendingFlow[] = [];
  if (profile?.next_pay_date) {
    // Only counted when the person told us an amount they can rely on.
    const amount = profile.pay_frequency === "irregular" ? profile.income_low_estimate : null;
    if (amount != null && Number.isFinite(Number(amount))) {
      pendingInflows.push({
        id: "next-pay",
        desc: "Your next pay",
        amount: Number(amount),
        date: profile.next_pay_date,
        certain: profile.pay_frequency !== "irregular",
      });
    }
  }

  const leakCap = caps.find((c) => c.category === "untracked_transfer") ?? caps[0] ?? null;

  return {
    todayIso,
    account: { currentBalance: Number.isFinite(currentBalance) ? currentBalance : 0, pendingOutflows, pendingInflows, reservedFunds },
    cycle: {
      lastDepositDate: null,
      nextDepositDate: profile?.next_pay_date ?? null,
      nextDepositAmount: null,
      cadence: (profile?.pay_frequency as Cadence | null) ?? null,
    },
    obligations: {
      bills: expenses
        .filter((e) => !e.paid && !e.archived)
        .map((e) => ({ id: e.id, name: e.name, amount: Number(e.amount), dueDate: e.due_date, category: e.category, autopay: false })),
      debts: debts
        .filter((d) => !d.archived)
        .map((d) => ({
          id: d.id,
          creditor: d.name,
          balance: Number(d.balance),
          apr: d.apr == null ? null : Number(d.apr),
          minPayment: d.minimum_payment == null ? null : Number(d.minimum_payment),
          dueDate: null,
        })),
      savingsGoals: goals
        .filter((g) => !g.archived)
        .map((g) => ({
          id: g.id,
          label: g.name,
          target: Number(g.target_amount),
          current: savedByGoal.get(g.id) ?? 0,
          monthlyContribution: 0,
        })),
    },
    discretionary: {
      monthlyAvgObserved: observedLeakAvg,
      currentCycleSpent: cycleLeakSpent,
      cap: leakCap ? Number(leakCap.cap_amount) : null,
      leakCategories: caps.map((c) => c.category),
    },
    overrides: overrides.map<PriorityOverride>((o) => ({
      refKind: o.ref_kind,
      refId: o.ref_id,
      tier: o.tier,
      reason: o.reason ?? "You told us this one matters more",
    })),
    safeBuffer: Number(profile?.spending_buffer ?? 0),
    namedConstraints,
  };
}

/** Monthly category totals for leak-move detection. */
export function monthlyCategoryTotals(txns: IngestTxn[]): { month: string; totals: Record<string, number> }[] {
  const map = new Map<string, Record<string, number>>();
  for (const t of txns) {
    if (t.amount >= 0) continue;
    const m = t.date.slice(0, 7);
    const bucket = map.get(m) ?? {};
    bucket[t.klass] = (bucket[t.klass] ?? 0) + Math.abs(t.amount);
    map.set(m, bucket);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, totals]) => ({ month, totals }));
}
