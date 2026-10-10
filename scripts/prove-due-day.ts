// Deterministic, network-free proof of the Option C due-day model (SME/CEO
// ruling, 2026-10-09): debts.due_day is a nullable monthly day-of-month, the
// next occurrence is computed at RUNTIME (never stored), days 29-31 clamp to the
// month's real length, and the resolved ISO date is fed to the EXISTING engine.
//
// What this proves:
//   1. nextOccurrenceOnOrAfter -- a 33-row edge table (leap/century years, month
//      lengths, year rollover, today == due day) plus every null/invalid input.
//   2. A property sweep (every due day 1-31 x every date 2026-2030): the result
//      is never in the past, is this month or next, has the clamped day, and is
//      the EARLIEST such date.
//   3. ordinalDay and parseDueDayInput (what the Debt page form accepts).
//   4. Against the REAL engine (buildEngineInput + computeSnapshot, today
//      2026-10-09, payday 2026-10-16): due 9 / 12 / 16 are placed in the plan;
//      17 and 8 resolve to real dates OUTSIDE the window and are NOT reported as
//      unknown; null / 0 / 32 / a numeric string fail closed into
//      debtsWithUnknownTiming. Only debts with a positive minimum and a positive
//      balance are asserted on -- classification of unknown-minimum or paid-off
//      debts belongs to the classifier work and is deliberately not asserted.
//   5. Parity: the assistant payload's per-debt `due` (assistantDebtContext, the
//      exact function the Money Meeting route calls) equals the engine
//      obligation's dueDate for EVERY debt, null cases included.
//
// Known limits are documented in src/lib/due-day.ts (overdue earlier-this-month
// rolls to next month; debt_payments is ignored; monthly only; one occurrence
// per window). They are pinned here as rows, not hidden.
//
// Run with: npx tsx scripts/prove-due-day.ts

import {
  assistantDebtContext,
  daysInMonth,
  nextOccurrenceOnOrAfter,
  ordinalDay,
  parseDueDayInput,
  resolveDebtDueDate,
} from "../src/lib/due-day";
import { computeSnapshot } from "../src/lib/decision-engine";
import { buildEngineInput } from "../src/lib/mm";
import type { Debt, Profile } from "../src/lib/money";

let pass = 0;
let fail = 0;

