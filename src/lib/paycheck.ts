// Paycheck-cycle cash-flow engine.
//
// One rule governs this file: it never guesses. If any input the math depends on
// is missing, it returns status "needs_more_info" and names what's missing.
// It never substitutes an average, an estimate, or a full expected amount for a
// number the person didn't enter.
//
// Everything here is arithmetic over what the user typed. No bank connection,
// no inference from transaction descriptions, no market-rate claims.

import type { Debt, PlannedExpense, Profile } from "./money";

export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly" | "irregular";

export const PAY_FREQUENCIES: { value: PayFrequency; label: string }[] = [
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every two weeks" },
  { value: "semimonthly", label: "Twice a month" },
  { value: "monthly", label: "Once a month" },
  { value: "irregular", label: "It varies" },
];

export type RiskLevel = "low" | "medium" | "high";

export type RecommendationType = "shortfall_warning" | "holdback" | "safe_to_spend";

export interface Obligation {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
}

export interface PaycheckPlan {
  status: "ok" | "needs_more_info";
  /** Plain-language list of what the person still needs to enter. */
  missing: { field: string; label: string; to: "/settings" | "/future-expenses" }[];
  nextPayDate: string | null;
  onHand: number;
  buffer: number;
  obligations: Obligation[];
  recommendedHoldback: number;
  safeToSpend: number;
  riskLevel: RiskLevel;
  recommendationType: RecommendationType;
  reason: string;
  /** Debt minimums exist but carry no due date, so they're excluded on purpose. */
  undatedDebtMinimums: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function parseDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function buildPaycheckPlan(args: {
  profile: Profile | null;
  expenses: PlannedExpense[];
  debts: Debt[];
  todayIso: string;
}): PaycheckPlan {
  const { profile, expenses, debts, todayIso } = args;

  const base: PaycheckPlan = {
    status: "needs_more_info",
    missing: [],
    nextPayDate: null,
    onHand: 0,
    buffer: 0,
    obligations: [],
    recommendedHoldback: 0,
    safeToSpend: 0,
    riskLevel: "low",
    recommendationType: "safe_to_spend",
    reason: "",
    undatedDebtMinimums: 0,
  };

  const missing: PaycheckPlan["missing"] = [];
  const add = (field: string, label: string, to: "/settings" | "/future-expenses" = "/settings") => {
    if (!missing.some((m) => m.field === field)) missing.push({ field, label, to });
  };

  if (profile?.cash_on_hand == null || !Number.isFinite(Number(profile.cash_on_hand))) {
    add("cash_on_hand", "How much money you have available right now");
  }
  const freq = (profile?.pay_frequency ?? null) as PayFrequency | null;
  if (!freq) add("pay_frequency", "How often you get paid");
  if (!profile?.next_pay_date) add("next_pay_date", "The date of your next payday");
  if (freq === "semimonthly" && !profile?.second_pay_date) {
    add("second_pay_date", "The second payday in the month");
  }
  if (freq === "irregular" && (profile?.income_low_estimate == null || !Number.isFinite(Number(profile.income_low_estimate)))) {
    add("income_low_estimate", "The least you expect to be paid — we never assume the higher number");
  }

  if (missing.length > 0) return { ...base, missing };

  // Next payday: the soonest upcoming date the person gave us.
  const candidates = [profile!.next_pay_date, profile!.second_pay_date]
    .filter((d): d is string => !!d)
    .filter((d) => parseDay(d) >= parseDay(todayIso))
    .sort();
  const nextPayDate = candidates[0] ?? null;

  if (!nextPayDate) {
    return {
      ...base,
      missing: [
        {
          field: "next_pay_date",
          label: "Your next payday has already passed — update it so this stays accurate",
          to: "/settings",
        },
      ],
    };
  }

  const onHand = round2(Number(profile!.cash_on_hand));
  const buffer = round2(Math.max(0, Number(profile!.spending_buffer ?? 0)));

  const obligations: Obligation[] = expenses
    .filter((e) => !e.paid && !e.archived)
    .filter((e) => parseDay(e.due_date) >= parseDay(todayIso) && parseDay(e.due_date) < parseDay(nextPayDate))
    .map((e) => ({ id: e.id, name: e.name, amount: round2(Number(e.amount)), dueDate: e.due_date }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  // Debt minimums have no due date in this app, so they are deliberately NOT
  // folded into the holdback — that would be a guess. They're reported instead.
  const undatedDebtMinimums = round2(
    debts.filter((d) => !d.archived && Number(d.minimum_payment ?? 0) > 0).reduce((s, d) => s + Number(d.minimum_payment), 0),
  );

  const recommendedHoldback = round2(obligations.reduce((s, o) => s + o.amount, 0));
  const safeToSpend = round2(onHand - recommendedHoldback - buffer);

  let riskLevel: RiskLevel;
  let recommendationType: RecommendationType;
  let reason: string;

  if (safeToSpend < 0) {
    riskLevel = "high";
    recommendationType = "shortfall_warning";
    reason =
      obligations.length > 0
        ? `You have ${obligations.length === 1 ? "one bill" : `${obligations.length} bills`} due before ${formatDay(nextPayDate)} that add up to more than what's on hand after your buffer. Moving a due date, paying part of a bill, or adding cash are the ways to close the gap.`
        : `Your buffer is larger than what's on hand, so this shows a gap even with nothing due before ${formatDay(nextPayDate)}.`;
  } else if (recommendedHoldback > 0) {
    riskLevel = safeToSpend < Math.max(buffer, onHand * 0.1) ? "medium" : "low";
    recommendationType = "holdback";
    reason = `Setting this aside covers every bill you've listed as due before ${formatDay(nextPayDate)}. What's left after that is the part you can spend without touching those bills.`;
  } else {
    riskLevel = "low";
    recommendationType = "safe_to_spend";
    reason = `Nothing you've entered is due between today and ${formatDay(nextPayDate)}. That doesn't mean nothing is coming — it means nothing you've told us about is.`;
  }

  return {
    status: "ok",
    missing: [],
    nextPayDate,
    onHand,
    buffer,
    obligations,
    recommendedHoldback,
    safeToSpend,
    riskLevel,
    recommendationType,
    reason,
    undatedDebtMinimums,
  };
}

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: "Low risk",
  medium: "Watch closely",
  high: "High risk",
};
