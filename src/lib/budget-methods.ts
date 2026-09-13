// Budget methods.
//
// Three methods only, each one taught by a public financial-education program
// rather than owned by a brand:
//
//  - 50/30/20 — CFPB publishes it as a consumer "rule to live by" and uses it in
//    its high-school Building Blocks budgeting activity.
//  - Zero-based ("give every dollar a job") — the spending-plan approach in the
//    FDIC's Money Smart module on spending and saving plans.
//  - Envelope / category limits ("cash stuffing") — taught by university
//    extension spending-plan curricula and community-college financial literacy
//    courses.
//
// Deliberately NOT offered as a budget method: "snowball budget". Snowball is a
// real, evidence-backed way to ORDER debt payoff (and lives on the Debt page),
// but framing a whole budget around it is one company's branding.

import type { Debt, PlannedExpense, SavingsDeposit } from "./money";
import { EXPENSE_CATEGORIES } from "./money";

export type BudgetMethod = "fifty_thirty_twenty" | "zero_based" | "envelope";

export const BUDGET_METHODS: {
  value: BudgetMethod;
  label: string;
  tagline: string;
  bestFor: string;
  source: string;
}[] = [
  {
    value: "fifty_thirty_twenty",
    label: "50/30/20",
    tagline: "Half to needs, a third to wants, a fifth to saving and debt.",
    bestFor: "You want one simple yardstick and a steady paycheck.",
    source: "Published by the Consumer Financial Protection Bureau as a spending rule of thumb.",
  },
  {
    value: "zero_based",
    label: "Every dollar has a job",
    tagline: "Assign all your income until nothing is left unassigned.",
    bestFor: "You want tight control, or you're pushing hard on debt.",
    source: "The spending-plan approach in the FDIC's Money Smart materials.",
  },
  {
    value: "envelope",
    label: "Category limits",
    tagline: "Give each category its own limit and stop when it's used up.",
    bestFor: "One or two categories keep running away from you.",
    source: "Taught as cash envelopes or 'cash stuffing' in university extension money courses.",
  },
];

// Exhaustive by construction: adding a category to EXPENSE_CATEGORIES without
// bucketing it here is a type error, so nothing can silently fall through.
export const CATEGORY_BUCKET: Record<(typeof EXPENSE_CATEGORIES)[number], "needs" | "wants"> = {
  housing: "needs",
  utilities: "needs",
  food: "needs",
  transport: "needs",
  debt: "needs",
  health: "needs",
  personal: "wants",
  fun: "wants",
  other: "wants",
};

export const NEEDS_CATEGORIES = Object.keys(CATEGORY_BUCKET).filter(
  (c) => CATEGORY_BUCKET[c as keyof typeof CATEGORY_BUCKET] === "needs",
);
export const WANTS_CATEGORIES = Object.keys(CATEGORY_BUCKET).filter(
  (c) => CATEGORY_BUCKET[c as keyof typeof CATEGORY_BUCKET] === "wants",
);

function bucketOf(category: string): "needs" | "wants" {
  return CATEGORY_BUCKET[category as keyof typeof CATEGORY_BUCKET] ?? "wants";
}

export interface MethodInput {
  income: number | null;
  /** Unpaid, unarchived planned expenses due in the current calendar month. */
  monthExpenses: PlannedExpense[];
  debts: Debt[];
  /** Deposits logged in the current calendar month. */
  monthDeposits: SavingsDeposit[];
}

export interface Line {
  label: string;
  amount: number;
}

export interface Bucket {
  key: string;
  label: string;
  explain: string;
  actual: number;
  target: number | null;
  /** Going over target is good here (saving), so never flag it as a problem. */
  goalBucket?: boolean;
  lines: Line[];
}

export interface MethodResult {
  income: number;
  buckets: Bucket[];
  unassigned: number;
  status: "balanced" | "unassigned" | "over";
  warnings: string[];
}

const sum = (ns: number[]) => Math.round(ns.reduce((s, n) => s + n, 0) * 100) / 100;

function parts(input: MethodInput) {
  const needsLines = input.monthExpenses
    .filter((e) => bucketOf(e.category) === "needs")
    .map((e) => ({ label: e.name, amount: Number(e.amount) }));
  const wantsLines = input.monthExpenses
    .filter((e) => bucketOf(e.category) === "wants")
    .map((e) => ({ label: e.name, amount: Number(e.amount) }));
  const minimumLines = input.debts
    .filter((d) => Number(d.minimum_payment ?? 0) > 0)
    .map((d) => ({ label: `${d.name} (minimum)`, amount: Number(d.minimum_payment) }));
  const savingLines = input.monthDeposits.map((d) => ({
    label: d.note?.trim() || "Deposit into savings",
    amount: Number(d.amount),
  }));
  return { needsLines, wantsLines, minimumLines, savingLines };
}

