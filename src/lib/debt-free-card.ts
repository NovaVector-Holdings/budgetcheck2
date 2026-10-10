import { debtsMissingMinimum, type DebtObligation } from "./decision-engine";
import type { Debt } from "./money";
import { buildPayoffPlan, payoffReasonCopy, type PayoffPlan } from "./payoff";
import type { PlanStatus } from "./plan-status";

// The Overview's Debt-free goal card -- what it may claim next to the paycheck
// plan.
//
// SME/CEO return (binding): the card must not show a confident long-range
// payoff date beside a PLAN INCOMPLETE banner. Two different reasons for an
// incomplete plan need two different treatments, because they affect the date
// differently:
//
//   - A debt's DUE DAY is unknown (every minimum is known): the payoff
//     simulation never reads due dates, so the date is still computed from real
//     minimums and stays meaningful as a LONG-TERM estimate. It is shown, but
//     qualified ("Long-term estimate ... This paycheck's debt timing is still
//     incomplete") and the qualifier comes BEFORE the date.
//   - An active debt's MINIMUM is unknown: buildPayoffPlan counts a missing
//     minimum as $0 (payoff.ts), so the monthly payment is understated and the
//     date can be many months wrong. No date is shown at all -- a guess.
//
// "Unknown minimum" comes from the ENGINE's own classifier
// (debtsMissingMinimum), never re-derived here: two private definitions of
// "incomplete" is exactly how the assistant and the Overview disagreed before.
// It is callable without a funding plan, so the suppression still works when
// there is no payday yet (the "setup" status).
//
// The old always-100% progress bar is gone in every state: its width was
// (first - last) / first, and `last` is ~0 for any computable plan, so it read
// as "done" next to a date that is years away.

export type DebtFreeCardState =
  | { kind: "no-debts"; hadRows: boolean }
  | { kind: "blocked"; count: number; names: string; firstId: string }
  | { kind: "cannot-estimate"; reason: string; copy: string }
  | {
      kind: "estimate";
      plan: PayoffPlan;
      dueDatesIncomplete: boolean;
      firstTimingId: string | null;
    };

/** "Visa card" / "Visa card and Store card" / "Visa card and 2 other debts". */
export function joinDebtNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} other debts`;
}

export function debtFreeCardState(args: {
  /** The loaded (non-archived) debt rows the payoff plan runs on. */
  debts: Debt[];
  /** The engine's own view of those same debts. */
  obligations: DebtObligation[];
  status: PlanStatus;
  now?: Date;
}): DebtFreeCardState {
  const { debts, obligations, status, now } = args;
  const active = debts.filter((d) => Number.isFinite(Number(d.balance)) && Number(d.balance) > 0);
  if (!active.length) return { kind: "no-debts", hadRows: debts.length > 0 };

  const missing = debtsMissingMinimum(obligations);
  if (missing.length > 0) {
    return {
      kind: "blocked",
      count: missing.length,
      names: joinDebtNames(missing.map((d) => d.creditor)),
      firstId: missing[0].id,
    };
  }

  const plan = buildPayoffPlan(active, "snowball", 0, now);
  if (!plan.possible) {
    const reason = plan.reason ?? "too-long";
    return {
      kind: "cannot-estimate",
      reason,
      copy:
        reason === "no-payment"
          ? "Add minimum payments on the Debt page to see your payoff date."
          : payoffReasonCopy(reason),
    };
  }

  const timing =
    status.kind === "incomplete" ? status.unplaced.filter((d) => d.reason === "timing") : [];
  return {
    kind: "estimate",
    plan,
    dueDatesIncomplete: timing.length > 0,
    firstTimingId: timing[0]?.id ?? null,
  };
}
