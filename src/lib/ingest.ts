// Transaction file ingestion.
//
// Two rules govern this file:
//  1. No fixed schema. The same bank exports different headers month to month,
//     so columns are detected and then shown to the person for correction.
//  2. Nothing is invented. A row without a readable date and amount is dropped
//     and counted, never guessed at.

import { classifyRaw, type PatternClass, type PatternRule } from "./pattern-rules";

export interface RawTable {
  headers: string[];
  rows: string[][];
  /** True when the first line looked like a header rather than data. */
  hadHeader: boolean;
}

export interface ColumnMap {
  date: number;
  description: number;
  /** Single signed amount column. -1 when the file uses debit/credit columns. */
  amount: number;
  debit: number;
  credit: number;
  /** Column naming the direction, e.g. "transaction_type" = Debit/Credit. */
  type: number;
}

export interface IngestTxn {
  date: string;
  description: string;
  /** Signed: negative = money out, positive = money in. */
  amount: number;
  klass: PatternClass;
  /** The rule that classified it, so the person can see and correct the reason. */
  ruleNote: string | null;
  ruleId: string | null;
}

export interface IngestResult {
  txns: IngestTxn[];
  map: ColumnMap;
  headers: string[];
  skipped: number;
  totalRows: number;
}

const DATE_RE = /date|posted|processed|time/i;
const DESC_RE = /desc|name|payee|memo|merchant|detail|reference|narrative/i;
const AMOUNT_RE = /^amount$|amount|value|\bsum\b/i;
const DEBIT_RE = /debit|withdraw|paid out|outflow/i;
const CREDIT_RE = /credit|deposit|paid in|inflow/i;
const TYPE_RE = /type|dr\/cr|debit or credit|direction/i;

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delim && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function detectDelimiter(line: string): string {
  const counts: [string, number][] = [
    [",", (line.match(/,/g) ?? []).length],
    ["\t", (line.match(/\t/g) ?? []).length],
    [";", (line.match(/;/g) ?? []).length],
    ["|", (line.match(/\|/g) ?? []).length],
  ];
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

export function normalizeDate(raw: string): string | null {
  const s = (raw ?? "").trim().replace(/^"|"$/g, "");
  if (!s) return null;
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split("-");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const slash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  }
  const named = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/) ?? s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})/);
  if (named) {
    const parsed = Date.parse(s);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  }
  return null;
}

export function toNumber(raw: string): number | null {
  const s = String(raw ?? "").replace(/[$£€\s]/g, "").replace(/,/g, "");
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.trim().startsWith("-");
  const n = Number(s.replace(/[()\-+]/g, ""));
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** Reads delimited text into a header + rows table without interpreting it. */
export function readTable(text: string): RawTable {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [], hadHeader: false };
  const delim = detectDelimiter(lines[0]);
  const first = splitLine(lines[0], delim);
  // A header row has no readable date and no readable amount in it.
  const looksLikeData = first.some((c) => normalizeDate(c) !== null);
  const hadHeader = !looksLikeData;
  const headers = hadHeader ? first : first.map((_, i) => `Column ${i + 1}`);
  const rows = lines.slice(hadHeader ? 1 : 0).map((l) => splitLine(l, delim));
  return { headers, rows, hadHeader };
}

/** Best-guess column mapping, always overridable by the person. */
export function guessColumns(table: RawTable): ColumnMap {
  const h = table.headers.map((x) => x.toLowerCase());
  const find = (re: RegExp) => h.findIndex((x) => re.test(x));

  let date = find(DATE_RE);
  let description = find(DESC_RE);
  let amount = find(AMOUNT_RE);
  const debit = find(DEBIT_RE);
  const credit = find(CREDIT_RE);
  const type = find(TYPE_RE);

  // Positional fallback for headerless files: find the columns by content.
  if (date < 0) {
    date = table.rows.length
      ? table.rows[0].findIndex((c) => normalizeDate(c) !== null)
      : 0;
  }
  if (amount < 0 && debit < 0 && credit < 0 && table.rows.length) {
    // Last column that parses as a number.
    for (let i = table.rows[0].length - 1; i >= 0; i--) {
      if (i !== date && toNumber(table.rows[0][i]) !== null) {
        amount = i;
        break;
      }
    }
  }
  if (description < 0 && table.rows.length) {
    description = table.rows[0].findIndex(
      (c, i) => i !== date && i !== amount && c.length > 2 && toNumber(c) === null,
    );
  }

  return {
    date: Math.max(date, 0),
    description: description < 0 ? 1 : description,
    amount,
    debit,
    credit,
    type,
  };
}

