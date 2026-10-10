import type { EngineInput, EngineSnapshot, MissingInput } from "./decision-engine";
import { formatDay } from "./decision-engine";
import type { BalanceSource } from "./mm";
import { fmt } from "./money";

// Gate 2 remediation -- the paycheck plan's COMPLETENESS state.
//
// CEO / PRODUCT RULING "GATE 2 RESULT + FINAL REMEDIATION PATH" (2026-10-09):
// Round-1 evidence showed a large positive "Estimated remaining" is read as
// spendable money even with disclaimer language beside it, and that fixing
// that with yet another disclaimer cannot work. The structural fix: when
// BudgetChek KNOWS a required obligation can't be placed in the paycheck
// window (a debt minimum whose due date was never entered), the plan is
// INCOMPLETE and the Overview must say so -- as the dominant message, not as
// a footnote under a healthy-looking number.
//
// This file is a PURE derivation over the one governed engine snapshot
// (computeSnapshot, the same result Money Meeting / Weekly Check-in / Ask a
// Question use). It introduces no new money math and no new notion of "due":
//   - "incomplete" is exactly `funding.debtsWithUnknownTiming.length > 0`,
//     the engine's own list of required minimums it refuses to place without
//     guessing;
//   - every dollar below is read from, or a straight sum/difference of,
//     fields the engine already produced (`available`, `totalRequested`,
//     `reservedTotal`, `safeBuffer`, ...), and the proof script asserts the
//     displayed footing rows sum to the engine's own remainder.
// `EngineSnapshot.complete` is deliberately NOT used: it means "setup is
// complete" (balance / payday / cadence on file), a different question, and
// the assistant's grounding layer depends on that meaning staying put.
//
// Nothing in this file touches decision-engine.ts or grounding.ts (the PR #10
// trust-gate surface).

/** One row of the visible calculation. `amount` is SIGNED: it is what the row
 *  contributes to the remainder, so the rows always sum to `remainder`. */
export interface FootingRow {
  key: "balance" | "keep" | "reserved" | "buffer" | "floor" | "inflows";
  label: string;
  amount: number;
}

/** An obligation inside the paycheck window that "Keep available" covers. */
export interface KeepItem {
  id: string;
  label: string;
  amount: number;
  dueDate: string | null;
}

/** A required debt minimum BudgetChek cannot place in any paycheck window
 *  because its due date was never entered. Never guessed. */
export interface UnplacedDebt {
  id: string;
  name: string;
  minPayment: number;
}

interface Calculated {
  windowEnd: string;
  balance: number;
  balanceSource: Exclude<BalanceSource, "none">;
  /** Oldest "as of" date behind the balance, or null when none was recorded. */
  balanceAsOf: string | null;
  /** The calculation as a person reads it: Balance, minus what's due, minus
   *  what's set aside, equals the remainder. Sums to `remainder` exactly. */
  footing: FootingRow[];
  keepItems: KeepItem[];
  /** Engine `available - totalRequested`. Negative means short. */
  remainder: number;
  /** The ONE thing to do/know next -- never a list of competing priorities. */
  nextFocus: string;
}

export type PlanStatus =
  | {
      kind: "setup";
      /** Balance is entered inline (it is the control), so it is split out of
       *  `missing`, which stays the engine's own list of link-out gaps. */
      needsBalance: boolean;
      missing: MissingInput[];
    }
  | (Calculated & {
      kind: "incomplete";
      unplaced: UnplacedDebt[];
      unplacedTotal: number;
    })
  | (Calculated & { kind: "shortfall"; short: number })
  | (Calculated & { kind: "healthy"; status: string })
  | (Calculated & { kind: "empty"; status: string });

