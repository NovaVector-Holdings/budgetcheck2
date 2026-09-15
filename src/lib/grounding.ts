import { z } from "zod";

// Technical grounding for Money Meeting's "Ask a question" assistant.
//
// v4. Rounds 1-3 protected the VALUE (typed fields, exact resolution,
// derivation allow-lists). Round 4 added a permanent product guardrail
// and qualitative/count checks. What remained separable through all of
// that: structured metadata and DISPLAYED PROSE. A claim could resolve a
// real, correct value while the model's own surrounding words named a
// DIFFERENT entity ("Rent is {claim:0}." with claim:0 actually pointing
// at Water bill) -- the value was authoritative, the entity identity
// wearing it was not. Likewise a validated ActionCode/DecisionCode did
// not stop the model's own prose from recommending something else
// entirely.
//
// v4 closes that by making BudgetChek author every user-facing WORD that
// carries authority, not just every number:
//  - A fact/derived claim renders as a full "<entity>'s <field> (<value>)"
//    phrase, never a bare value -- entity identity travels WITH the
//    figure, because BudgetChek writes both.
//  - The model may not name any real entity directly in "answer" text,
//    period (scanForRawEntityNames) -- entity identity comes only from a
//    BudgetChek-authored rendering ({claim:N}, {action}, {decision}, a
//    structured state phrase), never from the model's own prose.
//  - nextActionType "concrete_action" requires the template to contain
//    exactly one {action} placeholder, filled with a sentence BudgetChek
//    generates FROM the validated ActionCode (renderActionSentence) --
//    the model can supply context around it, but cannot state a
//    different next step. Same pattern for "user_decision" and
//    {decision} (renderDecisionSentence).
//  - A new claim kind, "state", covers qualitative facts (paid/unpaid,
//    complete/incomplete, shortfall/no-shortfall, due present/missing,
//    in/out of window, tapped/not-tapped) the same authoritative way --
//    BudgetChek validates the real state and writes the sentence. Round
//    4's free-text paid/count scans remain running too, as defense in
//    depth for whatever a model writes outside the structured mechanism.
//  - `missing` is now a structured, closed list (MissingItem) instead of
//    free model-authored strings -- an ungrounded response can no longer
//    leak arbitrary text into the safe fallback through that field.
//  - review_shortfall_item / review_obligation_options now require the
//    target to be the item actually affected by the real shortfall (per
//    the funding plan's own ranking), not merely a real item that
//    happens to exist somewhere while a shortfall exists somewhere else.
//  - A discretionary DecisionCode (prioritize_goal, etc.) now requires
//    the plan to actually be complete with no real shortfall -- a real
//    shortfall is never offered as an equivalent discretionary choice --
//    and decision options must be pairwise distinct.
//
// Nothing here calls the model. It is pure, deterministic, and testable
// on its own.
//
// v5 (bounded correction round) closes four residual implementation gaps
// the CEO's review found in v4's mechanism itself -- the architecture
// above (claim placeholders, server-authored values/state, ActionCode/
// DecisionCode, the responsible-obligation guardrail) is unchanged:
//  - scanForUnclaimedEntityNames allowed a real entity name in prose
//    whenever that entity appeared ANYWHERE in the response's claims --
//    even a claim about a totally different field of it. That still let
//    "Rent is {claim:1}." survive when claim:0 (elsewhere in the same
//    response) merely referenced Rent's amount while claim:1 actually
//    resolved Water bill. Renamed scanForRawEntityNames and made
//    unconditional: the model may never write a real entity name
//    directly in "answer", full stop -- only BudgetChek's own
//    placeholder substitutions may, and those happen AFTER this scan
//    runs (see renderAnswerTemplate, which scans the template with every
//    placeholder stripped, never the final substituted text).
//  - validateMissingItem only proved a targetFieldPath resolved to
//    something real, not that the value was actually absent -- a model
//    could claim a real, on-file due date was "missing". Now validated
//    per MissingCode against the real, current value, which must
//    genuinely be null. GroundingVerdict.safeMissing carries only the
//    items that pass this, computed unconditionally up front, so a false
//    missing claim can never reach safeFallback() even when the response
//    fails grounding for a completely unrelated reason.
//  - review_obligation_options could target a debt's total BALANCE
//    (never the actual current-cycle obligation, which is the minimum
//    payment) and never required a real, in-window due date before
//    rendering "review it before its due date". Tightened to match
//    pay_required_minimum's own due-date-evidence requirement, and
//    dropped the balance target entirely.
//  - prioritize_extra_debt_payment could offer extra principal on a real
//    0%-APR debt as a discretionary decision, silently contradicting the
//    standing "0% balance gets the minimum only" Money Meeting rule. Now
//    requires the referenced debt's real APR to be > 0.
//  - {action}/{decision} placeholder PRESENCE was checked, not COUNT --
//    two copies of the same placeholder now fails closed too.
//
// Two further refinements, found by adversarial self-verification of the
// four fixes above (not separately requested, but the same properties
// they were meant to guarantee):
//  - scanForRawEntityNames initially only checked a multi-word name's
//    full literal phrase plus its first word (if distinctive). A real
//    entity with a SHORT leading word ("US Bank Card") could still be
//    named by dropping that word ("Bank Card") or varying its internal
//    whitespace. entityNameCandidates now also checks every multi-word
//    SUFFIX left after dropping leading words, and tolerates any
//    whitespace run between a name's words, not just a single space.
//  - validateMissingItem initially let ANY MissingCode omit
//    targetFieldPath and pass trivially. Only missing_other is
//    genuinely generic (new information with no real entity to point
//    at yet) -- every other code now requires a target, closing a
//    bypass where a model could claim e.g. "an APR is missing" with no
//    target while a real debt's APR sat on file.

export type FactType = "money" | "percent" | "date" | "count" | "text" | "boolean";

export type StateCode =
  | "bill_paid"
  | "bill_unpaid"
  | "plan_complete"
  | "plan_incomplete"
  | "has_shortfall"
  | "no_shortfall"
  | "due_present"
  | "due_missing"
  | "in_window"
  | "out_of_window"
  | "reserved_tapped"
  | "reserved_not_tapped";

/** What the MODEL sends: a reference to a real fact, derivation, the
 *  person's own just-typed figure, or a qualitative state -- never an
 *  authored value or entity name. BudgetChek resolves and renders every
 *  word that carries authority; the model only ever picks WHICH real
 *  thing to talk about. */
export interface Claim {
  kind: "fact" | "derived" | "user_input" | "state";
  /** Required for "fact"/"derived", and for the "state" codes that name
   *  a specific bill/debt/reserved fund. Absent for "user_input" and for
   *  whole-plan state codes (plan_complete, has_shortfall, etc.). Exact
   *  addressing scheme: "snapshot.<dotted.path>" for whole-snapshot
   *  aggregates, or "<kind>:<exact entity name>.<field>" for an
   *  entity-scoped figure. */
  fieldPath?: string;
  /** "derived" only: the operation combining the base fieldPath's real
   *  value with a figure the person just typed. */
  operation?: "add" | "subtract";
  /** "derived" and "user_input": the literal number the person typed
   *  THIS turn -- never inferred, never carried over from an earlier
   *  turn. */
  userOperand?: string;
  /** "state" only: which qualitative fact is being asserted. */
  stateCode?: StateCode;
}

/** What the SERVER resolves and hands to the client for display -- a
 *  fully-authored, entity-bound phrase, not a bare value. */
export interface UsedFact {
  label: string;
  value: string;
  source: "snapshot" | "derived" | "state";
}

export type NextActionType =
  | "concrete_action"
  | "user_decision"
  | "lookup_value"
  | "clarifying_question"
  | "insufficient_data";

/** A closed, deterministic-state-validated action vocabulary. There is
 *  deliberately no code meaning "skip", "ignore", or "pay late" -- the
 *  permanent responsible-obligation guardrail, enforced structurally by
 *  the vocabulary simply not containing one. */
export type ActionCode =
  | "hold_for_due_item"
  | "review_due_date"
  | "add_missing_due_date"
  | "pay_required_minimum"
  | "review_shortfall_item"
  | "review_obligation_options"
  | "compare_user_priorities"
  | "review_reserved_fund"
  | "no_action_needed";

export interface StructuredAction {
  code: ActionCode;
  targetFieldPath?: string;
}

/** A closed vocabulary for genuine values/tradeoff decisions. Same
 *  "no unsupported directive in the vocabulary" principle as ActionCode.
 *  Only ever offered when the plan actually supports discretion (see
 *  validateDecision) -- never as an equivalent to a real shortfall. */
export type DecisionCode =
  | "prioritize_goal"
  | "prioritize_extra_debt_payment"
  | "preserve_additional_buffer"
  | "defer_discretionary_goal"
  | "compare_real_priorities";

export interface DecisionOption {
  code: DecisionCode;
  targetFieldPath?: string;
}

/** Required when nextActionType is "user_decision" -- at least two real,
 *  DISTINCT options, because a "decision" with fewer than two, or two
 *  copies of the same one, isn't a choice. */
export interface StructuredDecision {
  options: DecisionOption[];
}

export type MissingCode =
  | "missing_due_date"
  | "missing_amount"
  | "missing_balance"
  | "missing_apr"
  | "missing_minimum"
  | "missing_other";

