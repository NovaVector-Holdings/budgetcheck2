import { categorize } from "@/lib/money";

export interface Txn {
  date: string;
  description: string;
  /** Signed: negative = money out, positive = money in. */
  amount: number;
  category: string;
}

export interface MonthRow {
  month: string; // YYYY-MM
  label: string; // "Jan 2026"
  income: number;
  spend: number;
  net: number;
}

export interface CategoryRow {
  category: string;
  total: number;
  share: number; // 0..1 of spend
}

export type FlagTone = "win" | "watch" | "check";

export interface Flag {
  tone: FlagTone;
  title: string;
  body: string;
  amount?: number;
}

export interface StatementReview {
  txnCount: number;
  start: string;
  end: string;
  income: number;
  spend: number;
  net: number;
  months: MonthRow[];
  categories: CategoryRow[];
  transfersTotal: number;
  feesTotal: number;
  biggest: Txn[];
  flags: Flag[];
}

const TRANSFER_RE = /venmo|zelle|cash app|cashapp|apple cash|paypal|transfer|wire|withdraw/i;
const FEE_RE = /overdraft|\bnsf\b|insufficient funds|late fee|service (charge|fee)|maintenance fee|returned item/i;

/** Split a CSV line, respecting simple double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur.trim()); cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function normalizeDate(raw: string): string | null {
  const s = raw.trim().replace(/^"|"$/g, "");
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

function toNumber(raw: string): number | null {
  const s = raw.replace(/[$\s]/g, "").replace(/,/g, "");
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  const n = Number(s.replace(/[()\-+]/g, ""));
  if (Number.isNaN(n)) return null;
  return neg ? -n : n;
}

/**
 * Parses common bank CSV shapes. Supports a single signed amount column, or
 * separate debit/credit columns. Money out is negative in the result.
 */
