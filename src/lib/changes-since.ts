// Shared "what changed since the last check-in/review" logic, used by both
// the weekly check-in and the monthly review.
//
// Deliberately narrow: it only reports changes that are honestly derivable
// from real timestamps already on file (created_at on bills/debts/goals/
// overrides, updated_at on reserved funds). It does NOT claim "bill amount
// changed from $X to $Y" or "debt balance changed" -- those tables have no
// updated_at/history column, so a specific before/after claim would be
// invented, not observed. If per-field change history is wanted later, that
// needs a schema addition, not a guess here.

import { fmt } from "@/lib/money";
import { FUNDING_TIERS } from "@/lib/decision-engine";
import type { Debt, PlannedExpense, SavingsGoal, SavingsDeposit } from "@/lib/money";
import type { MmPriorityOverride, MmReservedFund } from "@/lib/mm";

export interface ChangeEntry {
  kind: "new_bill" | "new_debt" | "new_goal" | "new_override" | "reserved_tapped" | "deposit_logged";
  text: string;
}

const isAfter = (iso: string, sinceMs: number) => new Date(iso).getTime() > sinceMs;

export function computeChangesSince(
  sinceIso: string | null,
  args: {
    expenses: PlannedExpense[];
    debts: Debt[];
    goals: SavingsGoal[];
    overrides: MmPriorityOverride[];
    reserved: MmReservedFund[];
    deposits?: SavingsDeposit[];
  },
): ChangeEntry[] {
  if (!sinceIso) return [];
  const sinceMs = new Date(sinceIso).getTime();
  const out: ChangeEntry[] = [];

  for (const e of args.expenses) {
    if (isAfter(e.created_at, sinceMs)) {
      out.push({ kind: "new_bill", text: `New bill added — ${e.name} (${fmt(Number(e.amount))}, due ${e.due_date}).` });
    }
  }
  for (const d of args.debts) {
    if (isAfter(d.created_at, sinceMs)) {
      out.push({ kind: "new_debt", text: `New debt added — ${d.name} (${fmt(Number(d.balance))}).` });
    }
  }
  for (const g of args.goals) {
    if (isAfter(g.created_at, sinceMs)) {
      out.push({ kind: "new_goal", text: `New savings goal added — ${g.name} (target ${fmt(Number(g.target_amount))}).` });
    }
  }
  for (const o of args.overrides) {
    if (isAfter(o.created_at, sinceMs)) {
      const tierLabel = FUNDING_TIERS[o.tier - 1]?.label ?? "a different tier";
      out.push({
        kind: "new_override",
        text: `You set a priority — ${o.label} moved to ${tierLabel}${o.reason ? ` (${o.reason})` : ""}.`,
      });
    }
  }
  for (const r of args.reserved) {
    if (Number(r.tapped_amount) > 0 && isAfter(r.updated_at, sinceMs)) {
      out.push({
        kind: "reserved_tapped",
        text: `${r.label} was tapped for ${fmt(Number(r.tapped_amount))} — first in line to rebuild on your next deposit.`,
      });
    }
  }
  for (const dep of args.deposits ?? []) {
    if (isAfter(dep.created_at, sinceMs)) {
      out.push({ kind: "deposit_logged", text: `${fmt(Number(dep.amount))} logged toward savings${dep.note ? ` — ${dep.note}` : ""}.` });
    }
  }

  return out;
}