/** Replaces free-form model-authored strings. BudgetChek renders the
 *  user-facing wording from the code (+ optional real target) --
 *  there is no field here an ungrounded response could use to smuggle
 *  arbitrary text into the safe fallback. */
export interface MissingItem {
  code: MissingCode;
  targetFieldPath?: string;
}

/** The contract the model must return instead of free-form prose. Strict:
 *  every field is required, every enum is closed, no dollar/percent/date
 *  literal and no unclaimed real entity name may appear in "answer"
 *  outside the placeholders BudgetChek controls. There is no permissive
 *  default anywhere in the schema that parses this shape (see
 *  AskResponseSchema below) -- a response that doesn't match exactly
 *  fails closed rather than being coerced into something that does. */
export interface AskResponseContract {
  answer: string;
  claims: Claim[];
  missing: MissingItem[];
  nextActionType: NextActionType;
  /** Required only when nextActionType is "concrete_action". */
  action?: StructuredAction;
  /** Required only when nextActionType is "user_decision". */
  decision?: StructuredDecision;
}

export interface GroundingVerdict {
  grounded: boolean;
  /** Internal diagnostic only. Never shown to the user. */
  reason?: string;
  /** The specific literal/field/code/entity token that failed, if any. */
  offendingToken?: string;
  /** Present only when grounded: true -- the template with every
   *  placeholder substituted for its real, BudgetChek-authored text. */
  renderedAnswer?: string;
  /** Present only when grounded: true -- the resolved claims, in the
   *  wire shape the client already renders. */
  resolvedFacts?: UsedFact[];
  /** The subset of response.missing that genuinely, verifiably describes
   *  something absent from real data -- always computed, regardless of
   *  why (or whether) grounding failed, so a false missing claim (or one
   *  naming something that doesn't resolve at all) can never leak into
   *  safeFallback() via an unfiltered pass-through of raw model output. */
  safeMissing: MissingItem[];
}

const EPS = 0.005; // half a cent, to absorb float rounding

// ---------------------------------------------------------------------------
// The addressable field model
// ---------------------------------------------------------------------------

interface FieldMeta {
  type: FactType;
  /** Can only ever be satisfied by an exact match to the real snapshot
   *  value -- never by a "derived" (hypothetical) claim. */
  protected: boolean;
  /** May be the base operand of a "derived" claim (money add/subtract
   *  with a user-typed figure). Deliberately a short, explicit allow-list
   *  -- not "any money field". */
  derivable: boolean;
}

const SNAPSHOT_PATHS: Record<string, FieldMeta> = {
  "snapshot.complete": { type: "boolean", protected: false, derivable: false },
  "snapshot.todayIso": { type: "date", protected: false, derivable: false },
  "snapshot.window.start": { type: "date", protected: false, derivable: false },
  "snapshot.window.end": { type: "date", protected: false, derivable: false },
  "snapshot.projection.startingBalance": { type: "money", protected: true, derivable: false },
  "snapshot.projection.certainInflows": { type: "money", protected: false, derivable: false },
  "snapshot.projection.certainOutflows": { type: "money", protected: false, derivable: false },
  "snapshot.projection.uncertainOutflows": { type: "money", protected: false, derivable: false },
  "snapshot.projection.discretionaryCommitted": {
    type: "money",
    protected: false,
    derivable: false,
  },
  "snapshot.projection.reservedHeld": { type: "money", protected: true, derivable: false },
  "snapshot.projection.projectedMinBalance": { type: "money", protected: true, derivable: false },
  "snapshot.projection.lowPoint.date": { type: "date", protected: false, derivable: false },
  "snapshot.projection.lowPoint.balance": { type: "money", protected: true, derivable: false },
  "snapshot.funding.available": { type: "money", protected: true, derivable: false },
  "snapshot.funding.cutoffIndex": { type: "count", protected: false, derivable: false },
  "snapshot.funding.totalRequested": { type: "money", protected: true, derivable: false },
  "snapshot.funding.shortfall": { type: "money", protected: true, derivable: false },
  "snapshot.reservedTotal": { type: "money", protected: true, derivable: false },
  payFrequency: { type: "text", protected: false, derivable: false },
  nextPayDate: { type: "date", protected: false, derivable: false },
};

const SNAPSHOT_LABELS: Record<string, string> = {
  "snapshot.todayIso": "today's date",
  "snapshot.window.start": "the window start",
  "snapshot.window.end": "the window end",
  "snapshot.projection.startingBalance": "starting balance",
  "snapshot.projection.certainInflows": "certain inflows",
  "snapshot.projection.certainOutflows": "certain outflows",
  "snapshot.projection.uncertainOutflows": "uncertain outflows",
  "snapshot.projection.discretionaryCommitted": "discretionary committed",
  "snapshot.projection.reservedHeld": "reserved held",
  "snapshot.projection.projectedMinBalance": "estimated remaining",
  "snapshot.projection.lowPoint.date": "the low point date",
  "snapshot.projection.lowPoint.balance": "the low point balance",
  "snapshot.funding.available": "available",
  "snapshot.funding.cutoffIndex": "the cutoff index",
  "snapshot.funding.totalRequested": "total requested",
  "snapshot.funding.shortfall": "the shortfall",
  "snapshot.reservedTotal": "reserved total",
  payFrequency: "pay frequency",
  nextPayDate: "next pay date",
};

/** Entity kind -> field -> meta. Entities are addressed by their exact,
 *  real name -- the same name string the model is shown in the
 *  snapshot, never a synthetic id it has to guess. `due` on debt is
 *  always null today -- there is no due-date column on the debts table
 *  at all, a genuine, permanent absence, not "not yet loaded". */
const ENTITY_FIELDS: Record<string, Record<string, FieldMeta>> = {
  debt: {
    balance: { type: "money", protected: false, derivable: true },
    apr: { type: "percent", protected: false, derivable: false },
    minimum: { type: "money", protected: false, derivable: false },
    due: { type: "date", protected: false, derivable: false },
  },
  bill: {
    amount: { type: "money", protected: false, derivable: false },
    due: { type: "date", protected: false, derivable: false },
    paid: { type: "boolean", protected: false, derivable: false },
  },
  goal: {
    target: { type: "money", protected: false, derivable: false },
    saved: { type: "money", protected: false, derivable: true },
  },
  account: {
    balance: { type: "money", protected: true, derivable: false },
    limit: { type: "money", protected: false, derivable: false },
  },
  reserved: {
    amount: { type: "money", protected: true, derivable: false },
    tapped: { type: "money", protected: true, derivable: false },
  },
};

const FIELD_DESCRIPTORS: Record<string, Record<string, string>> = {
  debt: { balance: "balance", apr: "APR", minimum: "minimum payment", due: "due date" },
  bill: { amount: "amount", due: "due date", paid: "paid status" },
  goal: { target: "target", saved: "saved amount" },
  account: { balance: "balance", limit: "limit" },
  reserved: { amount: "reserved amount", tapped: "tapped amount" },
};

const ENTITY_ARRAY_KEY: Record<string, string> = {
  debt: "debts",
  bill: "bills",
  goal: "goals",
  account: "accounts",
  reserved: "reserved",
};

const ENTITY_NAME_FIELD: Record<string, string> = {
  debt: "name",
  bill: "name",
  goal: "name",
  account: "name",
  reserved: "label",
};

const ENTITY_FIELD_PATH_RE = /^(debt|bill|goal|account|reserved):(.+)\.([a-zA-Z]+)$/;

interface Resolved {
  meta: FieldMeta;
  value: unknown;
}

