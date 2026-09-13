import type { Debt } from "@/lib/money";

export interface PayoffPoint {
  monthIndex: number; // 0 = today
  label: string; // "Sep 2026"
  balance: number;
}

export interface DebtPayoff {
  id: string;
  name: string;
  monthsToClear: number;
  label: string;
}

export interface PayoffPlan {
  possible: boolean;
  reason?: string;
  months: number;
  freeDate: Date | null;
  freeLabel: string;
  totalInterest: number;
  monthlyPayment: number;
  series: PayoffPoint[];
  perDebt: DebtPayoff[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function labelFor(from: Date, add: number) {
  const d = new Date(from.getFullYear(), from.getMonth() + add, 1);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Month-by-month simulation. Minimums are paid on every debt; anything left of
 * the monthly total goes to the focus debt chosen by the method. Interest uses
 * each debt's APR divided by 12; a debt with no APR is treated as 0%.
 */
export function buildPayoffPlan(
  debts: Debt[],
  method: "snowball" | "avalanche",
  extraPerMonth = 0,
  from = new Date()
): PayoffPlan {
  const live = debts
    .filter((d) => Number(d.balance) > 0)
    .map((d) => ({
      id: d.id,
      name: d.name,
      balance: Number(d.balance),
      apr: Number(d.apr ?? 0),
      min: Number(d.minimum_payment ?? 0),
    }));

  const startTotal = live.reduce((s, d) => s + d.balance, 0);
  const minTotal = live.reduce((s, d) => s + d.min, 0);
  const monthlyPayment = minTotal + Math.max(0, extraPerMonth);

  const empty: PayoffPlan = {
    possible: false,
    months: 0,
    freeDate: null,
    freeLabel: "",
    totalInterest: 0,
    monthlyPayment,
    series: [],
    perDebt: [],
  };

  if (!live.length) {
    return { ...empty, reason: "no-debts" };
  }
  if (monthlyPayment <= 0) {
    return { ...empty, reason: "no-payment" };
  }

  // Does the payment at least cover the first month of interest?
  const firstInterest = live.reduce((s, d) => s + (d.balance * (d.apr / 100)) / 12, 0);
  if (monthlyPayment <= firstInterest) {
    return { ...empty, reason: "payment-too-small" };
  }

  const series: PayoffPoint[] = [{ monthIndex: 0, label: labelFor(from, 0), balance: startTotal }];
  const perDebt: DebtPayoff[] = [];
  let totalInterest = 0;
  let month = 0;

  while (live.some((d) => d.balance > 0.01) && month < 600) {
    month++;
    // Interest first.
    for (const d of live) {
      if (d.balance <= 0) continue;
      const interest = (d.balance * (d.apr / 100)) / 12;
      d.balance += interest;
      totalInterest += interest;
    }

    let pool = monthlyPayment;
    const open = live.filter((d) => d.balance > 0);

    // Minimums.
    for (const d of open) {
      if (pool <= 0) break;
      const pay = Math.min(d.balance, Math.min(d.min, pool));
      d.balance -= pay;
      pool -= pay;
    }

    // Everything left goes to the focus debt.
    while (pool > 0.01) {
      const remaining = live.filter((d) => d.balance > 0.01);
      if (!remaining.length) break;
      const focus = [...remaining].sort((a, b) =>
        method === "snowball" ? a.balance - b.balance : b.apr - a.apr || a.balance - b.balance
      )[0];
      const pay = Math.min(focus.balance, pool);
      focus.balance -= pay;
      pool -= pay;
    }

    for (const d of live) {
      if (d.balance <= 0.01 && !perDebt.some((p) => p.id === d.id)) {
        perDebt.push({ id: d.id, name: d.name, monthsToClear: month, label: labelFor(from, month) });
      }
    }

    series.push({
      monthIndex: month,
      label: labelFor(from, month),
      balance: Math.max(0, live.reduce((s, d) => s + d.balance, 0)),
    });
  }

  if (live.some((d) => d.balance > 0.01)) {
    return { ...empty, reason: "too-long" };
  }

  const freeDate = new Date(from.getFullYear(), from.getMonth() + month, 1);
  return {
    possible: true,
    months: month,
    freeDate,
    freeLabel: labelFor(from, month),
    totalInterest,
    monthlyPayment,
    series,
    perDebt,
  };
}

export function humanMonths(months: number) {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (!y) return `${m} month${m === 1 ? "" : "s"}`;
  if (!m) return `${y} year${y === 1 ? "" : "s"}`;
  return `${y} year${y === 1 ? "" : "s"}, ${m} month${m === 1 ? "" : "s"}`;
}