function record(name: string, ok: boolean, detail?: string) {
  console.log(ok ? `PASS  ${name}` : `FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  if (ok) pass++;
  else fail++;
}

const TODAY = "2026-10-09";
const PAYDAY = "2026-10-16";
const pad = (n: number, w: number) => String(n).padStart(w, "0");

// ---- 1. edge table ---------------------------------------------------------

const rows: [string, unknown, string, string][] = [
  ["due 15, today is the 15th -> today (inclusive)", 15, "2026-10-15", "2026-10-15"],
  ["due 15, before the 15th", 15, "2026-10-09", "2026-10-15"],
  ["due 15, after the 15th -> next month", 15, "2026-10-16", "2026-11-15"],
  ["due 1, today is the 1st", 1, "2026-10-01", "2026-10-01"],
  ["due 1, Oct 2 -> Nov 1", 1, "2026-10-02", "2026-11-01"],
  ["due 31, Jan 31", 31, "2026-01-31", "2026-01-31"],
  ["due 31, Feb 1 (non-leap) -> Feb 28", 31, "2026-02-01", "2026-02-28"],
  ["due 31, Feb 28 non-leap -> Feb 28 (clamped == today)", 31, "2026-02-28", "2026-02-28"],
  ["due 31, Feb 28 leap 2028 -> Feb 29", 31, "2028-02-28", "2028-02-29"],
  ["due 31, Feb 29 leap -> Feb 29", 31, "2028-02-29", "2028-02-29"],
  ["due 29, Feb 1 leap -> Feb 29", 29, "2028-02-01", "2028-02-29"],
  ["due 29, Feb 1 non-leap -> Feb 28", 29, "2026-02-01", "2026-02-28"],
  ["due 30, Feb 28 non-leap -> Feb 28", 30, "2026-02-28", "2026-02-28"],
  ["due 30, Mar 1 -> Mar 30", 30, "2026-03-01", "2026-03-30"],
  ["due 31, Apr 1 -> Apr 30 (April has 30)", 31, "2026-04-01", "2026-04-30"],
  ["due 31, Apr 30 -> Apr 30", 31, "2026-04-30", "2026-04-30"],
  ["due 31, May 1 -> May 31", 31, "2026-05-01", "2026-05-31"],
  ["due 31, Jun 1 -> Jun 30", 31, "2026-06-01", "2026-06-30"],
  ["due 31, Nov 1 -> Nov 30", 31, "2026-11-01", "2026-11-30"],
  ["due 31, Mar 31 -> Mar 31", 31, "2026-03-31", "2026-03-31"],
  ["due 15, Dec 20 -> Jan 15 next year", 15, "2026-12-20", "2027-01-15"],
  ["due 31, Dec 31 -> Dec 31", 31, "2026-12-31", "2026-12-31"],
  ["due 1, Dec 31 -> Jan 1 next year", 1, "2026-12-31", "2027-01-01"],
  ["due 30, Dec 31 -> Jan 30 next year", 30, "2026-12-31", "2027-01-30"],
  ["due 29, Jan 30 non-leap -> Feb 28", 29, "2027-01-30", "2027-02-28"],
  ["due 29, Jan 30 leap -> Feb 29", 29, "2028-01-30", "2028-02-29"],
  ["due 30, Jan 31 -> Feb 28", 30, "2026-01-31", "2026-02-28"],
  ["due 30, Oct 31 -> Nov 30", 30, "2026-10-31", "2026-11-30"],
  ["century non-leap 2100: due 31, Feb 1 -> Feb 28", 31, "2100-02-01", "2100-02-28"],
  ["400-year leap 2000: due 31, Feb 1 -> Feb 29", 31, "2000-02-01", "2000-02-29"],
  ["pinned today: due 12 -> Oct 12", 12, TODAY, "2026-10-12"],
  ["pinned payday: due 16 -> Oct 16 (== payday)", 16, TODAY, PAYDAY],
  ["known limit: due 8 earlier this month -> Nov 8", 8, TODAY, "2026-11-08"],
];
{
  const bad: string[] = [];
  for (const [name, dd, from, want] of rows) {
    const got = nextOccurrenceOnOrAfter(dd, from);
    if (got !== want) bad.push(`${name}: got ${JSON.stringify(got)} want ${want}`);
  }
  record(
    `EDGE 1: ${rows.length}-row table (month lengths, leap/century years, rollover, today == due)`,
    bad.length === 0,
    bad.join(" | "),
  );
}

// ---- null / invalid inputs ------------------------------------------------

{
  const badDays: unknown[] = [
    0,
    32,
    -1,
    15.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    null,
    undefined,
    "15",
    "",
    true,
    {},
  ];
  const leaked = badDays.filter((dd) => nextOccurrenceOnOrAfter(dd, TODAY) !== null);
  record(
    "NULL 1: an unusable due day (0, 32, -1, 15.5, NaN, Infinity, null, undefined, '15', '', true, {}) resolves to null",
    leaked.length === 0,
    JSON.stringify(leaked),
  );

  const badFrom: unknown[] = [
    "not-a-date",
    "2026-10-09T00:00:00Z",
    "2026-02-30",
    "2026-13-01",
    "2026-00-10",
    "2026-10-00",
    "",
    "2027-02-29",
    "9999-12-20",
    null,
    undefined,
    20261009,
  ];
  const leaked2 = badFrom.filter((f) => nextOccurrenceOnOrAfter(15, f) !== null);
  record(
    "NULL 2: an unusable 'today' (garbage, a datetime, 2026-02-30, month 13, 2027-02-29, year 9999 rollover, non-string) resolves to null",
    leaked2.length === 0,
    JSON.stringify(leaked2),
  );

  record(
    "NULL 3: resolveDebtDueDate is the thin wrapper -- same answers, null due_day -> null",
    resolveDebtDueDate({ due_day: 31 }, "2026-02-01") === "2026-02-28" &&
      resolveDebtDueDate({ due_day: null }, TODAY) === null,
  );
}

// ---- 2. property sweep -----------------------------------------------------

{
  let cases = 0;
  let violations = 0;
  const first: string[] = [];
  const flag = (msg: string) => {
    violations++;
    if (first.length < 3) first.push(msg);
  };
  for (let y = 2026; y <= 2030; y++) {
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= daysInMonth(y, m); d++) {
        const from = `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
        for (let dd = 1; dd <= 31; dd++) {
          cases++;
          const r = nextOccurrenceOnOrAfter(dd, from);
          if (!r || r < from) {
            flag(`${dd} from ${from} -> ${r}`);
            continue;
          }
          const [ry, rm, rd] = r.split("-").map(Number);
          if (rd !== Math.min(dd, daysInMonth(ry, rm)))
            flag(`${dd} from ${from} -> ${r}: day not the clamped due day`);
          const apart = (ry - y) * 12 + (rm - m);
          if (apart < 0 || apart > 1) flag(`${dd} from ${from} -> ${r}: not this month or next`);
          // earliest: only roll to next month when this month's clamped day already passed
          if (apart === 1 && Math.min(dd, daysInMonth(y, m)) >= d)
            flag(`${dd} from ${from} -> ${r}: skipped a valid date this month`);
        }
      }
    }
  }
  record(
    `PROPERTY 1: ${cases} cases (due day 1-31 x every date 2026-2030): never past, this/next month, clamped day, earliest`,
    violations === 0 && cases > 56000,
    `${violations} violations; ${first.join(" | ")}`,
  );
}