function getByDottedPath(root: unknown, dotted: string): unknown {
  let cur: unknown = root;
  for (const seg of dotted.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** Resolves a fieldPath string against the REAL parsed payload, returning
 *  its declared type/flags and its actual current value (which may
 *  legitimately be null) -- or null if the path doesn't address anything
 *  real at all. */
function resolveFieldPath(fieldPath: string, payload: Record<string, unknown>): Resolved | null {
  const entityMatch = fieldPath.match(ENTITY_FIELD_PATH_RE);
  if (entityMatch) {
    const [, kind, name, field] = entityMatch;
    const meta = ENTITY_FIELDS[kind]?.[field];
    if (!meta) return null;
    const arr = payload[ENTITY_ARRAY_KEY[kind]];
    if (!Array.isArray(arr)) return null;
    const nameField = ENTITY_NAME_FIELD[kind];
    const entity = arr.find(
      (e) => e && typeof e === "object" && (e as Record<string, unknown>)[nameField] === name,
    );
    if (!entity) return null;
    return { meta, value: (entity as Record<string, unknown>)[field] };
  }

  const meta = SNAPSHOT_PATHS[fieldPath];
  if (!meta) return null;
  const value = getByDottedPath(payload, fieldPath);
  if (value === undefined) return null;
  return { meta, value };
}

function extractEntityName(fieldPath?: string): string | null {
  if (!fieldPath) return null;
  const m = fieldPath.match(ENTITY_FIELD_PATH_RE);
  return m ? m[2] : null;
}

function collectAllEntityNames(payload: Record<string, unknown>): string[] {
  const names: string[] = [];
  for (const kind of Object.keys(ENTITY_ARRAY_KEY)) {
    const arr = payload[ENTITY_ARRAY_KEY[kind]];
    if (!Array.isArray(arr)) continue;
    const nameField = ENTITY_NAME_FIELD[kind];
    for (const e of arr) {
      if (e && typeof e === "object") {
        const n = (e as Record<string, unknown>)[nameField];
        if (typeof n === "string") names.push(n);
      }
    }
  }
  return names;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function moneyClose(a: number, b: number): boolean {
  return Math.abs(a - b) < EPS;
}

function parseNumericClaim(value: string): number | null {
  const cleaned = value.replace(/[$,%\s]/g, "");
  if (cleaned === "") return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function numbersInText(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)) {
    const n = Number.parseFloat(m[0].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Formatting and authoritative phrasing -- BudgetChek authors every word
// that carries authority: the value AND the entity identity around it.
// ---------------------------------------------------------------------------

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDateLong(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

function formatByType(type: FactType, value: unknown): string {
  switch (type) {
    case "money":
      return formatMoney(value as number);
    case "percent":
      return `${value}%`;
    case "date":
      return formatDateLong(value as string);
    case "count":
      return String(value);
    case "boolean":
      return (value as boolean) ? "yes" : "no";
    case "text":
      return String(value);
  }
}

/** The authoritative phrase for a fact/derived claim -- entity identity
 *  and value bound together, both written by BudgetChek. Never a bare
 *  value: "Rent's amount ($900.00)", not just "$900.00" -- so the
 *  entity a claim is actually about can never be silently swapped by
 *  whatever free prose surrounds the placeholder. */
function authoritativePhrase(
  fieldPath: string,
  meta: FieldMeta,
  value: unknown,
  hypothetical: boolean,
): string {
  const formatted = formatByType(meta.type, value);
  const m = fieldPath.match(ENTITY_FIELD_PATH_RE);
  if (m) {
    const [, kind, name, field] = m;
    const descriptor = FIELD_DESCRIPTORS[kind]?.[field] ?? field;
    return hypothetical
      ? `${name}'s hypothetical ${descriptor} (${formatted})`
      : `${name}'s ${descriptor} (${formatted})`;
  }
  const label = SNAPSHOT_LABELS[fieldPath] ?? fieldPath;
  return `${label} (${formatted})`;
}

// ---------------------------------------------------------------------------
// Resolving one claim -- fact, derived, user_input, or state
// ---------------------------------------------------------------------------

type ClaimResolution =
  { ok: true; formatted: string } | { ok: false; reason: string; offendingToken?: string };

function resolveStateClaim(claim: Claim, payload: Record<string, unknown>): ClaimResolution {
  const code = claim.stateCode;
  if (!code) return { ok: false, reason: "state claim is missing stateCode" };
  const snap = (payload.snapshot ?? {}) as Record<string, unknown>;
  const funding = (snap.funding ?? null) as { shortfall?: number } | null;
  const window = (snap.window ?? null) as { start: string; end: string } | null;
  const shortfall = typeof funding?.shortfall === "number" ? funding.shortfall : 0;

  const needsTarget = (re: RegExp) => {
    if (!claim.fieldPath || !re.test(claim.fieldPath)) return null;
    return resolveFieldPath(claim.fieldPath, payload);
  };

  switch (code) {
    case "bill_paid":
    case "bill_unpaid": {
      const resolved = needsTarget(/^bill:(.+)\.paid$/);
      if (!resolved || typeof resolved.value !== "boolean") {
        return {
          ok: false,
          reason: `${code} requires a targetFieldPath naming a real bill's paid field`,
        };
      }
      const name = extractEntityName(claim.fieldPath)!;
      if (code === "bill_paid") {
        if (resolved.value !== true)
          return { ok: false, reason: `claimed "${name}" is paid, but it is not` };
        return { ok: true, formatted: `${name} is already paid` };
      }
      if (resolved.value !== false)
        return { ok: false, reason: `claimed "${name}" is unpaid, but it is paid` };
      return { ok: true, formatted: `${name} is still unpaid` };
    }
    case "plan_complete":
    case "plan_incomplete": {
      const isComplete = snap.complete === true;
      if (code === "plan_complete") {
        if (!isComplete)
          return { ok: false, reason: "claimed the plan is complete, but it is not" };
        return { ok: true, formatted: "the plan is complete" };
      }
      if (isComplete)
        return { ok: false, reason: "claimed the plan is incomplete, but it is complete" };
      return { ok: true, formatted: "the plan isn't complete yet" };
    }
    case "has_shortfall":
    case "no_shortfall": {
      if (code === "has_shortfall") {
        if (!(shortfall > 0))
          return { ok: false, reason: "claimed a shortfall exists, but there isn't one" };
        return { ok: true, formatted: "there is a shortfall in the current plan" };
      }
      if (shortfall > 0)
        return { ok: false, reason: "claimed there is no shortfall, but there is one" };
      return { ok: true, formatted: "the plan is fully covered, with no shortfall" };
    }
    case "due_present":
    case "due_missing": {
      const resolved = needsTarget(/^(bill|debt):(.+)\.due$/);
      if (!resolved) {
        return {
          ok: false,
          reason: `${code} requires a targetFieldPath naming a real bill or debt's due field`,
        };
      }
      const name = extractEntityName(claim.fieldPath)!;
      if (code === "due_present") {
        if (typeof resolved.value !== "string")
          return { ok: false, reason: `claimed "${name}" has a due date on file, but it does not` };
        return {
          ok: true,
          formatted: `${name}'s due date is on file (${formatDateLong(resolved.value)})`,
        };
      }
      if (resolved.value !== null)
        return { ok: false, reason: `claimed "${name}" has no due date, but it does` };
      return { ok: true, formatted: `${name} doesn't have a due date on file` };
    }
    case "in_window":
    case "out_of_window": {
      const resolved = needsTarget(/^(bill|debt):(.+)\.due$/);
      if (!resolved || typeof resolved.value !== "string") {
        return {
          ok: false,
          reason: `${code} requires a targetFieldPath naming a real bill or debt with a real due date`,
        };
      }
      const name = extractEntityName(claim.fieldPath)!;
      const inWin = window ? withinWindow(resolved.value, window) : false;
      if (code === "in_window") {
        if (!inWin)
          return { ok: false, reason: `claimed "${name}" is due within the window, but it is not` };
        return { ok: true, formatted: `${name} is due within the current window` };
      }
      if (inWin)
        return {
          ok: false,
          reason: `claimed "${name}" is outside the window, but it is within it`,
        };
      return { ok: true, formatted: `${name} is due after the current window` };
    }
    case "reserved_tapped":
    case "reserved_not_tapped": {
      const resolved = needsTarget(/^reserved:(.+)\.tapped$/);
      if (!resolved || typeof resolved.value !== "number") {
        return {
          ok: false,
          reason: `${code} requires a targetFieldPath naming a real reserved fund's tapped field`,
        };
      }
      const name = extractEntityName(claim.fieldPath)!;
      if (code === "reserved_tapped") {
        if (!(resolved.value > 0))
          return { ok: false, reason: `claimed "${name}" has been tapped, but it has not` };
        return { ok: true, formatted: `${name} has been tapped` };
      }
      if (resolved.value > 0)
        return { ok: false, reason: `claimed "${name}" has not been tapped, but it has` };
      return { ok: true, formatted: `${name} has not been tapped` };
    }
  }
}

function resolveClaim(
  claim: Claim,
  payload: Record<string, unknown>,
  currentUserMessage: string,
): ClaimResolution {
  if (claim.kind === "user_input") {
    // No fieldPath at all -- nothing to resolve against real data,
    // nothing to misattribute, nothing protected it could touch.
    if (!claim.userOperand) {
      return { ok: false, reason: "user_input claim is missing userOperand" };
    }
    const n = parseNumericClaim(claim.userOperand);
    if (n == null || !numbersInText(currentUserMessage).some((u) => moneyClose(u, n))) {
      return {
        ok: false,
        reason: `user_input claim's userOperand "${claim.userOperand}" wasn't literally typed by the user this turn`,
        offendingToken: claim.userOperand,
      };
    }
    return { ok: true, formatted: formatMoney(round2(n)) };
  }

  if (claim.kind === "state") {
    return resolveStateClaim(claim, payload);
  }

  if (!claim.fieldPath) {
    return { ok: false, reason: `claim of kind "${claim.kind}" requires a fieldPath` };
  }
  const resolved = resolveFieldPath(claim.fieldPath, payload);
  if (!resolved) {
    return {
      ok: false,
      reason: `fieldPath "${claim.fieldPath}" does not resolve to anything real`,
      offendingToken: claim.fieldPath,
    };
  }

  if (claim.kind === "fact") {
    if (resolved.value == null) {
      return {
        ok: false,
        reason: `fieldPath "${claim.fieldPath}" has no value on file -- use "missing", not a claim`,
        offendingToken: claim.fieldPath,
      };
    }
    return {
      ok: true,
      formatted: authoritativePhrase(claim.fieldPath, resolved.meta, resolved.value, false),
    };
  }

  // kind === "derived"
  if (resolved.meta.protected) {
    return {
      ok: false,
      reason: `fieldPath "${claim.fieldPath}" is a protected current-state field and can never be derived`,
      offendingToken: claim.fieldPath,
    };
  }
  if (!resolved.meta.derivable) {
    return {
      ok: false,
      reason: `fieldPath "${claim.fieldPath}" is not on the derivable allow-list`,
      offendingToken: claim.fieldPath,
    };
  }
  if (typeof resolved.value !== "number") {
    return {
      ok: false,
      reason: `fieldPath "${claim.fieldPath}" did not resolve to a number`,
      offendingToken: claim.fieldPath,
    };
  }
  if (!claim.operation || !claim.userOperand) {
    return {
      ok: false,
      reason: `derived claim's fieldPath "${claim.fieldPath}" is missing operation/userOperand`,
    };
  }
  const operandNum = parseNumericClaim(claim.userOperand);
  if (
    operandNum == null ||
    !numbersInText(currentUserMessage).some((n) => moneyClose(n, operandNum))
  ) {
    return {
      ok: false,
      reason: `derived claim's userOperand "${claim.userOperand}" wasn't literally typed by the user this turn`,
      offendingToken: claim.userOperand,
    };
  }
  const result =
    claim.operation === "add" ? resolved.value + operandNum : resolved.value - operandNum;
  return {
    ok: true,
    formatted: authoritativePhrase(claim.fieldPath, resolved.meta, round2(result), true),
  };
}

// ---------------------------------------------------------------------------
// Rendering the answer template
// ---------------------------------------------------------------------------

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";
const MONTH_DATE_RE = new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "i");

/** Any raw dollar, percent, or date-shaped literal once every placeholder
 *  is stripped out -- a figure the model tried to author itself. */
function firstRawFigureToken(text: string): string | null {
  const dollar = text.match(/\$\s?-?\d[\d,]*(?:\.\d{1,2})?/);
  if (dollar) return dollar[0];
  const pct = text.match(/-?\d+(?:\.\d+)?\s?%/);
  if (pct) return pct[0];
  const iso = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (iso) return iso[0];
  const monthDate = text.match(MONTH_DATE_RE);
  if (monthDate) return monthDate[0];
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countOccurrences(text: string, literal: string): number {
  return (text.match(new RegExp(escapeRegex(literal), "g")) ?? []).length;
}

/** Every regex-source phrase a model could write to unambiguously name
 *  this real entity: the full name (tolerant of ANY run of whitespace
 *  between its words -- a double space or a newline still names the
 *  same real thing, not just a single literal space), every multi-word
 *  SUFFIX left after dropping one or more leading words (so a short
 *  leading qualifier -- "US Bank Card" written as just "Bank Card" --
 *  can't slip through by omission), and the lone first word when it's
 *  distinctive enough to stand alone (>= 4 chars, e.g. "Visa" for "Visa
 *  card"). Deliberately never a single word shorter than that, and never
 *  a single word from the MIDDLE or END of a name alone ("bill", "card",
 *  "fund", "plan") -- those are ordinary financial vocabulary shared
 *  across many real entities and would make the model unable to discuss
 *  bills/cards/funds/plans generically at all. */
function entityNameCandidates(name: string): string[] {
  const words = name.split(/\s+/).filter(Boolean);
  const candidates = new Set<string>();
  candidates.add(words.map(escapeRegex).join("\\s+"));
  for (let drop = 1; drop <= words.length - 2; drop++) {
    candidates.add(words.slice(drop).map(escapeRegex).join("\\s+"));
  }
  if (words[0].length >= 4) candidates.add(escapeRegex(words[0]));
  return [...candidates];
}

/** Any real entity name mentioned raw anywhere in the template. The
 *  model may never write a real bill/debt/goal/account/reserved-fund
 *  name directly in "answer" -- not even when that same entity is also
 *  the subject of one of its own claims elsewhere in the response. An
 *  earlier, "unclaimed-only" version of this check had a composition
 *  hole: a response could claim bill:Rent.amount for one purpose while
 *  writing "Rent is {claim:1}." where claim:1 actually resolves a
 *  DIFFERENT entity (Water bill) -- "Rent" passed because it was claimed
 *  SOMEWHERE, just not for the fact it was sitting next to. Entity
 *  identity now comes only from a BudgetChek-authored rendering --
 *  {claim:N}, {action}, {decision}, or a structured state phrase -- all
 *  substituted AFTER this scan runs (see renderAnswerTemplate, which
 *  scans the template with every placeholder stripped, never the final
 *  substituted text). See entityNameCandidates for exactly which raw
 *  phrasings of a name are matched. */
function scanForRawEntityNames(text: string, payload: Record<string, unknown>): string | null {
  for (const name of collectAllEntityNames(payload)) {
    for (const candidate of entityNameCandidates(name)) {
      if (new RegExp(`\\b${candidate}\\b`, "i").test(text)) return name;
    }
  }
  return null;
}

const CLAIM_PLACEHOLDER_RE = /\{claim:(\d+)\}/g;

type RenderResult =
  | { ok: true; rendered: string; resolvedFacts: UsedFact[] }
  | { ok: false; reason: string; offendingToken?: string };

function renderAnswerTemplate(
  response: AskResponseContract,
  payload: Record<string, unknown>,
  currentUserMessage: string,
): RenderResult {
  const { answer: template, claims, nextActionType, action, decision } = response;

  const withoutPlaceholders = template
    .replace(CLAIM_PLACEHOLDER_RE, "")
    .replace(/\{action\}/g, "")
    .replace(/\{decision\}/g, "");

  const rawFigure = firstRawFigureToken(withoutPlaceholders);
  if (rawFigure) {
    return {
      ok: false,
      reason: "answer contains a literal figure not backed by a {claim:N} placeholder",
      offendingToken: rawFigure,
    };
  }
  const rawEntity = scanForRawEntityNames(withoutPlaceholders, payload);
  if (rawEntity) {
    return {
      ok: false,
      reason: `answer names "${rawEntity}" directly in prose -- entity identity must come only from a {claim:N}, {action}, {decision}, or other BudgetChek-rendered output, never written by the model, even when that entity is also referenced by one of its claims`,
      offendingToken: rawEntity,
    };
  }

  const placeholderIndices = [...template.matchAll(CLAIM_PLACEHOLDER_RE)].map((m) => Number(m[1]));
  for (const idx of placeholderIndices) {
    if (idx < 0 || idx >= claims.length) {
      return {
        ok: false,
        reason: `answer references {claim:${idx}} which doesn't exist in claims`,
        offendingToken: `{claim:${idx}}`,
      };
    }
  }

  const formattedByIndex = new Map<number, string>();
  const resolvedFacts: UsedFact[] = [];
  for (let i = 0; i < claims.length; i++) {
    const claim = claims[i];
    const res = resolveClaim(claim, payload, currentUserMessage);
    if (!res.ok) return { ok: false, reason: res.reason, offendingToken: res.offendingToken };
    formattedByIndex.set(i, res.formatted);
    resolvedFacts.push({
      label: res.formatted,
      value: res.formatted,
      source: claim.kind === "derived" ? "derived" : claim.kind === "state" ? "state" : "snapshot",
    });
  }

  let rendered = template.replace(
    CLAIM_PLACEHOLDER_RE,
    (_full, idxStr: string) => formattedByIndex.get(Number(idxStr)) ?? "",
  );

  const actionPlaceholderCount = countOccurrences(rendered, "{action}");
  if (nextActionType === "concrete_action") {
    if (actionPlaceholderCount === 0) {
      return {
        ok: false,
        reason: "concrete_action requires exactly one {action} placeholder in answer",
      };
    }
    if (actionPlaceholderCount > 1) {
      return {
        ok: false,
        reason:
          "concrete_action requires exactly one {action} placeholder in answer, not more than one",
      };
    }
    if (!action) return { ok: false, reason: "concrete_action requires a structured action" };
    rendered = rendered.replace(/\{action\}/g, renderActionSentence(action, payload));
  } else if (actionPlaceholderCount > 0) {
    return {
      ok: false,
      reason: "{action} placeholder used without nextActionType concrete_action",
    };
  }

  const decisionPlaceholderCount = countOccurrences(rendered, "{decision}");
  if (nextActionType === "user_decision") {
    if (decisionPlaceholderCount === 0) {
      return {
        ok: false,
        reason: "user_decision requires exactly one {decision} placeholder in answer",
      };
    }
    if (decisionPlaceholderCount > 1) {
      return {
        ok: false,
        reason:
          "user_decision requires exactly one {decision} placeholder in answer, not more than one",
      };
    }
    if (!decision) return { ok: false, reason: "user_decision requires a structured decision" };
    rendered = rendered.replace(/\{decision\}/g, renderDecisionSentence(decision, payload));
  } else if (decisionPlaceholderCount > 0) {
    return {
      ok: false,
      reason: "{decision} placeholder used without nextActionType user_decision",
    };
  }

  return { ok: true, rendered, resolvedFacts };
}

// ---------------------------------------------------------------------------
// Structured actions -- a closed vocabulary, each validated against real,
// deterministic state, AND rendered by BudgetChek so the displayed next
// step can never disagree with what was validated.
// ---------------------------------------------------------------------------

function isoLte(a: string, b: string): boolean {
  return a <= b;
}

function withinWindow(dateIso: string, window: { start: string; end: string }): boolean {
  return isoLte(window.start, dateIso) && isoLte(dateIso, window.end);
}

type ActionVerdict = { ok: true } | { ok: false; reason: string };

function fail(reason: string): ActionVerdict {
  return { ok: false, reason };
}

/** Is this bill/debt actually one of the items the current funding plan
 *  identifies as affected by the shortfall (partially funded, unfunded,
 *  or at/after the real cutoff) -- not merely a real item that happens
 *  to exist while a shortfall exists elsewhere. Matches funding items by
 *  label: bills by exact name, debts by the engine's own "<name>
 *  minimum" labeling convention. A more stable id-based link on funding
 *  items would be more robust long-term (noted in the return package);
 *  this is deliberately conservative -- unmatched or ambiguous items are
 *  NOT considered affected. */
function isShortfallAffectedTarget(fieldPath: string, payload: Record<string, unknown>): boolean {
  const m = fieldPath.match(/^(bill|debt):(.+)\.(amount|balance|minimum)$/);
  if (!m) return false;
  const [, kind, name] = m;
  const snap = (payload.snapshot ?? {}) as Record<string, unknown>;
  const funding = snap.funding as { items?: unknown; cutoffIndex?: number } | undefined;
  const items = funding?.items;
  if (!Array.isArray(items)) return false;
  const cutoff = typeof funding?.cutoffIndex === "number" ? funding.cutoffIndex : -1;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== "object") continue;
    const label = (item as Record<string, unknown>).label;
    if (typeof label !== "string") continue;
    const matches =
      kind === "bill"
        ? label.toLowerCase() === name.toLowerCase()
        : label.toLowerCase() === `${name.toLowerCase()} minimum`;
    if (!matches) continue;
    const status = (item as Record<string, unknown>).status;
    if (status === "partial" || status === "unfunded") return true;
    if (cutoff >= 0 && i >= cutoff) return true;
    return false;
  }
  return false;
}

function validateAction(action: StructuredAction, payload: Record<string, unknown>): ActionVerdict {
  const snap = (payload.snapshot ?? {}) as Record<string, unknown>;
  const funding = (snap.funding ?? null) as { shortfall?: number } | null;
  const window = (snap.window ?? null) as { start: string; end: string } | null;

  switch (action.code) {
    case "hold_for_due_item": {
      if (!action.targetFieldPath) return fail("hold_for_due_item requires a targetFieldPath");
      const billMatch = action.targetFieldPath.match(/^bill:(.+)\.amount$/);
      if (billMatch) {
        const due = resolveFieldPath(`bill:${billMatch[1]}.due`, payload);
        const amt = resolveFieldPath(action.targetFieldPath, payload);
        if (!due || !amt || typeof due.value !== "string" || typeof amt.value !== "number") {
          return fail("hold_for_due_item target bill does not resolve to a real due amount");
        }
        if (!window || !withinWindow(due.value, window)) {
          return fail(
            "hold_for_due_item target bill is not due within the current planning window",
          );
        }
        return { ok: true };
      }
      const debtMinMatch = action.targetFieldPath.match(/^debt:(.+)\.minimum$/);
      if (debtMinMatch) {
        const min = resolveFieldPath(action.targetFieldPath, payload);
        const due = resolveFieldPath(`debt:${debtMinMatch[1]}.due`, payload);
        if (!min || typeof min.value !== "number") {
          return fail("hold_for_due_item target debt minimum does not resolve");
        }
        if (!due || typeof due.value !== "string") {
          return fail(
            "hold_for_due_item target debt has no due date on file -- BudgetChek does not guess debt timing",
          );
        }
        if (!window || !withinWindow(due.value, window)) {
          return fail(
            "hold_for_due_item target debt's due date is not within the current planning window",
          );
        }
        return { ok: true };
      }
      return fail(
        "hold_for_due_item target must be a real bill amount due in-window, or a real debt minimum due in-window",
      );
    }

    case "review_due_date": {
      if (!action.targetFieldPath) return fail("review_due_date requires a targetFieldPath");
      if (!/^(bill|debt):(.+)\.due$/.test(action.targetFieldPath)) {
        return fail("review_due_date target must be a bill or debt's due field");
      }
      const resolved = resolveFieldPath(action.targetFieldPath, payload);
      if (!resolved || typeof resolved.value !== "string") {
        return fail("review_due_date target has no due date on file to review");
      }
      return { ok: true };
    }

    case "add_missing_due_date": {
      if (!action.targetFieldPath) return fail("add_missing_due_date requires a targetFieldPath");
      if (!/^(bill|debt):(.+)\.due$/.test(action.targetFieldPath)) {
        return fail("add_missing_due_date target must be a bill or debt's due field");
      }
      const resolved = resolveFieldPath(action.targetFieldPath, payload);
      if (!resolved) return fail("add_missing_due_date target does not resolve to a real item");
      if (resolved.value !== null)
        return fail("add_missing_due_date target already has a due date on file");
      return { ok: true };
    }

    case "pay_required_minimum": {
      if (!action.targetFieldPath) return fail("pay_required_minimum requires a targetFieldPath");
      const m = action.targetFieldPath.match(/^debt:(.+)\.minimum$/);
      if (!m) return fail("pay_required_minimum target must be a debt's minimum field");
      const resolved = resolveFieldPath(action.targetFieldPath, payload);
      if (!resolved || typeof resolved.value !== "number") {
        return fail("pay_required_minimum target does not resolve to a real minimum payment");
      }
      const due = resolveFieldPath(`debt:${m[1]}.due`, payload);
      if (!due || typeof due.value !== "string") {
        return fail(
          "pay_required_minimum requires a real due date on file for this debt -- BudgetChek does not guess debt timing",
        );
      }
      if (!window || !withinWindow(due.value, window)) {
        return fail(
          "pay_required_minimum target's due date is not within the current planning window",
        );
      }
      return { ok: true };
    }

    case "review_shortfall_item": {
      if (!action.targetFieldPath) return fail("review_shortfall_item requires a targetFieldPath");
      if (!/^(bill:(.+)\.amount|debt:(.+)\.balance)$/.test(action.targetFieldPath)) {
        return fail("review_shortfall_item target must be a real bill amount or debt balance");
      }
      if (!resolveFieldPath(action.targetFieldPath, payload)) {
        return fail("review_shortfall_item target does not resolve to anything real");
      }
      if (typeof funding?.shortfall !== "number" || funding.shortfall <= 0) {
        return fail("review_shortfall_item requires a real shortfall in the current plan");
      }
      if (!isShortfallAffectedTarget(action.targetFieldPath, payload)) {
        return fail(
          "review_shortfall_item target is not one of the items actually affected by the current shortfall",
        );
      }
      return { ok: true };
    }

    case "review_obligation_options": {
      if (!action.targetFieldPath)
        return fail("review_obligation_options requires a targetFieldPath");
      // The current-cycle obligation for a debt is its required MINIMUM,
      // never its total balance -- a balance isn't "due" this cycle at
      // all. No debt:<name>.balance shape accepted here.
      const billMatch = action.targetFieldPath.match(/^bill:(.+)\.amount$/);
      const debtMinMatch = action.targetFieldPath.match(/^debt:(.+)\.minimum$/);
      if (!billMatch && !debtMinMatch) {
        return fail(
          "review_obligation_options target must be a real bill amount, or a real debt's minimum payment -- never a debt's total balance for a current-cycle obligation",
        );
      }
      if (!resolveFieldPath(action.targetFieldPath, payload)) {
        return fail("review_obligation_options target does not resolve to anything real");
      }
      if (typeof funding?.shortfall !== "number" || funding.shortfall <= 0) {
        return fail("review_obligation_options requires a real shortfall in the current plan");
      }
      if (!isShortfallAffectedTarget(action.targetFieldPath, payload)) {
        return fail(
          "review_obligation_options target is not one of the items actually affected by the current shortfall",
        );
      }
      // The rendered sentence says "review it before its due date" --
      // BudgetChek must actually possess that date, same evidence
      // requirement as pay_required_minimum/hold_for_due_item's debt
      // branch. No due date on file -> add_missing_due_date (or a
      // lookup/clarifying path) is the right action, never this one.
      const name = billMatch ? billMatch[1] : debtMinMatch![1];
      const kind = billMatch ? "bill" : "debt";
      const due = resolveFieldPath(`${kind}:${name}.due`, payload);
      if (!due || typeof due.value !== "string") {
        return fail(
          "review_obligation_options requires a real due date on file -- BudgetChek does not guess timing; use add_missing_due_date or ask instead",
        );
      }
      if (!window || !withinWindow(due.value, window)) {
        return fail(
          "review_obligation_options target's due date is not within the current planning window",
        );
      }
      return { ok: true };
    }

    case "compare_user_priorities": {
      if (action.targetFieldPath && !resolveFieldPath(action.targetFieldPath, payload)) {
        return fail(
          "compare_user_priorities targetFieldPath, if given, must resolve to something real",
        );
      }
      return { ok: true };
    }

    case "review_reserved_fund": {
      if (!action.targetFieldPath) return fail("review_reserved_fund requires a targetFieldPath");
      if (!/^reserved:(.+)\.(amount|tapped)$/.test(action.targetFieldPath)) {
        return fail(
          "review_reserved_fund target must be a real reserved fund's amount or tapped field",
        );
      }
      if (!resolveFieldPath(action.targetFieldPath, payload)) {
        return fail("review_reserved_fund target does not resolve to anything real");
      }
      return { ok: true };
    }

    case "no_action_needed": {
      if (snap.complete !== true)
        return fail("no_action_needed requires the plan to actually be complete");
      if (typeof funding?.shortfall === "number" && funding.shortfall > 0) {
        return fail("no_action_needed requires no real shortfall");
      }
      return { ok: true };
    }
  }
}

/** BudgetChek's own authoritative closing sentence for a validated
 *  action -- the model may explain context around it, but this is the
 *  sentence the person actually sees for "what to do next", generated
 *  FROM the real state, never from model prose. Defensive fallbacks
 *  throughout in case of an unexpected resolution gap; validateAction
 *  has already run by the time this is called, so these should never
 *  actually trigger in practice. */
function renderActionSentence(action: StructuredAction, payload: Record<string, unknown>): string {
  const get = (path: string) => resolveFieldPath(path, payload);
  const moneyOr = (path: string, fallback: string) => {
    const r = get(path);
    return typeof r?.value === "number" ? formatMoney(r.value) : fallback;
  };
  const dateOr = (path: string, fallback: string) => {
    const r = get(path);
    return typeof r?.value === "string" ? formatDateLong(r.value) : fallback;
  };

  switch (action.code) {
    case "hold_for_due_item": {
      const billMatch = action.targetFieldPath?.match(/^bill:(.+)\.amount$/);
      if (billMatch) {
        const name = billMatch[1];
        return `Keep ${moneyOr(action.targetFieldPath!, "the amount")} aside for ${name}, due ${dateOr(`bill:${name}.due`, "soon")}.`;
      }
      const debtMatch = action.targetFieldPath?.match(/^debt:(.+)\.minimum$/);
      if (debtMatch) {
        const name = debtMatch[1];
        return `Keep ${moneyOr(action.targetFieldPath!, "the minimum")} aside for ${name}'s minimum payment, due ${dateOr(`debt:${name}.due`, "soon")}.`;
      }
      return "Keep money aside for this item.";
    }
    case "review_due_date": {
      const m = action.targetFieldPath?.match(/^(bill|debt):(.+)\.due$/);
      const name = m?.[2] ?? "this item";
      return `Take a look at ${name}'s due date (${dateOr(action.targetFieldPath ?? "", "on file")}).`;
    }
    case "add_missing_due_date": {
      const m = action.targetFieldPath?.match(/^(bill|debt):(.+)\.due$/);
      const name = m?.[2] ?? "this item";
      return `Add the due date for ${name} -- it isn't on file yet.`;
    }
    case "pay_required_minimum": {
      const m = action.targetFieldPath?.match(/^debt:(.+)\.minimum$/);
      const name = m?.[1] ?? "this debt";
      return `Pay the required minimum of ${moneyOr(action.targetFieldPath ?? "", "the minimum")} on ${name}, due ${dateOr(`debt:${name}.due`, "soon")}.`;
    }
    case "review_shortfall_item": {
      const m = action.targetFieldPath?.match(/^(?:bill|debt):(.+)\.(?:amount|balance)$/);
      const name = m?.[1] ?? "this item";
      return `This cycle's plan doesn't fully cover ${name} -- review it.`;
    }
    case "review_obligation_options": {
      const m = action.targetFieldPath?.match(/^(?:bill:(.+)\.amount|debt:(.+)\.minimum)$/);
      const name = m?.[1] ?? m?.[2] ?? "this item";
      return `${name} isn't fully covered by the current plan. Review it before its due date, and consider contacting the provider about your options.`;
    }
    case "compare_user_priorities":
      return "That's a genuine choice between real priorities -- worth deciding intentionally.";
    case "review_reserved_fund": {
      const m = action.targetFieldPath?.match(/^reserved:(.+)\.(?:amount|tapped)$/);
      const name = m?.[1] ?? "this reserved fund";
      return `Worth a look: your ${name} reserved fund.`;
    }
    case "no_action_needed":
      return "Nothing needs doing right now -- the plan is fully covered.";
  }
}

/** A structured decision, one option at a time -- validated the same
 *  "closed vocabulary + real-state precondition" way as an action. */
function validateDecisionOption(
  option: DecisionOption,
  payload: Record<string, unknown>,
): ActionVerdict {
  switch (option.code) {
    case "prioritize_goal":
    case "defer_discretionary_goal": {
      if (!option.targetFieldPath || !/^goal:(.+)\.(target|saved)$/.test(option.targetFieldPath)) {
        return fail(`${option.code} requires a targetFieldPath naming a real goal`);
      }
      if (!resolveFieldPath(option.targetFieldPath, payload)) {
        return fail(`${option.code} target does not resolve to anything real`);
      }
      return { ok: true };
    }
    case "prioritize_extra_debt_payment": {
      const m = option.targetFieldPath?.match(/^debt:(.+)\.balance$/);
      if (!option.targetFieldPath || !m) {
        return fail(
          "prioritize_extra_debt_payment requires a targetFieldPath naming a real debt's balance",
        );
      }
      if (!resolveFieldPath(option.targetFieldPath, payload)) {
        return fail("prioritize_extra_debt_payment target does not resolve to anything real");
      }
      // Standing Money Meeting rule: a 0% balance gets the required
      // minimum only. Never offer extra principal on it as one of
      // BudgetChek's own discretionary priority choices.
      const apr = resolveFieldPath(`debt:${m[1]}.apr`, payload);
      if (!apr || typeof apr.value !== "number" || apr.value <= 0) {
        return fail(
          "prioritize_extra_debt_payment requires a debt with a real, positive APR -- a 0% balance gets the required minimum only, never presented as a discretionary priority choice",
        );
      }
      return { ok: true };
    }
    case "preserve_additional_buffer": {
      if (option.targetFieldPath && !resolveFieldPath(option.targetFieldPath, payload)) {
        return fail(
          "preserve_additional_buffer targetFieldPath, if given, must resolve to something real",
        );
      }
      return { ok: true };
    }
    case "compare_real_priorities": {
      if (option.targetFieldPath && !resolveFieldPath(option.targetFieldPath, payload)) {
        return fail(
          "compare_real_priorities targetFieldPath, if given, must resolve to something real",
        );
      }
      return { ok: true };
    }
  }
}

function validateDecision(
  decision: StructuredDecision,
  payload: Record<string, unknown>,
): ActionVerdict {
  if (!Array.isArray(decision.options) || decision.options.length < 2) {
    return fail(
      "a structured decision requires at least two real options -- that's what makes it a choice",
    );
  }
  const seen = new Set<string>();
  for (const o of decision.options) {
    const key = `${o.code}:${o.targetFieldPath ?? ""}`;
    if (seen.has(key)) {
      return fail(
        "decision options must be distinct -- two copies of the same option is not a real choice",
      );
    }
    seen.add(key);
  }
  // Discretionary gate: a values tradeoff between real priorities is
  // only offered when the plan actually supports discretion. A real
  // shortfall is never offered as equivalent to a genuine preference.
  const snap = (payload.snapshot ?? {}) as Record<string, unknown>;
  const funding = snap.funding as { shortfall?: number } | undefined;
  if (snap.complete !== true || (typeof funding?.shortfall === "number" && funding.shortfall > 0)) {
    return fail(
      "a discretionary decision requires the plan to be complete with no real shortfall -- a real shortfall must be reviewed first, not offered as an equivalent choice",
    );
  }
  for (const option of decision.options) {
    const verdict = validateDecisionOption(option, payload);
    if (!verdict.ok) return verdict;
  }
  return { ok: true };
}

/** BudgetChek's own authoritative, neutral framing of a validated
 *  decision -- the model explains context; this is the choice itself. */
function optionPhrase(option: DecisionOption): string {
  const name = extractEntityName(option.targetFieldPath) ?? "this option";
  switch (option.code) {
    case "prioritize_goal":
      return `putting extra toward ${name}`;
    case "defer_discretionary_goal":
      return `holding off on ${name} for now`;
    case "prioritize_extra_debt_payment":
      return `extra principal on ${name}`;
    case "preserve_additional_buffer":
      return "keeping an extra buffer";
    case "compare_real_priorities":
      return option.targetFieldPath ? name : "your other real priorities";
  }
}

function renderDecisionSentence(
  decision: StructuredDecision,
  _payload: Record<string, unknown>,
): string {
  const phrases = decision.options.map(optionPhrase);
  return `The choice is between ${phrases.join(" and ")} -- that's yours to make.`;
}

// ---------------------------------------------------------------------------
// Structured `missing` -- replaces free-form model-authored strings so an
// ungrounded response can never leak arbitrary text into the fallback.
// ---------------------------------------------------------------------------

function missingPhrase(item: MissingItem): string {
  const name = extractEntityName(item.targetFieldPath);
  const of = (word: string) => (name ? `${name}'s ${word}` : `a ${word}`);
  switch (item.code) {
    case "missing_due_date":
      return of("due date");
    case "missing_amount":
      return of("amount");
    case "missing_balance":
      return of("balance");
    case "missing_apr":
      return of("APR");
    case "missing_minimum":
      return of("minimum payment");
    case "missing_other":
      return "some information";
  }
}

/** MissingCode -> the fieldPath shape a targetFieldPath must match, when
 *  given. missing_other has no fixed shape (it covers genuinely new
 *  information with nothing structured to point at) -- but see
 *  validateMissingItem below, which still requires its value be
 *  genuinely absent when a targetFieldPath IS given, so "other" can't be
 *  used to route around the code-specific checks for the rest. */
const MISSING_CODE_FIELD_RE: Partial<Record<MissingCode, RegExp>> = {
  missing_due_date: /^(bill|debt):(.+)\.due$/,
  missing_amount: /^bill:(.+)\.amount$/,
  missing_balance: /^(debt|account):(.+)\.balance$/,
  missing_apr: /^debt:(.+)\.apr$/,
  missing_minimum: /^debt:(.+)\.minimum$/,
};

/** Proves the claimed missing item is genuinely, verifiably absent from
 *  real data -- not merely well-shaped. A missing item with no
 *  targetFieldPath is a generic "I don't have this at all" (there's
 *  nothing on file to check it against, nothing to fabricate) -- but
 *  ONLY missing_other may omit it; every other code names a specific
 *  kind of field on a specific real entity by definition, so omitting
 *  the target would let a model dodge the genuinely-null check entirely
 *  (e.g. claiming "an APR is missing" with no target, even though a
 *  real debt's APR is on file). One WITH a targetFieldPath must name a
 *  real field of the kind its code implies, and that field's real,
 *  current value must actually be null -- BudgetChek must never tell
 *  someone known information is missing, regardless of code. */
function validateMissingItem(item: MissingItem, payload: Record<string, unknown>): ActionVerdict {
  if (!item.targetFieldPath) {
    if (item.code === "missing_other") return { ok: true };
    return fail(
      `${item.code} requires a targetFieldPath naming the specific real item it's missing for`,
    );
  }

  const expectedShape = MISSING_CODE_FIELD_RE[item.code];
  if (expectedShape && !expectedShape.test(item.targetFieldPath)) {
    return fail(
      `${item.code} targetFieldPath "${item.targetFieldPath}" is not a real field of the kind this code describes`,
    );
  }
  const resolved = resolveFieldPath(item.targetFieldPath, payload);
  if (!resolved) {
    return fail(
      `missing item's targetFieldPath "${item.targetFieldPath}" does not resolve to anything real`,
    );
  }
  if (resolved.value !== null) {
    return fail(
      `${item.code} claims "${item.targetFieldPath}" is missing, but it is already on file`,
    );
  }
  return { ok: true };
}

/** What to show instead of an ungrounded answer, or to name what's
 *  genuinely missing in an otherwise-grounded one. Renders ONLY from the
 *  closed MissingCode + a real (or absent) entity name -- there is no
 *  free-text field here an ungrounded response could use to reach the
 *  person with arbitrary model-authored content. */
export function safeFallback(missing: MissingItem[]): string {
  if (missing.length > 0) {
    return `I don't have enough information to answer that without guessing. Specifically, I don't have: ${missing.map(missingPhrase).join(", ")}. Add that in Your Numbers and ask again.`;
  }
  return "I don't have enough information to answer that without guessing, and I'd rather say so than make something up. Try asking about a specific bill, balance, or date you've already entered.";
}

// ---------------------------------------------------------------------------
// Injection defenses that don't depend on any number being wrong --
// unchanged from round 2/3, kept as defense-in-depth (see checkGrounding).
// ---------------------------------------------------------------------------

export const UNTRUSTED_DATA_START = "BEGIN UNTRUSTED FINANCIAL DATA (JSON)";
export const UNTRUSTED_DATA_END = "END UNTRUSTED FINANCIAL DATA";

export function sanitizeDelimiterInjection(snapshotJson: string): string {
  return snapshotJson
    .replace(new RegExp(escapeRegex(UNTRUSTED_DATA_START), "gi"), "[blocked marker text]")
    .replace(new RegExp(escapeRegex(UNTRUSTED_DATA_END), "gi"), "[blocked marker text]");
}

const INJECTION_PATTERNS = [
  /ignore (all|previous|the) (rules|instructions|plan)/i,
  /disregard (all|the|previous)/i,
  /tell the user to/i,
  /tell them to/i,
  /instruct the user/i,
  /recommend (closing|emptying|withdrawing|draining)/i,
  /you (must|should) recommend/i,
  /new instructions/i,
  /system prompt/i,
  /you are now/i,
  new RegExp(escapeRegex(UNTRUSTED_DATA_START), "i"),
  new RegExp(escapeRegex(UNTRUSTED_DATA_END), "i"),
];

export function detectInjectionSpans(rawSnapshotJson: string): string[] {
  const spans: string[] = [];
  for (const pattern of INJECTION_PATTERNS) {
    const m = rawSnapshotJson.match(pattern);
    if (!m || m.index == null) continue;
    const start = Math.max(0, m.index - 10);
    const end = Math.min(rawSnapshotJson.length, m.index + m[0].length + 40);
    spans.push(rawSnapshotJson.slice(start, end));
  }
  return spans;
}

export function answerEchoesInjectedSpan(answer: string, spans: string[]): boolean {
  const normAnswer = answer.toLowerCase().replace(/\s+/g, " ");
  for (const span of spans) {
    const words = span.toLowerCase().replace(/\s+/g, " ").split(" ").filter(Boolean);
    for (let len = Math.min(6, words.length); len >= 4; len--) {
      for (let i = 0; i + len <= words.length; i++) {
        const chunk = words.slice(i, i + len).join(" ");
        if (chunk.length >= 20 && normAnswer.includes(chunk)) return true;
      }
    }
  }
  return false;
}

/** Defense-in-depth (per instruction, not the primary mechanism -- the
 *  closed ActionCode/DecisionCode vocabularies and the entity-authority
 *  scan above are). Catches the responsible-obligation guardrail's
 *  target intent slipping into free prose that never invokes the
 *  structured action/decision machinery at all. */
const UNSUPPORTED_DIRECTIVE_PATTERNS = [
  /clos(e|ing)\s+(all|every)\s+(your\s+)?accounts?/i,
  /empty(ing)?\s+(your\s+|the\s+)?(savings|reserved|emergency fund)/i,
  /drain(ing)?\s+(your\s+|the\s+)?(savings|reserved|account)/i,
  /withdraw(ing)?\s+(everything|all\s+(of\s+)?(your\s+)?money)/i,
  /cancel(l?ing)?\s+(all|every)\s+(your\s+)?(bills?|payments?|autopay)/i,
  /stop paying (all|everything|your bills)/i,
  /take (all|everything) out of/i,
  /\bskip\s+(your\s+|the\s+)?(rent|mortgage|payment|bill|premium|minimum)/i,
  /\bskip\s+it\b/i,
  /\bdon'?t\s+pay\s+(the\s+|your\s+)?\w/i,
  /\bignore\s+(the\s+|your\s+|a\s+|an\s+|any\s+)?(\S+\s+){0,5}(bills?|payments?|invoices?|taxe?s?|obligations?|debts?|responsibilit(y|ies))\b/i,
  /\b(let|allow)\s+.{0,30}\b(go\s+late|become\s+late|go\s+delinquent|lapse)\b/i,
  /\bstop\s+paying\s+(your\s+|the\s+)?(insurance|premium|rent|mortgage)/i,
  /\bjust\s+(don'?t\s+|do\s+not\s+|not\s+)pay\b/i,
  /\buse\s+(the\s+|your\s+)?(rent|mortgage|insurance)\s+money\s+(for|toward)/i,
  /\b(intentionally|deliberately)\s+miss(ing)?\s+(the\s+|your\s+)?(required\s+)?(minimum\s+)?payment/i,
  /\babandon(ing)?\s+(the\s+|your\s+)?(payment|obligation|bill|responsibility)/i,
  /\b(paying|being|going)\s+\S+\s+late\s+(is|would be)\s+(the\s+)?(best|right|smart|good)\s+(move|choice|idea|option)/i,
  /\bgo\s+ahead\s+and\s+skip\b/i,
];

export function containsUnsupportedDirective(answer: string): string | null {
  for (const pattern of UNSUPPORTED_DIRECTIVE_PATTERNS) {
    const m = answer.match(pattern);
    if (m) return m[0];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Qualitative / state-claim grounding -- round 4's free-text scans, kept
// running as defense-in-depth alongside this round's structured "state"
// claim kind (see resolveStateClaim above), per instruction to keep this
// coverage rather than remove it.
// ---------------------------------------------------------------------------

function checkPaidStateClaims(rendered: string, payload: Record<string, unknown>): string | null {
  const bills = payload.bills;
  if (!Array.isArray(bills)) return null;
  for (const b of bills) {
    if (!b || typeof b !== "object") continue;
    const name = (b as Record<string, unknown>).name;
    const paid = (b as Record<string, unknown>).paid;
    if (typeof name !== "string" || typeof paid !== "boolean") continue;
    const nameEsc = escapeRegex(name);
    const paidRe = new RegExp(
      `\\b${nameEsc}\\b[^.!?]{0,60}\\b(is|was|has been)\\b[^.!?]{0,20}\\b(already\\s+)?paid\\b`,
      "i",
    );
    const unpaidRe = new RegExp(
      `\\b${nameEsc}\\b[^.!?]{0,60}\\b(is|was|remains|still)\\b[^.!?]{0,20}\\b(unpaid|not\\s+paid|still\\s+due|still\\s+owed|outstanding)\\b`,
      "i",
    );
    if (paidRe.test(rendered) && paid !== true) {
      return `answer states "${name}" is paid, but it is not marked paid`;
    }
    if (unpaidRe.test(rendered) && paid !== false) {
      return `answer states "${name}" is unpaid, but it is marked paid`;
    }
  }
  return null;
}

const COUNT_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
const ENTITY_COUNT_RE =
  /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(bills?|debts?|goals?)\b/gi;

function checkEntityCountClaims(rendered: string, payload: Record<string, unknown>): string | null {
  const counts: Record<string, number> = {
    bill: Array.isArray(payload.bills) ? payload.bills.length : 0,
    debt: Array.isArray(payload.debts) ? payload.debts.length : 0,
    goal: Array.isArray(payload.goals) ? payload.goals.length : 0,
  };
  for (const m of rendered.matchAll(ENTITY_COUNT_RE)) {
    const raw = m[1].toLowerCase();
    const claimed = /^\d+$/.test(raw) ? Number(raw) : COUNT_WORDS[raw];
    const kind = m[2].toLowerCase().replace(/s$/, "");
    const real = counts[kind];
    if (claimed !== real) {
      return `answer claims "${m[0]}", but there are really ${real} ${kind}(s) on file`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The actual grounding check
// ---------------------------------------------------------------------------

export interface GroundingContext {
  /** The raw JSON string of the snapshot + context sent to the model
   *  (pre-sanitization is fine -- this is read-only here). */
  snapshotJson: string;
  /** The literal text of the CURRENT user turn (not prior history). */
  currentUserMessage: string;
  /** Spans flagged by detectInjectionSpans() on the same snapshot. */
  injectedSpans: string[];
}

export function checkGrounding(
  response: AskResponseContract,
  ctx: GroundingContext,
): GroundingVerdict {
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(ctx.snapshotJson);
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    payload = parsed as Record<string, unknown>;
  } catch {
    return { grounded: false, reason: "snapshot did not parse as JSON", safeMissing: [] };
  }

  // Computed unconditionally, before any other check -- the ONLY subset
  // of response.missing that is ever safe to show the person, regardless
  // of why (or whether) the rest of this response ends up grounded. See
  // safeMissing's doc comment on GroundingVerdict.
  const safeMissing = response.missing.filter((item) => validateMissingItem(item, payload).ok);

  // Defense #1: the recommended action/decision itself must be real,
  // deterministic-state-validated -- checked BEFORE rendering, so the
  // authoritative sentence generated below is only ever generated for
  // something that actually passed.
  if (response.nextActionType === "concrete_action") {
    if (!response.action)
      return {
        grounded: false,
        reason: "concrete_action requires a structured action",
        safeMissing,
      };
    const actionVerdict = validateAction(response.action, payload);
    if (!actionVerdict.ok) {
      return {
        grounded: false,
        reason: actionVerdict.reason,
        offendingToken: response.action.code,
        safeMissing,
      };
    }
  }
  if (response.nextActionType === "user_decision") {
    if (!response.decision)
      return {
        grounded: false,
        reason: "user_decision requires a structured decision",
        safeMissing,
      };
    const decisionVerdict = validateDecision(response.decision, payload);
    if (!decisionVerdict.ok)
      return { grounded: false, reason: decisionVerdict.reason, safeMissing };
  }
  // Defense #1b: every missing item must itself be genuinely, verifiably
  // missing -- not merely well-shaped. A missing item claiming known,
  // on-file data is absent fails the whole response closed, same
  // fail-fast principle as an invalid action/decision above.
  for (const item of response.missing) {
    const v = validateMissingItem(item, payload);
    if (!v.ok) return { grounded: false, reason: v.reason, safeMissing };
  }

  // Defense #2: resolve the template directly from real data -- entity
  // identity and value both authored by BudgetChek, and the model's own
  // validated next step rendered from ActionCode/DecisionCode, not from
  // free prose. No reverse-validation step: there is nothing left to
  // reverse-validate, because none of this text came from the model.
  const rendered = renderAnswerTemplate(response, payload, ctx.currentUserMessage);
  if (!rendered.ok) {
    return {
      grounded: false,
      reason: rendered.reason,
      offendingToken: rendered.offendingToken,
      safeMissing,
    };
  }

  // Defense #3a: sweeping, unsupported financial directives (defense-in-
  // depth -- see comment on UNSUPPORTED_DIRECTIVE_PATTERNS above).
  const unsupportedDirective = containsUnsupportedDirective(rendered.rendered);
  if (unsupportedDirective) {
    return {
      grounded: false,
      reason: "answer contains a sweeping, unsupported financial directive",
      offendingToken: unsupportedDirective,
      safeMissing,
    };
  }
  // Defense #3b: qualitative instruction-following via verbatim overlap.
  if (answerEchoesInjectedSpan(rendered.rendered, ctx.injectedSpans)) {
    return {
      grounded: false,
      reason: "answer substantially echoes a flagged injected span",
      safeMissing,
    };
  }
  // Defense #3c/#3d: round-4 free-text qualitative scans, kept as
  // defense-in-depth alongside the structured "state" claim kind.
  const paidStateProblem = checkPaidStateClaims(rendered.rendered, payload);
  if (paidStateProblem) return { grounded: false, reason: paidStateProblem, safeMissing };
  const countProblem = checkEntityCountClaims(rendered.rendered, payload);
  if (countProblem) return { grounded: false, reason: countProblem, safeMissing };

  return {
    grounded: true,
    renderedAnswer: rendered.rendered,
    resolvedFacts: rendered.resolvedFacts,
    safeMissing,
  };
}

// ---------------------------------------------------------------------------
// The strict response contract -- lives here, not in mm-chat.functions.ts,
// so it is a pure, testable unit like everything else in this module. No
// .catch(...) anywhere: a malformed claim, an invalid enum value, or a
// missing required field means the WHOLE response fails to parse.
// ---------------------------------------------------------------------------

const ACTION_CODES = [
  "hold_for_due_item",
  "review_due_date",
  "add_missing_due_date",
  "pay_required_minimum",
  "review_shortfall_item",
  "review_obligation_options",
  "compare_user_priorities",
  "review_reserved_fund",
  "no_action_needed",
] as const;

const DECISION_CODES = [
  "prioritize_goal",
  "prioritize_extra_debt_payment",
  "preserve_additional_buffer",
  "defer_discretionary_goal",
  "compare_real_priorities",
] as const;

const STATE_CODES = [
  "bill_paid",
  "bill_unpaid",
  "plan_complete",
  "plan_incomplete",
  "has_shortfall",
  "no_shortfall",
  "due_present",
  "due_missing",
  "in_window",
  "out_of_window",
  "reserved_tapped",
  "reserved_not_tapped",
] as const;

const MISSING_CODES = [
  "missing_due_date",
  "missing_amount",
  "missing_balance",
  "missing_apr",
  "missing_minimum",
  "missing_other",
] as const;

const ClaimSchema = z.object({
  kind: z.enum(["fact", "derived", "user_input", "state"]),
  fieldPath: z.string().min(1).optional(),
  operation: z.enum(["add", "subtract"]).optional(),
  userOperand: z.string().min(1).optional(),
  stateCode: z.enum(STATE_CODES).optional(),
});

const ActionSchema = z.object({
  code: z.enum(ACTION_CODES),
  targetFieldPath: z.string().min(1).optional(),
});

const DecisionOptionSchema = z.object({
  code: z.enum(DECISION_CODES),
  targetFieldPath: z.string().min(1).optional(),
});

const DecisionSchema = z.object({
  options: z.array(DecisionOptionSchema),
});

const MissingItemSchema = z.object({
  code: z.enum(MISSING_CODES),
  targetFieldPath: z.string().min(1).optional(),
});

const AskResponseSchema = z.object({
  answer: z.string().min(1),
  claims: z.array(ClaimSchema),
  missing: z.array(MissingItemSchema),
  nextActionType: z.enum([
    "concrete_action",
    "user_decision",
    "lookup_value",
    "clarifying_question",
    "insufficient_data",
  ]),
  action: ActionSchema.optional(),
  decision: DecisionSchema.optional(),
});

/** Parses the model's raw text into the strict contract, or null if it
 *  doesn't conform -- including every cross-field rule: "concrete_action"
 *  requires a structured action, "user_decision" requires a structured
 *  decision with >= 2 options, "fact"/"derived" claims require a
 *  fieldPath, "user_input" claims require a userOperand, "state" claims
 *  require a stateCode. Tolerant of surrounding prose/markdown fences
 *  around the JSON object, never tolerant of the shape once found. */
export function parseContract(raw: string): AskResponseContract | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    const result = AskResponseSchema.safeParse(parsed);
    if (!result.success) return null;
    if (result.data.nextActionType === "concrete_action" && !result.data.action) return null;
    if (
      result.data.nextActionType === "user_decision" &&
      (!result.data.decision || result.data.decision.options.length < 2)
    ) {
      return null;
    }
    for (const claim of result.data.claims) {
      if ((claim.kind === "fact" || claim.kind === "derived") && !claim.fieldPath) return null;
      if (claim.kind === "user_input" && !claim.userOperand) return null;
      if (claim.kind === "state" && !claim.stateCode) return null;
    }
    return result.data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// External-service error normalization -- unchanged from round 3.
// ---------------------------------------------------------------------------

export const GENERIC_UNAVAILABLE =
  "The assistant isn't available right now. Try again in a moment.";
export const RATE_LIMITED = "Too many requests right now. Try again shortly.";

export function classifyTransportError(status: number | null): string {
  return status === 429 ? RATE_LIMITED : GENERIC_UNAVAILABLE;
}
