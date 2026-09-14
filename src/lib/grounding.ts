// Technical grounding for Money Meeting's "Ask a question" assistant.
//
// The system prompt TELLS the model not to invent numbers. This module does
// not trust that instruction alone. It independently checks the model's own
// structured answer against the actual financial snapshot and, when
// permitted, against the person's own message — so an invented dollar
// figure, date, or percentage gets caught here even if the prompt is
// ignored, misread, or partially overridden by injected text.
//
// Nothing here calls the model. It is pure, deterministic, and testable on
// its own.

export type FactSource = "snapshot" | "user_hypothetical" | "missing";

export interface UsedFact {
  label: string;
  value: string;
  source: FactSource;
}

export type NextActionType =
  | "concrete_action"
  | "user_decision"
  | "lookup_value"
  | "clarifying_question"
  | "insufficient_data";

/** The contract the model must return instead of free-form prose. */
export interface AskResponseContract {
  answer: string;
  factsUsed: UsedFact[];
  missing: string[];
  nextActionType: NextActionType;
}

export interface GroundingVerdict {
  grounded: boolean;
  /** Internal diagnostic only. Never shown to the user. */
  reason?: string;
  /** The specific number/date/percent token that failed, if any. */
  offendingToken?: string;
}

const EPS = 0.005; // half a cent, to absorb float rounding

// ---------------------------------------------------------------------------
// Flatten the snapshot into comparable primitives
// ---------------------------------------------------------------------------

function walk(value: unknown, onNumber: (n: number) => void, onString: (s: string) => void): void {
  if (value == null) return;
  if (typeof value === "number" && Number.isFinite(value)) {
    onNumber(value);
    return;
  }
  if (typeof value === "string") {
    onString(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) walk(v, onNumber, onString);
    return;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) walk(v, onNumber, onString);
  }
}