/** Applies a column map and the pattern rules to produce classified rows. */
export function buildTxns(table: RawTable, map: ColumnMap, userRules: PatternRule[] = []): IngestResult {
  const txns: IngestTxn[] = [];
  let skipped = 0;

  for (const parts of table.rows) {
    const date = normalizeDate(parts[map.date] ?? "");
    if (!date) {
      skipped++;
      continue;
    }
    const description = (parts[map.description] ?? "").slice(0, 200).trim() || "Unlabelled";

    let amount: number | null = null;
    if (map.amount >= 0 && parts[map.amount]) amount = toNumber(parts[map.amount]);
    if (amount === null && map.debit >= 0 && parts[map.debit]) {
      const d = toNumber(parts[map.debit]);
      if (d !== null) amount = -Math.abs(d);
    }
    if (amount === null && map.credit >= 0 && parts[map.credit]) {
      const c = toNumber(parts[map.credit]);
      if (c !== null) amount = Math.abs(c);
    }
    // A separate direction column overrides the sign when present.
    if (amount !== null && map.type >= 0 && parts[map.type]) {
      const t = parts[map.type].toLowerCase();
      if (/debit|withdraw|out/.test(t)) amount = -Math.abs(amount);
      else if (/credit|deposit|in\b/.test(t)) amount = Math.abs(amount);
    }
    if (amount === null || amount === 0) {
      skipped++;
      continue;
    }

    const hit = classifyRaw(description, amount, userRules);
    txns.push({
      date,
      description,
      amount,
      klass: hit?.classify_as ?? "other",
      ruleNote: hit?.rule.note ?? null,
      ruleId: hit?.rule.id ?? null,
    });
  }

  txns.sort((a, b) => a.date.localeCompare(b.date));
  return { txns, map, headers: table.headers, skipped, totalRows: table.rows.length };
}

/** One call for the common path: text in, classified rows out. */
export function ingestText(text: string, userRules: PatternRule[] = []): IngestResult {
  const table = readTable(text);
  return buildTxns(table, guessColumns(table), userRules);
}

/**
 * Reads an .xls/.xlsx workbook into delimited text. The parser is loaded on
 * demand so the spreadsheet code never ships to people pasting a CSV.
 */
export async function readWorkbook(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return "";
  return XLSX.utils.sheet_to_csv(sheet);
}

export async function readAnyFile(file: File): Promise<string> {
  if (/\.xlsx?$/i.test(file.name)) return readWorkbook(file);
  return file.text();
}

// ---------------------------------------------------------------------------
// Reconciliation: diff a new file against what the person already told us.
// ---------------------------------------------------------------------------

export interface RecurringItem {
  key: string;
  label: string;
  typicalAmount: number;
  monthsSeen: number;
  klass: PatternClass;
}

const KEY_STOP = /\b(pos|debit|purchase|payment|recurring|ach|card|xxxx?\d*|\d{3,})\b/g;

export function recurringKey(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(KEY_STOP, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Charges that appear in two or more distinct months. */
export function findRecurring(txns: IngestTxn[], minMonths = 2): RecurringItem[] {
  const map = new Map<string, { months: Set<string>; amounts: number[]; label: string; klass: PatternClass }>();
  for (const t of txns) {
    if (t.amount >= 0) continue;
    const key = recurringKey(t.description);
    if (!key) continue;
    const e = map.get(key) ?? { months: new Set<string>(), amounts: [], label: t.description, klass: t.klass };
    e.months.add(t.date.slice(0, 7));
    e.amounts.push(Math.abs(t.amount));
    map.set(key, e);
  }
  return [...map.entries()]
    .filter(([, e]) => e.months.size >= minMonths)
    .map(([key, e]) => ({
      key,
      label: e.label,
      typicalAmount: median(e.amounts),
      monthsSeen: e.months.size,
      klass: e.klass,
    }))
    .sort((a, b) => b.typicalAmount - a.typicalAmount);
}

export interface ReconcileEntry {
  status: "new" | "changed" | "missing";
  label: string;
  key: string;
  amount: number;
  previousAmount?: number;
  klass: PatternClass;
  sentence: string;
}

/**
 * Compares recurring charges in a new file against the person's saved bills
 * plus the previous file. Neither side is trusted over the other — both are
 * reported so the person decides.
 */
export function reconcile(args: {
  incoming: IngestTxn[];
  previous?: IngestTxn[];
  knownBills: { name: string; amount: number }[];
}): ReconcileEntry[] {
  const { incoming, previous = [], knownBills } = args;
  const now = findRecurring(incoming, 1);
  const before = findRecurring(previous, 1);
  const beforeMap = new Map(before.map((r) => [r.key, r]));
  const billMap = new Map(knownBills.map((b) => [recurringKey(b.name), b]));

  const out: ReconcileEntry[] = [];

  for (const item of now) {
    const prior = beforeMap.get(item.key);
    const bill = billMap.get(item.key);
    const known = prior ?? (bill ? { typicalAmount: Number(bill.amount) } : null);

    if (!known) {
      out.push({
        status: "new",
        label: item.label,
        key: item.key,
        amount: item.typicalAmount,
        klass: item.klass,
        sentence: `New this cycle: ${item.label} at ${money(item.typicalAmount)}, which isn't in your bills. Add it?`,
      });
      continue;
    }
    const diff = item.typicalAmount - known.typicalAmount;
    if (Math.abs(diff) >= Math.max(1, known.typicalAmount * 0.1)) {
      out.push({
        status: "changed",
        label: item.label,
        key: item.key,
        amount: item.typicalAmount,
        previousAmount: known.typicalAmount,
        klass: item.klass,
        sentence: `${item.label} moved from ${money(known.typicalAmount)} to ${money(item.typicalAmount)} — ${diff > 0 ? "up" : "down"} ${money(Math.abs(diff))}.`,
      });
    }
  }

  const nowKeys = new Set(now.map((r) => r.key));
  for (const [key, bill] of billMap) {
    if (!key || nowKeys.has(key)) continue;
    out.push({
      status: "missing",
      label: bill.name,
      key,
      amount: Number(bill.amount),
      klass: "other",
      sentence: `${bill.name} is in your bills at ${money(Number(bill.amount))} but no matching charge appeared in this file. Paid another way, or stopped?`,
    });
  }

  return out;
}

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