export function parseStatement(text: string): Txn[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = header.some((h) => /date/.test(h));
  const idx = (re: RegExp) => header.findIndex((h) => re.test(h));
  const dateI = hasHeader ? Math.max(idx(/date/), 0) : 0;
  const descI = hasHeader ? Math.max(idx(/desc|name|payee|memo|merchant/), 1) : 1;
  const amtI = hasHeader ? idx(/amount|value/) : 2;
  const debitI = hasHeader ? idx(/debit|withdraw/) : -1;
  const creditI = hasHeader ? idx(/credit|deposit/) : -1;

  const rows: Txn[] = [];
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const parts = splitCsvLine(line);
    if (parts.length < 2) continue;
    const date = normalizeDate(parts[dateI] ?? "");
    if (!date) continue;
    const description = (parts[descI] ?? "").slice(0, 160) || "Unlabeled";

    let amount: number | null = null;
    if (amtI >= 0 && parts[amtI] !== undefined && parts[amtI] !== "") {
      amount = toNumber(parts[amtI]);
    }
    if (amount === null && debitI >= 0 && parts[debitI]) {
      const d = toNumber(parts[debitI]);
      if (d !== null) amount = -Math.abs(d);
    }
    if (amount === null && creditI >= 0 && parts[creditI]) {
      const c = toNumber(parts[creditI]);
      if (c !== null) amount = Math.abs(c);
    }
    if (amount === null || amount === 0) continue;

    rows.push({ date, description, amount, category: categorize(description) });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (m: string) => `${MONTH_NAMES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Builds the review purely from the rows given — no outside assumptions. */
export function reviewStatement(txns: Txn[]): StatementReview {
  const spendTxns = txns.filter((t) => t.amount < 0);
  const income = txns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const spend = spendTxns.reduce((s, t) => s + Math.abs(t.amount), 0);

  const monthMap = new Map<string, MonthRow>();
  for (const t of txns) {
    const key = t.date.slice(0, 7);
    const row = monthMap.get(key) ?? { month: key, label: monthLabel(key), income: 0, spend: 0, net: 0 };
    if (t.amount > 0) row.income += t.amount;
    else row.spend += Math.abs(t.amount);
    row.net = row.income - row.spend;
    monthMap.set(key, row);
  }
  const months = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  const catMap = new Map<string, number>();
  for (const t of spendTxns) catMap.set(t.category, (catMap.get(t.category) ?? 0) + Math.abs(t.amount));
  const categories: CategoryRow[] = [...catMap.entries()]
    .map(([category, total]) => ({ category, total, share: spend ? total / spend : 0 }))
    .sort((a, b) => b.total - a.total);

  const transfers = spendTxns.filter((t) => TRANSFER_RE.test(t.description));
  const transfersTotal = transfers.reduce((s, t) => s + Math.abs(t.amount), 0);
  const fees = spendTxns.filter((t) => FEE_RE.test(t.description));
  const feesTotal = fees.reduce((s, t) => s + Math.abs(t.amount), 0);

  const biggest = [...spendTxns].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 5);

  const med = median(spendTxns.map((t) => Math.abs(t.amount)));
  const outliers = spendTxns.filter((t) => med > 0 && Math.abs(t.amount) > med * 6);

  // Repeat charges: same first word appearing in 3+ different months.
  const repeatMap = new Map<string, { months: Set<string>; total: number; label: string }>();
  for (const t of spendTxns) {
    const key = t.description.toLowerCase().replace(/[^a-z ]/g, "").split(/\s+/).slice(0, 2).join(" ");
    if (!key) continue;
    const e = repeatMap.get(key) ?? { months: new Set<string>(), total: 0, label: t.description };
    e.months.add(t.date.slice(0, 7));
    e.total += Math.abs(t.amount);
    repeatMap.set(key, e);
  }
  const repeats = [...repeatMap.values()].filter((r) => r.months.size >= 3).sort((a, b) => b.total - a.total);

  const flags: Flag[] = [];
  const net = income - spend;

  if (net >= 0) {
    flags.push({
      tone: "win",
      title: "You brought in more than you spent",
      body: `Across these ${txns.length} rows, money in beat money out. That gap is what savings and debt payoff are built from — keep it.`,
      amount: net,
    });
  } else {
    flags.push({
      tone: "watch",
      title: "Spending ran ahead of income here",
      body: "This is a starting point, not a verdict — the categories below show where to find the gap. Closing part of it counts as a win.",
      amount: Math.abs(net),
    });
  }

  const bestMonth = months.filter((m) => m.net > 0).sort((a, b) => b.net - a.net)[0];
  if (bestMonth && months.length > 1) {
    flags.push({
      tone: "win",
      title: `${bestMonth.label} was your strongest month`,
      body: "Worth asking what was different that month — that answer is usually repeatable.",
      amount: bestMonth.net,
    });
  }

  if (feesTotal > 0) {
    flags.push({
      tone: "check",
      title: "Bank fees showed up",
      body: `${fees.length} row${fees.length === 1 ? "" : "s"} looked like an overdraft, late, or service fee. Fees are the easiest money to win back — most banks will reverse a first one if you ask.`,
      amount: feesTotal,
    });
  } else {
    flags.push({
      tone: "win",
      title: "No fee charges found",
      body: "Nothing in these rows looked like an overdraft or late fee. That's real money kept.",
    });
  }

  if (transfersTotal > 0) {
    flags.push({
      tone: "watch",
      title: "Transfers with no clear purpose",
      body: `${transfers.length} row${transfers.length === 1 ? "" : "s"} looked like a transfer or cash app payment. These hide inside a budget because they have no category. Giving each one a name is the fastest way to see the truth.`,
      amount: transfersTotal,
    });
  }

  if (outliers.length) {
    flags.push({
      tone: "check",
      title: "A few charges were much larger than usual",
      body: `${outliers.length} charge${outliers.length === 1 ? "" : "s"} came in far above your typical amount, starting with ${outliers[0].description}. Confirm each one was expected before planning around this month.`,
      amount: outliers.reduce((s, t) => s + Math.abs(t.amount), 0),
    });
  }

  if (repeats.length) {
    flags.push({
      tone: "check",
      title: "Charges that repeat every month",
      body: `${repeats.length} name${repeats.length === 1 ? "" : "s"} appeared in three or more months — likely subscriptions or fixed bills, starting with ${repeats[0].label}. Add them under Bills so they stop being a surprise.`,
      amount: repeats.reduce((s, r) => s + r.total, 0),
    });
  }

  if (income === 0) {
    flags.push({
      tone: "check",
      title: "No deposits found in this file",
      body: "Only money going out was detected, so the totals show spending only. Export a range that includes your pay to see the full picture.",
    });
  }

  return {
    txnCount: txns.length,
    start: txns[0]?.date ?? "",
    end: txns[txns.length - 1]?.date ?? "",
    income,
    spend,
    net,
    months,
    categories,
    transfersTotal,
    feesTotal,
    biggest,
    flags,
  };
}
