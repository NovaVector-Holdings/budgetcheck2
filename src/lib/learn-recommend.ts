// Deterministic Learn Money -> Money Meeting contextual matching.
//
// One relevant lesson, chosen from real computed state -- never a random
// pick, never all five at once. Kept as plain, testable logic separate from
// any component so both the weekly check-in and the monthly review call the
// exact same rule.

import { HIGH_APR } from "@/lib/decision-engine";
import { lessons, type Lesson } from "@/lib/lessons";
import type { Debt, SavingsGoal, SavingsDeposit } from "@/lib/money";
import type { MmSpendingCap } from "@/lib/mm";

const byId = (id: string) => lessons.find((l) => l.id === id) ?? null;

export interface RecommendArgs {
  /** From the current funding plan: is there an unfunded item this cycle? */
  shortfall: boolean;
  goals: SavingsGoal[];
  savedByGoal: Map<string, number>;
  debts: Debt[];
  caps: MmSpendingCap[];
}

/**
 * "starter emergency fund" is matched by name (the app has no goal "type"
 * field) -- reasonable given BudgetChek's own onboarding names it exactly
 * this; a goal named otherwise for the same purpose won't match, which is a
 * known, documented limitation rather than a guess.
 */
function emergencyFundGapPct(goals: SavingsGoal[], savedByGoal: Map<string, number>): number | null {
  const fund = goals.find((g) => /emergency/i.test(g.name));
  if (!fund || !Number(fund.target_amount)) return null;
  const saved = savedByGoal.get(fund.id) ?? 0;
  return Math.round((saved / Number(fund.target_amount)) * 100);
}

export function recommendLesson(args: RecommendArgs): { lesson: Lesson; because: string } | null {
  if (args.shortfall) {
    const lesson = byId("budget-basics");
    if (lesson) return { lesson, because: "Your plan shows a shortfall this cycle." };
  }

  const gapPct = emergencyFundGapPct(args.goals, args.savedByGoal);
  if (gapPct != null && gapPct < 50) {
    const lesson = byId("emergency-fund");
    if (lesson) return { lesson, because: "Your starter emergency fund still has real room to go." };
  }

  // A structural gap (the card behind a cap allows more than the cap) is the
  // closest deterministic signal to "a pattern worth a second look" this
  // prototype can compute without multi-month imported statement history.
  const structuralGap = args.caps.find(
    (c) => c.instrument_limit != null && Number(c.instrument_limit) > Number(c.cap_amount),
  );
  if (structuralGap) {
    const lesson = byId("spot-scams");
    if (lesson) return { lesson, because: "One of your spending caps doesn't match the card behind it." };
  }

  const highAprDebt = args.debts.find((d) => Number(d.apr ?? 0) >= HIGH_APR);
  if (highAprDebt) {
    const lesson = byId("investing-roadmap");
    if (lesson) return { lesson, because: `${highAprDebt.name} is charging ${highAprDebt.apr}% — worth clearing before anything else competes for the same dollar.` };
  }

  const lesson = byId("credit-score");
  return lesson ? { lesson, because: "A steady week is a good week to build a habit, not just react to one." } : null;
}