export interface PlanStatusContext {
  balanceSource: BalanceSource;
  balanceAsOf: string | null;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Oldest non-null date, or null. A balance is only as fresh as its stalest part. */
export function oldestAsOf(dates: (string | null | undefined)[]): string | null {
  const real = dates.filter((d): d is string => !!d).sort();
  return real[0] ?? null;
}

export function derivePlanStatus(
  snap: EngineSnapshot,
  input: EngineInput,
  ctx: PlanStatusContext,
): PlanStatus {
  const needsBalance =
    ctx.balanceSource === "none" || snap.missing.some((m) => m.field === "balance");
  const missing = snap.missing.filter((m) => m.field !== "balance");
  const funding = snap.funding;
  const window = snap.window;

  if (needsBalance || missing.length > 0 || !funding || !window) {
    return { kind: "setup", needsBalance, missing };
  }

  const balance = input.account.currentBalance;
  const reservedHeld = snap.reservedTotal;
  const buffer = input.safeBuffer;
  const requested = funding.totalRequested;

  // The engine floors (balance - reserved - buffer) at $0 before adding
  // certain inflows. Reproduce that as visible rows rather than letting the
  // displayed arithmetic silently stop adding up in the corner cases.
  const base = balance - reservedHeld - buffer;
  const floored = Math.max(0, base);
  const floorAdj = round2(floored - base);
  const inflows = round2(funding.available - floored);

  const unplaced: UnplacedDebt[] = funding.debtsWithUnknownTiming.map((d) => ({
    id: d.id,
    name: d.creditor,
    minPayment: d.minPayment,
  }));

  const footing: FootingRow[] = [{ key: "balance", label: "Balance", amount: balance }];
  if (funding.items.length > 0) {
    footing.push({
      key: "keep",
      // When the plan is incomplete these are only the items BudgetChek can
      // place, and the label says so.
      label: `Keep available for ${funding.items.length}${unplaced.length > 0 ? " known" : ""} item${funding.items.length === 1 ? "" : "s"}`,
      amount: -requested,
    });
  }
  if (reservedHeld > 0) {
    footing.push({ key: "reserved", label: "Held in reserved funds", amount: -reservedHeld });
  }
  if (buffer > 0) footing.push({ key: "buffer", label: "Buffer", amount: -buffer });
  if (floorAdj > 0.004) {
    footing.push({
      key: "floor",
      label:
        balance < 0
          ? "Balance is overdrawn, so available money is counted as $0"
          : "Balance is below what you've set aside, so counted as $0",
      amount: floorAdj,
    });
  }
  if (inflows > 0.004) {
    footing.push({
      key: "inflows",
      label: `Money arriving before ${formatDay(window.end)}`,
      amount: inflows,
    });
  }

  const keepItems: KeepItem[] = funding.items.map((i) => ({
    id: i.id,
    label: i.label,
    amount: i.amount,
    dueDate: i.dueDate,
  }));

  const common = {
    windowEnd: window.end,
    balance,
    balanceSource: ctx.balanceSource as Exclude<BalanceSource, "none">,
    balanceAsOf: ctx.balanceAsOf,
    footing,
    keepItems,
    remainder: round2(funding.available - requested),
  };

  // INCOMPLETE dominates everything else, including a known shortfall: a
  // known shortfall is then only a LOWER BOUND (the unplaced minimums can only
  // add to it), and the UI says so rather than presenting it as the answer.
  if (unplaced.length > 0) {
    return {
      kind: "incomplete",
      ...common,
      unplaced,
      unplacedTotal: round2(unplaced.reduce((s, d) => s + d.minPayment, 0)),
      nextFocus:
        unplaced.length === 1
          ? `Add the due date for ${unplaced[0].name}.`
          : "Add the due date for each payment listed above.",
    };
  }

  if (funding.shortfall > 0.004) {
    return {
      kind: "shortfall",
      ...common,
      short: funding.shortfall,
      // The engine's own sentence already names the cutoff item and tells the
      // person where to start -- a real action, not a status.
      nextFocus: snap.headline,
    };
  }

  if (funding.items.length === 0) {
    return {
      kind: "empty",
      ...common,
      status: `Nothing you've entered is due before ${formatDay(window.end)}. That means nothing you've told us about — not that nothing is coming.`,
      nextFocus: `Your next payday is ${formatDay(window.end)}.`,
    };
  }

  // Complete + covered: ONE next focus, read straight off the plan -- the
  // earliest-due item. No advice about what to do with the remainder.
  const dated = funding.items
    .filter((i) => i.dueDate)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  const next = dated[0] ?? funding.items[0];
  return {
    kind: "healthy",
    ...common,
    status: `Everything you've entered that's due before ${formatDay(window.end)} is covered.`,
    nextFocus: next.dueDate
      ? `${next.label}, ${fmt(next.amount)}, is due ${formatDay(next.dueDate)}.`
      : `${next.label}, ${fmt(next.amount)}, is the next item to cover.`,
  };
}
