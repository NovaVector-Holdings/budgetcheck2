// Deterministic Learn Money -> Money Meeting contextual matching.
//
// One relevant lesson, chosen from real computed state -- never a random
// pick, never all five at once. Kept as plain, testable logic separate from
// any component so both the weekly check-in and the monthly review call the
// exact same rule.

import { HIGH_APR } from "@/lib/decision-engine";
import { lessons, type Lesson } from "@/lib/lessons";
import type { Debt, SavingsGoal } from "@/lib/money";

const byId = (id: string) => lessons.find((l) => l.id === id) ?? null;

export interface RecommendArgs {
  /** From the current funding plan: is there an unfunded item this cycle? */
  shortfall: boolean;
  goals: SavingsGoal[];
  savedByGoal: Map<string, number>;
  debts: Debt[];
}

/**
 * Final rule table (top match wins, one lesson, never more than one):
 *
 * | # | Condition                                | Lesson            |
 * |---|--------------------------------------------|--------------------|
 * | 1 | Shortfall this cycle                       | budget-basics      |
 * | 2 | Starter emergency-fund goal < 50% funded   | emergency-fund     |
 * | 3 | A debt at/above HIGH_APR (15%)              | investing-roadmap  |
 * | 4 | None of the above                          | no recommendation (returns null) |
 *
 * No generic default lesson. A spending-cap/instrument-limit structural gap
 * does NOT appear in this table on purpose -- see the comment further down.
 * Per the CEO's ruling: forcing a lesson onto a state with no genuinely
 * relevant match is worse than showing none, and that applies to the
 * no-signal case too, not just the removed spending-cap branch. Callers
 * already render the recommendation conditionally, so null needs no
 * placeholder.
 */

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

  // Deliberately no branch here for a spending-cap/instrument-limit
  // mismatch: that's a budgeting-discipline signal, not evidence of a scam,
  // and none of the five lessons on file is specifically about spending-cap
  // or credit-limit discipline. Per the CEO's ruling, forcing a lesson onto
  // a condition with no genuinely relevant one is worse than showing none --
  // this condition does not create a recommendation of its own; evaluation
  // continues to any genuinely matching rule below, otherwise the function
  // returns null.

  const highAprDebt = args.debts.find((d) => Number(d.apr ?? 0) >= HIGH_APR);
  if (highAprDebt) {
    const lesson = byId("investing-roadmap");
    if (lesson) {
      return {
        lesson,
        because: `${highAprDebt.name} is charging ${highAprDebt.apr}% interest, so it may be worth reviewing before putting extra money toward investing.`,
      };
    }
  }

  // No meaningful signal matched -- no forced default. See the doc comment
  // above the rule table.
  return null;
}