export function computeMethod(method: BudgetMethod, input: MethodInput): MethodResult {
  const income = Number(input.income ?? 0);
  const { needsLines, wantsLines, minimumLines, savingLines } = parts(input);

  if (method === "fifty_thirty_twenty") {
    const needs = [...needsLines, ...minimumLines];
    const needsActual = sum(needs.map((l) => l.amount));
    const wantsActual = sum(wantsLines.map((l) => l.amount));
    const saveActual = sum(savingLines.map((l) => l.amount));
    const buckets: Bucket[] = [
      {
        key: "needs",
        label: "Needs — target 50%",
        explain: "Housing, utilities, food, getting around, health, and the minimum on each debt.",
        actual: needsActual,
        target: income ? Math.round(income * 0.5 * 100) / 100 : null,
        lines: needs,
      },
      {
        key: "wants",
        label: "Wants — target 30%",
        explain: "Everything you'd still be fine without: fun, personal spending, the rest.",
        actual: wantsActual,
        target: income ? Math.round(income * 0.3 * 100) / 100 : null,
        lines: wantsLines,
      },
      {
        key: "save",
        label: "Saving & extra debt — target 20%",
        explain: "What you put into savings this month. Going over this one is a win.",
        actual: saveActual,
        target: income ? Math.round(income * 0.2 * 100) / 100 : null,
        goalBucket: true,
        lines: savingLines,
      },
    ];
    const unassigned = Math.round((income - needsActual - wantsActual - saveActual) * 100) / 100;
    const warnings: string[] = [];
    if (income) {
      if (needsActual > income * 0.5) warnings.push("Your needs are over half your income — the usual cause is housing or a car payment, not day-to-day spending.");
      if (wantsActual > income * 0.3) warnings.push("Your wants are over 30% — this is the bucket that's easiest to move.");
      if (saveActual < income * 0.1) warnings.push("Saving is under half the 20% target. Even a small automatic amount counts.");
    }
    return {
      income,
      buckets,
      unassigned,
      status: Math.abs(unassigned) < 1 ? "balanced" : unassigned > 0 ? "unassigned" : "over",
      warnings,
    };
  }

  if (method === "zero_based") {
    const jobs: Bucket[] = [
      { key: "bills", label: "Bills due this month", explain: "Everything you've listed with a due date this month.", actual: sum(needsLines.concat(wantsLines).map((l) => l.amount)), target: null, lines: [...needsLines, ...wantsLines] },
      { key: "minimums", label: "Debt minimums", explain: "The least you must pay on each debt.", actual: sum(minimumLines.map((l) => l.amount)), target: null, lines: minimumLines },
      { key: "saving", label: "Into savings", explain: "Deposits you've logged this month.", actual: sum(savingLines.map((l) => l.amount)), target: null, lines: savingLines },
    ].filter((b) => b.actual > 0);
    const assigned = sum(jobs.map((j) => j.actual));
    const unassigned = Math.round((income - assigned) * 100) / 100;
    const warnings: string[] = [];
    if (unassigned > 1) warnings.push("You still have money with no job. Unassigned money is the money that disappears.");
    if (unassigned < -1) warnings.push("You've assigned more than comes in. Something in the list has to shrink.");
    return {
      income,
      buckets: jobs,
      unassigned,
      status: Math.abs(unassigned) < 1 ? "balanced" : unassigned > 0 ? "unassigned" : "over",
      warnings,
    };
  }

  // Envelope: one limit per category you actually use.
  const byCat = new Map<string, Line[]>();
  for (const e of input.monthExpenses) {
    const list = byCat.get(e.category) ?? [];
    list.push({ label: e.name, amount: Number(e.amount) });
    byCat.set(e.category, list);
  }
  const envelopes: Bucket[] = [...byCat.entries()]
    .map(([cat, lines]) => ({
      key: cat,
      label: cat.charAt(0).toUpperCase() + cat.slice(1),
      explain: bucketOf(cat) === "needs" ? "A need — hard to shrink quickly." : "A want — the easiest place to find room.",
      actual: sum(lines.map((l) => l.amount)),
      target: null,
      lines,
    }))
    .sort((a, b) => b.actual - a.actual);
  const minimums = sum(minimumLines.map((l) => l.amount));
  if (minimums > 0) {
    envelopes.push({ key: "debt-minimums", label: "Debt minimums", explain: "Kept in its own envelope so it never gets borrowed from.", actual: minimums, target: null, lines: minimumLines });
  }
  const filled = sum(envelopes.map((e) => e.actual));
  const unassigned = Math.round((income - filled) * 100) / 100;
  const warnings: string[] = [];
  if (envelopes.length === 0) warnings.push("No envelopes yet — add your bills and expenses and each category gets its own.");
  if (unassigned < -1) warnings.push("Your envelopes add up to more than your income.");
  return {
    income,
    buckets: envelopes,
    unassigned,
    status: Math.abs(unassigned) < 1 ? "balanced" : unassigned > 0 ? "unassigned" : "over",
    warnings,
  };
}
