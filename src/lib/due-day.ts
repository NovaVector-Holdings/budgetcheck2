// Monthly debt due day -> the next real calendar date (Option C, SME/CEO ruling
// 2026-10-09). Pure: no Date object, no clock, no I/O, so the same input always
// gives the same answer and the proofs can pin "today".
//
// The person stores only a day of the month (debts.due_day, 1-31, NULL = honestly
// unknown). This module turns that into the ISO date the EXISTING decision engine
// already understands (DebtObligation.dueDate). A one-off date is never stored.
//
// Behaviour, all pinned in scripts/prove-due-day.ts:
//   * on or after today: the due day this month if it has not passed, else next
//     month. Due day == today counts as today (inclusive).
//   * days 29-31 clamp to the month's real length (Feb 28/29, Apr/Jun/Sep/Nov 30).
//     No weekend or holiday shifting.
//   * anything not a whole number 1-31 (null, 0, 32, 15.5, NaN, the string "15"),
//     or an unparseable "today", resolves to null. The engine then lists a debt
//     with a positive minimum as unknown timing, so bad data fails closed.
//
// Known limits (record these anywhere the plan is described):
//   (a) A due day that already passed this month rolls to NEXT month, so an
//       unpaid earlier-this-month minimum drops out of the window without being
//       flagged. We cannot tell paid from unpaid.
//   (b) debt_payments is never read: a minimum already paid this cycle still
//       counts until its due date passes.
//   (c) Monthly only, and one occurrence per window: a window long enough to
//       contain the due day twice counts it once.
//   (d) A minimum due ON the payday counts (the window end is inclusive).
//   (e) The caller supplies "today"; money.ts today() is the UTC date.

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Real length of a month (m is 1-12). */
export function daysInMonth(y: number, m: number): number {
  return m === 2 && isLeap(y) ? 29 : DAYS[m - 1];
}

const pad = (n: number, w: number) => String(n).padStart(w, "0");

function parseIso(iso: unknown): { y: number; m: number; d: number } | null {
  if (typeof iso !== "string") return null;
  const mt = ISO_RE.exec(iso);
  if (!mt) return null;
  const y = Number(mt[1]);
  const m = Number(mt[2]);
  const d = Number(mt[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

/** A usable due day is a real whole number 1-31. A numeric string is NOT one. */
export function isValidDueDay(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 31;
}

/**
 * The earliest date on or after `fromIso` whose day-of-month is `dueDay`
 * (clamped to that month's length), as zero-padded yyyy-mm-dd. Null when either
 * input is unusable.
 */
export function nextOccurrenceOnOrAfter(dueDay: unknown, fromIso: unknown): string | null {
  if (!isValidDueDay(dueDay)) return null;
  const from = parseIso(fromIso);
  if (!from) return null;
  const thisMonth = Math.min(dueDay, daysInMonth(from.y, from.m));
  if (thisMonth >= from.d) return `${pad(from.y, 4)}-${pad(from.m, 2)}-${pad(thisMonth, 2)}`;
  const ny = from.m === 12 ? from.y + 1 : from.y;
  const nm = from.m === 12 ? 1 : from.m + 1;
  if (ny > 9999) return null;
  const nd = Math.min(dueDay, daysInMonth(ny, nm));
  return `${pad(ny, 4)}-${pad(nm, 2)}-${pad(nd, 2)}`;
}

/**
 * The ONE function that turns a debt's stored due day into a date. Both the
 * engine input (mm.ts buildEngineInput) and the assistant payload
 * (assistantDebtContext below) call it with the SAME todayIso, so the assistant
 * can never state a due date the engine did not place -- parity by construction.
 */
export function resolveDebtDueDate(d: { due_day: number | null }, todayIso: string): string | null {
  return nextOccurrenceOnOrAfter(d.due_day, todayIso);
}

/**
 * The per-debt rows the assistant is grounded on. `due` comes from
 * resolveDebtDueDate with the engine's own todayIso (never a fresh clock read).
 * Exported separately from the route so a proof can assert parity without React.
 */
export function assistantDebtContext(
  debts: {
    name: string;
    balance: number | string;
    apr: number | null;
    minimum_payment: number | null;
    due_day: number | null;
  }[],
  todayIso: string,
) {
  return debts.map((d) => ({
    name: d.name,
    balance: Number(d.balance),
    apr: d.apr,
    minimum: d.minimum_payment,
    due: resolveDebtDueDate(d, todayIso),
  }));
}

/** "1st", "2nd", "3rd", "11th", "22nd" ... for display. */
export function ordinalDay(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export type DueDayParse = { ok: true; value: number | null } | { ok: false; error: string };

export const DUE_DAY_ERROR = "Enter a whole number from 1 to 31, or leave it blank.";

/** Form input -> due_day. Blank is "unknown" (null); anything else must be a whole 1-31. */
export function parseDueDayInput(raw: string): DueDayParse {
  const t = raw.trim();
  if (t === "") return { ok: true, value: null };
  if (!/^\d{1,2}$/.test(t)) return { ok: false, error: DUE_DAY_ERROR };
  const n = Number(t);
  if (n < 1 || n > 31) return { ok: false, error: DUE_DAY_ERROR };
  return { ok: true, value: n };
}
