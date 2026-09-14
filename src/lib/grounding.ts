import { z } from "zod";

// Technical grounding for Money Meeting's "Ask a question" assistant.
//
// v3. v1/v2 let the model author the final dollar/percent/date STRING in
// its prose, then reverse-validated that string against the real data --
// first against one flat number set, then (v2) against typed-but-global
// sets. That still allowed ENTITY MISATTRIBUTION: a real value that
// exists somewhere in the snapshot could be attached to the wrong bill,
// debt, or field ("your rent is $205" when $205 is actually the car
// loan). Checking "does this number exist somewhere real" can never
// catch "does this number belong to the specific thing being discussed."
//
// v3 removes the model's authority to write a dollar/percent/date STRING
// at all. "answer" is a TEMPLATE containing {claim:N} placeholders only;
// every actual figure is supplied by BudgetChek, resolved directly from
// the exact field path the model named in "claims". There is no reverse
// validation step, because there is nothing left to reverse-validate --
// the value never came from the model in the first place. A raw dollar,
// percent, or date literal anywhere in the template outside a
// placeholder fails the whole response closed.
//
// This closes the misattribution gap specifically: BudgetChek resolves
// claim:0's fieldPath directly and inserts whatever is REALLY there. The
// remaining honesty gap is a model that mislabels its own claim (fieldPath
// pointing at the car loan while its own "label" metadata says "Rent") --
// caught by requiring a claim's self-reported label to be consistent with
// the entity its own fieldPath names.
//
// Recommended actions are likewise now a closed, deterministic-state-
// validated vocabulary (ActionCode) instead of an arbitrary target +
// free-form recommendation -- a real target no longer makes an arbitrary
// recommendation valid; the ACTION ITSELF must be one the underlying
// engine's rules actually support, checked against real state.
//
// Nothing here calls the model. It is pure, deterministic, and testable
// on its own.

export type FactType = "money" | "percent" | "date" | "count" | "text" | "boolean";

/** What the MODEL sends: a reference to a real fact, never an authored
 *  value. "label" is cosmetic/self-descriptive only -- it drives nothing
 *  on its own except the one honesty check described above (it must be
 *  consistent with the entity its OWN fieldPath addresses).
 *
 *  "user_input" exists so the model can restate a figure the person just
 *  typed themselves (e.g. the "$300" in "what if I put an extra $300
 *  toward this debt") WITHOUT writing it as a raw literal -- it carries
 *  no fieldPath at all, so there is nothing to misattribute and nothing
 *  protected it could ever touch. Deliberately NOT a blanket "any number
 *  the model claims the user said is trusted": it is independently
 *  checked against the actual current message text, same as a derived
 *  claim's operand. */
export interface Claim {
  label: string;
  kind: "fact" | "derived" | "user_input";
  /** Required for "fact" and "derived". Absent for "user_input" -- there
   *  is no real field being addressed, only the person's own just-typed
   *  figure. Exact addressing scheme: "snapshot.<dotted.path>" for
   *  whole-snapshot aggregates (e.g. "snapshot.funding.available"), or
   *  "<kind>:<exact entity name>.<field>" for an entity-scoped figure
   *  (e.g. "debt:Credit card.balance", "bill:Electric bill.amount"). */
  fieldPath?: string;
  /** "derived" only: the operation combining the base fieldPath's real
   *  value with a figure the person just typed. */
  operation?: "add" | "subtract";
  /** "derived" and "user_input": the literal number the person typed
   *  THIS turn -- never inferred, never carried over from an earlier
   *  turn. For "derived" it's the operand combined with the base
   *  fieldPath; for "user_input" it's the whole of what's being cited. */
  userOperand?: string;
}

/** What the SERVER resolves and hands to the client for display -- the
 *  wire shape stays what the round-2 UI already renders, so the "Show
 *  what this used" panel needed no changes. */
export interface UsedFact {
  label: string;
  value: string;
  source: "snapshot" | "derived";
}

export type NextActionType =
  | "concrete_action"
  | "user_decision"
  | "lookup_value"
  | "clarifying_question"
  | "insufficient_data";

/** A closed, deterministic-state-validated action vocabulary. The model
 *  may only ever recommend one of these -- it explains a validated
 *  action, it does not invent one. A real, resolvable targetFieldPath is
 *  necessary for most codes but never sufficient on its own; each code's
 *  own real-state precondition (see validateAction) is what actually
 *  gates it. There is deliberately no code meaning "skip", "ignore", or
 *  "pay late" -- that is the permanent responsible-obligation guardrail,
 *  enforced structurally by the vocabulary simply not containing one. */
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