// ---- 3. ordinalDay and parseDueDayInput -----------------------------------

{
  const got = [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 29, 30, 31].map(ordinalDay).join(" ");
  record(
    "ORDINAL 1: 1st 2nd 3rd 4th 11th 12th 13th 21st 22nd 23rd 29th 30th 31st",
    got === "1st 2nd 3rd 4th 11th 12th 13th 21st 22nd 23rd 29th 30th 31st",
    got,
  );

  const ok = (s: string, v: number | null) => {
    const r = parseDueDayInput(s);
    return r.ok && r.value === v;
  };
  const rejected = ["0", "32", "1.5", "-3", "1e1", "abc", "031", "00", "100", "٣"].filter(
    (s) => parseDueDayInput(s).ok,
  );
  record(
    "PARSE 1: blank/space -> null; '7', ' 15 ', '31' accepted as numbers",
    ok("", null) && ok("   ", null) && ok("7", 7) && ok(" 15 ", 15) && ok("31", 31) && ok("1", 1),
  );
  record(
    "PARSE 2: 0, 32, 1.5, -3, 1e1, abc, 031, 00, 100 and a non-ASCII digit are all rejected with the message",
    rejected.length === 0 &&
      (() => {
        const r = parseDueDayInput("32");
        return !r.ok && r.error === "Enter a whole number from 1 to 31, or leave it blank.";
      })(),
    JSON.stringify(rejected),
  );
}

// ---- 4. real-engine integration -------------------------------------------

const profile: Profile = {
  id: "u",
  display_name: null,
  monthly_income: null,
  money_goal: null,
  onboarding_completed: true,
  pay_frequency: "weekly",
  next_pay_date: PAYDAY,
  second_pay_date: null,
  income_low_estimate: null,
  cash_on_hand: 1000,
  spending_buffer: 0,
  balance_as_of: TODAY,
  budget_method: "fifty_thirty_twenty",
};

function mkDebt(
  id: string,
  name: string,
  due_day: unknown,
  minimum_payment: number | null = 35,
  extra: Partial<Debt> = {},
): Debt {
  return {
    id,
    user_id: "u",
    name,
    balance: 500,
    apr: 24.99,
    minimum_payment,
    due_day: due_day as number | null,
    archived: false,
    created_at: "2026-01-01T00:00:00Z",
    ...extra,
  };
}