function numbersInText(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)) {
    const n = Number.parseFloat(m[0].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function approxHas(set: Set<number>, n: number): boolean {
  for (const v of set) {
    if (Math.abs(v - n) < EPS) return true;
  }
  return false;
}

/** Everything numerically true about the person's actual data, plus every
 *  pairwise +/- combination with a number they just typed themselves — this
 *  is what lets "what if I put an extra $300 toward this" resolve to
 *  balance-300 without opening the door to arbitrary invented arithmetic. */
function buildAllowedAmounts(snapshotNumbers: number[], userNumbers: number[]): Set<number> {
  const allowed = new Set<number>();
  for (const n of snapshotNumbers) allowed.add(round2(n));
  for (const n of userNumbers) allowed.add(round2(n));
  for (const a of snapshotNumbers) {
    for (const b of userNumbers) {
      allowed.add(round2(a + b));
      allowed.add(round2(a - b));
    }
  }
  return allowed;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";

function datesInText(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) found.push(m[0]);
  for (const m of text.matchAll(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g)) found.push(m[0]);
  const monthRe = new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "gi");
  for (const m of text.matchAll(monthRe)) found.push(m[0]);
  return found;
}

/** ISO dates found anywhere in the snapshot, normalized into every textual
 *  form the assistant is allowed to render them in (raw ISO, "March 5"
 *  long-form, "Mar 5" short-form) so a legitimate reference isn't flagged. */
function buildAllowedDateStrings(isoDates: string[]): Set<string> {
  const allowed = new Set<string>();
  for (const iso of isoDates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
    allowed.add(iso);
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const long = dt.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
    const short = dt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    allowed.add(long);
    allowed.add(short);
    // Also allow the bare "5" / "05" day-of-month next to any month name --
    // dates are compared case-insensitively and by substring below.
  }
  return allowed;
}

function dateAllowed(candidate: string, allowedDateStrings: Set<string>): boolean {
  const norm = candidate
    .trim()
    .replace(/(st|nd|rd|th)\b/gi, "")
    .replace(/\.$/, "");
  for (const a of allowedDateStrings) {
    const an = a.replace(/(st|nd|rd|th)\b/gi, "");
    if (an.toLowerCase() === norm.toLowerCase()) return true;
  }
  // ISO / slash forms: compare numerically on month+day (year is frequently
  // omitted by the assistant, e.g. "3/5" for a same-year date).
  const isoMatch = norm.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const slashMatch = norm.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (isoMatch || slashMatch) {
    for (const a of allowedDateStrings) {
      const am = a.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!am) continue;
      if (isoMatch && isoMatch[1] === am[1] && isoMatch[2] === am[2] && isoMatch[3] === am[3])
        return true;
      if (
        slashMatch &&
        Number(slashMatch[1]) === Number(am[2]) &&
        Number(slashMatch[2]) === Number(am[3])
      )
        return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Percentages
// ---------------------------------------------------------------------------

function percentsInText(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/-?\d+(?:\.\d+)?\s?%/g)) {
    out.push(Number.parseFloat(m[0]));
  }
  return out;
}

// ---------------------------------------------------------------------------
// The actual grounding check
// ---------------------------------------------------------------------------

export interface GroundingContext {
  /** The raw JSON string of the snapshot + context sent to the model. */
  snapshotJson: string;
  /** The literal text of the CURRENT user turn (not prior history). */
  currentUserMessage: string;
}

export function checkGrounding(
  response: AskResponseContract,
  ctx: GroundingContext,
): GroundingVerdict {
  let parsedSnapshot: unknown;
  try {
    parsedSnapshot = JSON.parse(ctx.snapshotJson);
  } catch {
    return { grounded: false, reason: "snapshot did not parse as JSON" };
  }

  const snapshotNumbers: number[] = [];
  const snapshotStrings: string[] = [];
  walk(
    parsedSnapshot,
    (n) => snapshotNumbers.push(n),
    (s) => snapshotStrings.push(s),
  );
  const isoDatesInSnapshot = snapshotStrings.filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));

  const userNumbers = numbersInText(ctx.currentUserMessage);
  const allowedAmounts = buildAllowedAmounts(snapshotNumbers, userNumbers);
  const allowedDateStrings = buildAllowedDateStrings(isoDatesInSnapshot);
  const allowedPercents = new Set<number>([
    ...snapshotNumbers.filter((n) => n > 0 && n < 100), // APRs etc. live in this range
    ...percentsInText(ctx.currentUserMessage),
  ]);
  const allowedLabels = new Set(snapshotStrings.map((s) => s.toLowerCase().trim()));

  // 1. Scan the prose answer itself for dollar amounts, percentages, and
  //    dates -- the primary defense, independent of whether the model
  //    bothered to fill out factsUsed honestly.
  for (const raw of response.answer.matchAll(/\$\s?-?\d[\d,]*(?:\.\d{1,2})?/g)) {
    const n = Number.parseFloat(raw[0].replace(/[$,\s]/g, ""));
    if (!approxHas(allowedAmounts, n)) {
      return {
        grounded: false,
        reason: "dollar amount not derivable from snapshot or the user's own message",
        offendingToken: raw[0],
      };
    }
  }

  for (const pct of percentsInText(response.answer)) {
    if (!approxHas(allowedPercents, pct)) {
      return {
        grounded: false,
        reason: "percentage not present in snapshot or the user's own message",
        offendingToken: `${pct}%`,
      };
    }
  }

  for (const dateToken of datesInText(response.answer)) {
    if (!dateAllowed(dateToken, allowedDateStrings)) {
      return { grounded: false, reason: "date not present in snapshot", offendingToken: dateToken };
    }
  }

  // 2. Cross-check the structured factsUsed contract for internal honesty.
  for (const fact of response.factsUsed) {
    if (fact.source === "snapshot") {
      const asNumber = Number.parseFloat(fact.value.replace(/[$,%\s]/g, ""));
      const looksNumeric = fact.value.replace(/[$,%\s]/g, "") !== "" && Number.isFinite(asNumber);
      if (looksNumeric) {
        if (!approxHas(allowedAmounts, asNumber) && !approxHas(allowedPercents, asNumber)) {
          return {
            grounded: false,
            reason: `factsUsed claims "${fact.label}"=${fact.value} from snapshot but that value isn't in it`,
            offendingToken: fact.value,
          };
        }
      } else if (
        !allowedLabels.has(fact.value.toLowerCase().trim()) &&
        !dateAllowed(fact.value, allowedDateStrings)
      ) {
        return {
          grounded: false,
          reason: `factsUsed claims "${fact.label}"=${fact.value} from snapshot but that text isn't in it`,
          offendingToken: fact.value,
        };
      }
    }
    if (fact.source === "user_hypothetical") {
      const asNumber = Number.parseFloat(fact.value.replace(/[$,%\s]/g, ""));
      // Allowed when it's literally what the person typed this turn, OR a
      // derived combination of that figure with a real snapshot number (the
      // whole point of a hypothetical -- "$300 extra" combined with a real
      // $1,200 balance legitimately produces $900, which the person never
      // typed themselves). Anything else is an invented figure wearing a
      // hypothetical label.
      const literal = numbersInText(ctx.currentUserMessage).some(
        (n) => Math.abs(n - asNumber) < EPS,
      );
      const derived = approxHas(allowedAmounts, asNumber) || approxHas(allowedPercents, asNumber);
      if (Number.isFinite(asNumber) && !literal && !derived) {
        return {
          grounded: false,
          reason: `factsUsed claims "${fact.label}"=${fact.value} as a user hypothetical, but that figure can't be tied to anything the user typed this turn`,
          offendingToken: fact.value,
        };
      }
    }
  }

  return { grounded: true };
}

/** What to show instead of an ungrounded answer. Never exposes model or
 *  transport internals -- only names the missing input when the model
 *  actually declared one. */
export function safeFallback(missing: string[]): string {
  if (missing.length > 0) {
    return `I don't have enough information to answer that without guessing. Specifically, I don't have: ${missing.join(", ")}. Add that in Your Numbers and ask again.`;
  }
  return "I don't have enough information to answer that without guessing, and I'd rather say so than make something up. Try asking about a specific bill, balance, or date you've already entered.";
}