/** A closed vocabulary for genuine values/tradeoff decisions -- the same
 *  "no unsupported directive in the vocabulary" principle as ActionCode,
 *  applied to nextActionType "user_decision". Before this round,
 *  "user_decision" carried no structure at all and was a real bypass:
 *  an unsupported recommendation ("skip rent, put it toward the Visa")
 *  became valid merely by being labeled a decision instead of an action.
 *  There is deliberately no code for skipping, ignoring, or deferring a
 *  real obligation -- a genuine preference belongs to the person, but it
 *  is always a choice BETWEEN things BudgetChek actually supports, never
 *  a directive to not meet a known responsibility. */
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

/** Required when nextActionType is "user_decision" -- at least two real
 *  options, because a "decision" with fewer than two isn't a choice. */
export interface StructuredDecision {
  options: DecisionOption[];
}

/** The contract the model must return instead of free-form prose. Strict:
 *  every field is required, every enum is closed, no dollar/percent/date
 *  literal may appear in "answer" outside a {claim:N} placeholder. There
 *  is no permissive default anywhere in the schema that parses this shape
 *  (see AskResponseSchema below) -- a response that doesn't match exactly
 *  fails closed rather than being coerced into something that does. */
export interface AskResponseContract {
  answer: string;
  claims: Claim[];
  missing: string[];
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
  /** The specific literal/field/code token that failed, if any. */
  offendingToken?: string;
  /** Present only when grounded: true -- the template with every
   *  {claim:N} substituted for its real, resolved, formatted value. */
  renderedAnswer?: string;
  /** Present only when grounded: true -- the resolved claims, in the
   *  wire shape the client already renders. */
  resolvedFacts?: UsedFact[];
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
   *  -- not "any money field" -- because the realistic hypothetical
   *  shapes this product supports are "extra payment toward a debt" and
   *  "extra contribution toward a goal", nothing broader. */
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

/** Entity kind -> field -> meta. Entities are addressed by their exact,
 *  real name (e.g. "debt:Credit card.balance") -- the same name string the
 *  model is shown in the snapshot, never a synthetic id it has to guess.
 *  `due` on debt is new this round: debts have no due-date COLUMN at all
 *  in the current schema, so it is always sent as null -- a real,
 *  permanently-missing field, which is exactly what makes
 *  "add_missing_due_date" meaningfully checkable against a real debt
 *  today. Filling it in is a separate, not-yet-built product capability. */
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

/** Resolves a fieldPath string against the REAL parsed payload
 *  ({snapshot, accounts, reserved, caps, bills, debts, goals,
 *  payFrequency, nextPayDate}), returning its declared type/flags and its
 *  actual current value (which may legitimately be null, e.g. a debt's
 *  permanently-absent due date) -- or null if the path doesn't address
 *  anything real at all. This is the only source of truth; nothing is
 *  inferred from the shape of a claimed value, because claims never
 *  carry a value to infer from. */
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

/** The one honesty check a direct-resolution model can't structurally
 *  rule out: a claim whose OWN label disagrees with the entity its OWN
 *  fieldPath names (fieldPath -> the car loan, label -> "Rent amount").
 *  Snapshot-level (non-entity) paths have no cross-entity ambiguity, so
 *  this only applies to entity-scoped paths. */
function labelConsistentWithFieldPath(label: string, fieldPath: string): boolean {
  const m = fieldPath.match(ENTITY_FIELD_PATH_RE);
  if (!m) return true;
  const entityName = m[2];
  return label.toLowerCase().includes(entityName.toLowerCase());
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
// Formatting -- BudgetChek authors every figure the person sees; the
// model only ever names which real field to format.
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

// ---------------------------------------------------------------------------
// Resolving one claim into its real, formatted value
// ---------------------------------------------------------------------------

type ClaimResolution =
  { ok: true; formatted: string } | { ok: false; reason: string; offendingToken?: string };

function resolveClaim(
  claim: Claim,
  payload: Record<string, unknown>,
  currentUserMessage: string,
): ClaimResolution {
  if (claim.kind === "user_input") {
    // No fieldPath at all -- nothing to resolve against real data,
    // nothing to misattribute, nothing protected it could touch. The
    // only thing to check is that the person actually typed this exact
    // figure themselves, this turn.
    if (!claim.userOperand) {
      return {
        ok: false,
        reason: `user_input claim "${claim.label}" is missing userOperand`,
        offendingToken: claim.label,
      };
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

  if (!claim.fieldPath) {
    return {
      ok: false,
      reason: `claim "${claim.label}" of kind "${claim.kind}" requires a fieldPath`,
      offendingToken: claim.label,
    };
  }
  const resolved = resolveFieldPath(claim.fieldPath, payload);
  if (!resolved) {
    return {
      ok: false,
      reason: `fieldPath "${claim.fieldPath}" does not resolve to anything real`,
      offendingToken: claim.fieldPath,
    };
  }
  if (!labelConsistentWithFieldPath(claim.label, claim.fieldPath)) {
    return {
      ok: false,
      reason: `claim labeled "${claim.label}" points its fieldPath at a different real entity ("${claim.fieldPath}") -- possible misattribution`,
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
    return { ok: true, formatted: formatByType(resolved.meta.type, resolved.value) };
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
      reason: `derived claim "${claim.label}" is missing operation/userOperand`,
      offendingToken: claim.label,
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
  return { ok: true, formatted: formatMoney(round2(result)) };
}

// ---------------------------------------------------------------------------
// Rendering the answer template
// ---------------------------------------------------------------------------

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";
const MONTH_DATE_RE = new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "i");

/** Any raw dollar, percent, or date-shaped literal in the template, once
 *  every {claim:N} placeholder is stripped out -- i.e. a figure the model
 *  tried to author itself instead of referencing a claim. */
function firstRawFigureToken(templateWithoutPlaceholders: string): string | null {
  const dollar = templateWithoutPlaceholders.match(/\$\s?-?\d[\d,]*(?:\.\d{1,2})?/);
  if (dollar) return dollar[0];
  const pct = templateWithoutPlaceholders.match(/-?\d+(?:\.\d+)?\s?%/);
  if (pct) return pct[0];
  const iso = templateWithoutPlaceholders.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (iso) return iso[0];
  const monthDate = templateWithoutPlaceholders.match(MONTH_DATE_RE);
  if (monthDate) return monthDate[0];
  return null;
}

const CLAIM_PLACEHOLDER_RE = /\{claim:(\d+)\}/g;

type RenderResult =
  | { ok: true; rendered: string; resolvedFacts: UsedFact[] }
  | { ok: false; reason: string; offendingToken?: string };

function renderAnswerTemplate(
  template: string,
  claims: Claim[],
  payload: Record<string, unknown>,
  currentUserMessage: string,
): RenderResult {
  const stripped = template.replace(CLAIM_PLACEHOLDER_RE, "");
  const rawFigure = firstRawFigureToken(stripped);
  if (rawFigure) {
    return {
      ok: false,
      reason: "answer contains a literal figure not backed by a {claim:N} placeholder",
      offendingToken: rawFigure,
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
      label: claim.label,
      value: res.formatted,
      source: claim.kind === "derived" ? "derived" : "snapshot",
    });
  }

  const rendered = template.replace(
    CLAIM_PLACEHOLDER_RE,
    (_full, idxStr: string) => formattedByIndex.get(Number(idxStr)) ?? "",
  );
  return { ok: true, rendered, resolvedFacts };
}

// ---------------------------------------------------------------------------
// Structured actions -- a closed vocabulary, each validated against real,
// deterministic state. A real target does not make an arbitrary
// recommendation valid; the ACTION CODE ITSELF must be one the
// underlying engine's rules actually support.
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
        // A known minimum amount does not prove it's due before the next
        // paycheck -- BudgetChek does not guess debt timing. Require a
        // real, in-window due date, same standard as a bill.
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
      if (!m) {
        return fail("pay_required_minimum target must be a debt's minimum field");
      }
      const resolved = resolveFieldPath(action.targetFieldPath, payload);
      if (!resolved || typeof resolved.value !== "number") {
        return fail("pay_required_minimum target does not resolve to a real minimum payment");
      }
      // A known minimum amount does not prove it's due before the next
      // paycheck -- BudgetChek does not guess debt timing.
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
      const resolved = resolveFieldPath(action.targetFieldPath, payload);
      if (!resolved) return fail("review_shortfall_item target does not resolve to anything real");
      if (typeof funding?.shortfall !== "number" || funding.shortfall <= 0) {
        return fail("review_shortfall_item requires a real shortfall in the current plan");
      }
      return { ok: true };
    }

    case "review_obligation_options": {
      // "BudgetChek has identified a real obligation that cannot
      // currently be covered and is directing the user to review it
      // before the due date" -- never "skip it". Same real-shortfall
      // precondition as review_shortfall_item; a distinct code so the
      // system prompt can teach the "review before due date, consider
      // contacting the provider" framing specifically, without implying
      // nonpayment is ever the supported resolution.
      if (!action.targetFieldPath)
        return fail("review_obligation_options requires a targetFieldPath");
      if (
        !/^(bill:(.+)\.amount|debt:(.+)\.balance|debt:(.+)\.minimum)$/.test(action.targetFieldPath)
      ) {
        return fail(
          "review_obligation_options target must be a real bill amount or debt balance/minimum",
        );
      }
      const resolved = resolveFieldPath(action.targetFieldPath, payload);
      if (!resolved)
        return fail("review_obligation_options target does not resolve to anything real");
      if (typeof funding?.shortfall !== "number" || funding.shortfall <= 0) {
        return fail("review_obligation_options requires a real shortfall in the current plan");
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

/** A structured decision, one option at a time. Each option must
 *  reference a real entity where the code needs one, and be valid
 *  against real state -- the same "closed vocabulary + real-state
 *  precondition" standard as validateAction, applied to genuine
 *  preference/tradeoff decisions rather than directives. There is no
 *  code here that means "don't pay" anything -- that's the point. */
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
      if (!option.targetFieldPath || !/^debt:(.+)\.balance$/.test(option.targetFieldPath)) {
        return fail(
          "prioritize_extra_debt_payment requires a targetFieldPath naming a real debt's balance",
        );
      }
      if (!resolveFieldPath(option.targetFieldPath, payload)) {
        return fail("prioritize_extra_debt_payment target does not resolve to anything real");
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
  for (const option of decision.options) {
    const verdict = validateDecisionOption(option, payload);
    if (!verdict.ok) return verdict;
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Injection defenses that don't depend on any number being wrong --
// unchanged from round 2, kept as defense-in-depth (see checkGrounding).
// ---------------------------------------------------------------------------

export const UNTRUSTED_DATA_START = "BEGIN UNTRUSTED FINANCIAL DATA (JSON)";
export const UNTRUSTED_DATA_END = "END UNTRUSTED FINANCIAL DATA";

/** Neutralizes a literal occurrence of the real delimiter markers inside
 *  user-entered text, so nothing typed into a bill/account/goal name can
 *  ever be mistaken by the prompt structure for an actual boundary --
 *  applied to the snapshot JSON before it's ever wrapped in the real
 *  markers. Deterministic, testable, and independent of model behavior. */
export function sanitizeDelimiterInjection(snapshotJson: string): string {
  return snapshotJson
    .replace(new RegExp(escapeRegex(UNTRUSTED_DATA_START), "gi"), "[blocked marker text]")
    .replace(new RegExp(escapeRegex(UNTRUSTED_DATA_END), "gi"), "[blocked marker text]");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Phrase shapes that show up in "make the assistant say/do something"
 *  attacks that don't require any invented number -- an injected label
 *  telling the model to recommend closing accounts, or containing the
 *  literal delimiter text, has no wrong dollar figure to catch. This scans
 *  the untrusted snapshot text ONCE, server-side, before the model ever
 *  sees it, and returns the flagged spans (with surrounding context) so
 *  the model's eventual answer can be checked for verbatim overlap. */
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

/** True if the model's answer substantially reproduces a flagged span --
 *  a correctly-behaving model never needs to quote injected text at
 *  length; it names that a label looked suspicious without repeating it
 *  (see the system prompt). Any real overlap means the injected text made
 *  it into the answer one way or another. */
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

/** A second, independent line of defense for the SAME class of attack --
 *  an injected instruction the model complies with in its OWN words,
 *  paraphrased rather than quoted, would slip past answerEchoesInjectedSpan
 *  (verbatim overlap only). This scans the OUTPUT itself for sweeping,
 *  absolute financial directives ("close ALL your accounts", "empty your
 *  savings") that the deterministic engine's own rules never produce --
 *  kept as defense-in-depth per this round's instruction, NOT as the
 *  primary action-safety mechanism (that's validateAction() above, which
 *  gates the structured action against real state; this only screens the
 *  free-form "answer" prose alongside it). Deliberately scoped to
 *  SWEEPING language ("all", "every", "everything") so an ordinary answer
 *  about a single named account or bill is never caught by it. */
const UNSUPPORTED_DIRECTIVE_PATTERNS = [
  /clos(e|ing)\s+(all|every)\s+(your\s+)?accounts?/i,
  /empty(ing)?\s+(your\s+|the\s+)?(savings|reserved|emergency fund)/i,
  /drain(ing)?\s+(your\s+|the\s+)?(savings|reserved|account)/i,
  /withdraw(ing)?\s+(everything|all\s+(of\s+)?(your\s+)?money)/i,
  /cancel(l?ing)?\s+(all|every)\s+(your\s+)?(bills?|payments?|autopay)/i,
  /stop paying (all|everything|your bills)/i,
  /take (all|everything) out of/i,

  // The permanent responsible-obligation guardrail (defense-in-depth --
  // the PRIMARY defense is that neither ActionCode nor DecisionCode
  // contains anything meaning "skip"/"ignore"/"pay late"; this net
  // catches the same intent slipping into free prose instead).
  // BudgetChek must never originate, normalize, or recommend
  // intentionally missing, ignoring, abandoning, or making late a known
  // financial responsibility merely to make a plan appear workable.
  /\bskip\s+(your\s+|the\s+)?(rent|mortgage|payment|bill|premium|minimum)/i,
  /\bdon'?t\s+pay\s+(the\s+|your\s+)?\w/i,
  /\bignore\s+(the\s+|your\s+|a\s+|an\s+|any\s+)?(\S+\s+){0,5}(bills?|payments?|invoices?|taxe?s?|obligations?|debts?|responsibilit(y|ies))\b/i,
  /\b(let|allow)\s+.{0,30}\b(go\s+late|become\s+late|go\s+delinquent|lapse)\b/i,
  /\bstop\s+paying\s+(your\s+|the\s+)?(insurance|premium|rent|mortgage)/i,
  /\bjust\s+(don'?t\s+|do\s+not\s+|not\s+)pay\b/i,
  /\buse\s+(the\s+|your\s+)?(rent|mortgage|insurance)\s+money\s+(for|toward)/i,
  /\b(intentionally|deliberately)\s+miss(ing)?\s+(the\s+|your\s+)?(required\s+)?(minimum\s+)?payment/i,
  /\babandon(ing)?\s+(the\s+|your\s+)?(payment|obligation|bill|responsibility)/i,
  // Endorsing lateness/skipping in BudgetChek's own voice, rather than
  // just acknowledging it as the person's own stated choice.
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
// Qualitative / state-claim grounding -- the numeric grounding above only
// scans for $/%/date-shaped tokens, so a claim with no financial figure
// at all ("Rent is already paid", "you have five bills") could bypass it
// entirely regardless of whether the model bothered to route it through a
// claim. These two checks run on the rendered text directly, keyed to the
// REAL entity names and counts in the payload -- not a generic phrase
// list -- so they stay structural rather than becoming a bigger regex.
// ---------------------------------------------------------------------------

/** For every real bill, checks whether the rendered text asserts a
 *  paid/unpaid state for it by name, and if so, that the assertion
 *  matches the real `paid` value. Scoped to bills (the only entity with
 *  a real `paid` field today). */
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

/** Checks any "N bills"/"N debts"/"N goals" assertion in the rendered
 *  text against the REAL count of that entity type in the payload. */
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
    return { grounded: false, reason: "snapshot did not parse as JSON" };
  }

  // Defense #1: resolve the template directly from real data. There is no
  // reverse-validation step -- every figure in the rendered text came
  // from BudgetChek's own lookup, never from the model.
  const rendered = renderAnswerTemplate(
    response.answer,
    response.claims,
    payload,
    ctx.currentUserMessage,
  );
  if (!rendered.ok) {
    return { grounded: false, reason: rendered.reason, offendingToken: rendered.offendingToken };
  }

  // Defense #2a: sweeping, unsupported financial directives in the
  // rendered prose (defense-in-depth, not primary -- see comment above).
  const unsupportedDirective = containsUnsupportedDirective(rendered.rendered);
  if (unsupportedDirective) {
    return {
      grounded: false,
      reason: "answer contains a sweeping, unsupported financial directive",
      offendingToken: unsupportedDirective,
    };
  }

  // Defense #2b: qualitative instruction-following via verbatim overlap.
  if (answerEchoesInjectedSpan(rendered.rendered, ctx.injectedSpans)) {
    return { grounded: false, reason: "answer substantially echoes a flagged injected span" };
  }

  // Defense #2c/#2d: qualitative STATE claims -- paid/unpaid and entity
  // counts -- checked directly against the real payload, independent of
  // whether the model routed them through a claim placeholder at all
  // (neither contains a $/%/date token, so the raw-figure ban alone
  // can't catch a fabricated one).
  const paidStateProblem = checkPaidStateClaims(rendered.rendered, payload);
  if (paidStateProblem) {
    return { grounded: false, reason: paidStateProblem };
  }
  const countProblem = checkEntityCountClaims(rendered.rendered, payload);
  if (countProblem) {
    return { grounded: false, reason: countProblem };
  }

  // Defense #3: the recommended action itself must be a real, deterministic-
  // state-validated action -- a resolvable target alone is not enough.
  if (response.nextActionType === "concrete_action") {
    if (!response.action) {
      return { grounded: false, reason: "concrete_action requires a structured action" };
    }
    const actionVerdict = validateAction(response.action, payload);
    if (!actionVerdict.ok) {
      return {
        grounded: false,
        reason: actionVerdict.reason,
        offendingToken: response.action.code,
      };
    }
  }

  // Defense #4: close the user_decision bypass -- a "decision" is only
  // ever a validated choice BETWEEN real, closed-vocabulary options,
  // never an unsupported directive wearing a different nextActionType.
  if (response.nextActionType === "user_decision") {
    if (!response.decision) {
      return { grounded: false, reason: "user_decision requires a structured decision" };
    }
    const decisionVerdict = validateDecision(response.decision, payload);
    if (!decisionVerdict.ok) {
      return { grounded: false, reason: decisionVerdict.reason };
    }
  }

  return {
    grounded: true,
    renderedAnswer: rendered.rendered,
    resolvedFacts: rendered.resolvedFacts,
  };
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

// ---------------------------------------------------------------------------
// The strict response contract -- lives here, not in mm-chat.functions.ts,
// so it is a pure, testable unit like everything else in this module. No
// .catch(...) anywhere: a malformed claim, an invalid enum value, or a
// missing required field means the WHOLE response fails to parse --
// parseContract returns null, and the caller falls straight to the safe
// fallback.
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

const ClaimSchema = z.object({
  label: z.string().min(1),
  kind: z.enum(["fact", "derived", "user_input"]),
  // Required for "fact"/"derived", absent for "user_input" -- enforced
  // as a cross-field rule in parseContract below, not at the schema
  // level, so the specific reason is easy to log.
  fieldPath: z.string().min(1).optional(),
  operation: z.enum(["add", "subtract"]).optional(),
  userOperand: z.string().min(1).optional(),
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

const AskResponseSchema = z.object({
  answer: z.string().min(1),
  claims: z.array(ClaimSchema),
  missing: z.array(z.string()),
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
 *  doesn't conform -- including the cross-field rules that
 *  "concrete_action" requires a structured action and "user_decision"
 *  requires a structured decision with at least two options (closing the
 *  bypass where an unsupported recommendation became valid merely by
 *  being labeled a decision instead of an action). Tolerant of
 *  surrounding prose/markdown fences around the JSON object (the same
 *  brace-extraction mm-vision.functions.ts already uses), but never
 *  tolerant of the shape once found. */
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
    }
    return result.data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// External-service error normalization -- a small, closed set of
// user-facing messages. No upstream response body, HTTP status detail,
// workspace/credit wording, or provider/secret name is ever returned by
// this function; it only ever produces one of exactly two fixed strings,
// by construction (the caller's raw error/body is for server-side logging
// only, and deliberately isn't even a parameter here that could leak
// through).
// ---------------------------------------------------------------------------

export const GENERIC_UNAVAILABLE =
  "The assistant isn't available right now. Try again in a moment.";
export const RATE_LIMITED = "Too many requests right now. Try again shortly.";

/** status: the upstream HTTP status, or null for a network-level failure
 *  (fetch threw) or an unparseable/empty response. Returns one of exactly
 *  two fixed strings -- never anything derived from the input. */
export function classifyTransportError(status: number | null): string {
  return status === 429 ? RATE_LIMITED : GENERIC_UNAVAILABLE;
}