function engineFor(debts: Debt[]) {
  const input = buildEngineInput({
    todayIso: TODAY,
    profile,
    accounts: [],
    reserved: [],
    caps: [],
    expenses: [],
    debts,
    goals: [],
    savedByGoal: new Map(),
    overrides: [],
  });
  const snap = computeSnapshot(input);
  return { input, funding: snap.funding! };
}

function place(due_day: unknown) {
  const { input, funding } = engineFor([mkDebt("d1", "Visa card", due_day)]);
  return {
    dueDate: input.obligations.debts[0].dueDate,
    inPlan: funding.items.some((i) => i.kind === "debt"),
    unknown: funding.debtsWithUnknownTiming.some((u) => u.creditor === "Visa card"),
  };
}

{
  const r = [9, 12, 16].map((dd) => ({ dd, ...place(dd) }));
  record(
    "ENGINE 1: due 9 (today), 12 and 16 (payday, inclusive) are placed in the plan, with the resolved date, not unknown",
    r.every((x) => x.inPlan && !x.unknown) &&
      r[0].dueDate === "2026-10-09" &&
      r[1].dueDate === "2026-10-12" &&
      r[2].dueDate === "2026-10-16",
    JSON.stringify(r),
  );
}
{
  const r = [17, 8].map((dd) => ({ dd, ...place(dd) }));
  record(
    "ENGINE 2: due 17 (a day after payday) and 8 (rolls to Nov 8) are real dates OUTSIDE the window and are NOT in debtsWithUnknownTiming",
    r.every((x) => !x.inPlan && !x.unknown) &&
      r[0].dueDate === "2026-10-17" &&
      r[1].dueDate === "2026-11-08",
    JSON.stringify(r),
  );
}
{
  const r = [null, 0, 32, "15"].map((dd) => ({ dd, ...place(dd) }));
  record(
    "ENGINE 3: due_day null, 0, 32 and the string '15' (positive minimum) resolve to no date and fail closed into debtsWithUnknownTiming",
    r.every((x) => x.dueDate === null && !x.inPlan && x.unknown),
    JSON.stringify(r),
  );
}

// ---- 5. assistant payload parity -------------------------------------------

{
  const debts: Debt[] = [
    mkDebt("a", "Visa card", 12),
    mkDebt("b", "Store card", 31),
    mkDebt("c", "Car loan", 8),
    mkDebt("d", "Medical bill", null),
    mkDebt("e", "Bad data", 32),
    mkDebt("f", "Personal loan", 16, 120),
    mkDebt("g", "Student loan", 1, 60),
  ];
  const { input } = engineFor(debts);
  // Mirror what the Money Meeting route does: the live (non-archived) debts and
  // the engine input's OWN todayIso.
  const payload = assistantDebtContext(
    debts.filter((d) => !d.archived),
    input.todayIso,
  );
  const byName = new Map(input.obligations.debts.map((o) => [o.creditor, o.dueDate]));
  const mismatched = payload
    .filter((p) => byName.get(p.name) !== p.due)
    .map((p) => `${p.name}: payload ${p.due} engine ${byName.get(p.name)}`);
  record(
    "PARITY 1: the assistant payload's per-debt `due` equals the engine obligation dueDate for EVERY debt (dates and nulls)",
    mismatched.length === 0 &&
      payload.length === input.obligations.debts.length &&
      payload.some((p) => p.due !== null) &&
      payload.some((p) => p.due === null),
    mismatched.join(" | "),
  );
  record(
    "PARITY 2: payload rows carry name/balance/apr/minimum unchanged, and a clamped day matches (due 31 in October is Oct 31)",
    payload[0].balance === 500 &&
      payload[0].apr === 24.99 &&
      payload[0].minimum === 35 &&
      payload.find((p) => p.name === "Store card")?.due === "2026-10-31",
  );
}

console.log("");
console.log(`${pass}/${pass + fail} due-day proof cases passed`);

if (fail > 0) {
  console.error(`${fail} due-day proof case(s) FAILED.`);
  process.exit(1);
}
