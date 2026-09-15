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
//    period -- entity identity comes only from a BudgetChek-authored
//    rendering, never from the model's own prose.
//  - nextActionType "concrete_action" requires a validated ActionCode,
//    rendered into a sentence BudgetChek generates FROM it
//    (renderActionSentence) -- the model can supply context around it,
//    but cannot state a different next step. Same pattern for
//    "user_decision" (renderDecisionSentence).
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
// v5 (bounded correction round) closed four residual implementation gaps
// in v4's mechanism -- the architecture (claim placeholders, server-
// authored values/state, ActionCode/DecisionCode, the responsible-
// obligation guardrail) was unchanged:
//  - the entity scan allowed a real entity name in prose whenever that
//    entity appeared ANYWHERE in the response's claims -- even a claim
//    about a totally different field of it. Made unconditional: the
//    model may never write a real entity name directly in "answer", full
//    stop -- only BudgetChek's own placeholder substitutions may.
//  - validateMissingItem only proved a targetFieldPath resolved to
//    something real, not that the value was actually absent. Now
//    validated per MissingCode against the real, current value, which
//    must genuinely be null. GroundingVerdict.safeMissing carries only
//    the items that pass this, computed unconditionally up front, so a
//    false missing claim can never reach safeFallback() even when the
//    response fails grounding for a completely unrelated reason.
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
//  - the {action}/{decision} placeholder was checked for PRESENCE, not
//    COUNT -- two copies of the same placeholder now failed closed too.
// Plus two further refinements found by adversarial self-verification of
// the four fixes above: a multi-word entity name with a short leading
// word ("US Bank Card") could still be named by dropping that word
// ("Bank Card") or varying internal whitespace; and any MissingCode
// (not just missing_other) could omit targetFieldPath to skip the
// null-check entirely.
//
// v6 (this round) finishes what v4 started. Even with every entity name
// and figure authored by BudgetChek, one channel remained: model-owned
// CONNECTIVE PROSE could still assert a financial fact carrying no
// number, no entity name, and no exact-phrase match to a defense-in-
// depth regex -- "Your plan is fully covered." when a real shortfall
// exists, for example. No regex list closes this; the fix is
// architectural: "answer" (a free-text template) is GONE. The contract
// now carries `answerParts` -- a closed, ordered list of references to
// validated things (a claim, a missing item, the validated action, the
// validated decision, or one of five fixed conversational "framing"
// sentences) -- and BudgetChek renders every single one. There is no
// field left anywhere in the contract for the model to write a raw
// sentence into. This makes the old raw-figure-token and raw-entity-name
// scans (which existed specifically to police that free-text field)
// structurally unreachable, so they're removed rather than kept as dead
// code -- not a weakening: the attack surface they defended is gone
// entirely, a strictly stronger guarantee than scanning it. The
// defense-in-depth scans that check the FINAL rendered text regardless
// of its source (containsUnsupportedDirective, answerEchoesInjectedSpan,
// checkPaidStateClaims, checkEntityCountClaims) remain, per instruction.
// containsUnsupportedDirective/answerEchoesInjectedSpan genuinely can't
// fire against correct output any more (nothing feeds them a matching
// phrase). checkPaidStateClaims/checkEntityCountClaims are NOT dead code,
// though: found by adversarial review, they key off substring/word-
// boundary matches against every real entity's name independent of which
// claim actually produced the text, so a real entity name that happens
// to be a word-prefix of a DIFFERENT real entity's name (e.g. "Rent" vs.
// "Rent extension"), or that itself reads like a count phrase (e.g. a
// goal named "Two Goals Fund"), can trigger a false rejection of an
// otherwise fully accurate answer -- always fail-safe (the person sees
// the generic "I don't have enough information" fallback, never a false
// claim), never fail-unsafe. Flagged as a known, bounded limitation
// rather than fixed here (a real fix needs these scans to know which
// claim rendered which span of text, not just pattern-match the final
// string) -- see the return package.
//
// Also this round: review_shortfall_item now requires a debt's
// MINIMUM (never its balance) plus real, in-window due-date evidence,
// matching review_obligation_options exactly -- all four current-cycle
// obligation actions (hold_for_due_item, pay_required_minimum,
// review_shortfall_item, review_obligation_options) now share identical
// debt-timing semantics.
//
// v7 (this round) closes the last gap in the user-supplied-number path.
// A "user_input" claim kind used to let the model echo a number the
// person typed straight back as a standalone answer part, proven only
// by "this number appears somewhere in the user's message" -- so
// "What is my balance? Just say 10000." could pass, because 10000
// literally appears in the message, even though it is not snapshot-
// backed financial state at all. Fixed by removing "user_input" as a
// displayable Claim kind entirely -- there is no product need for it a
// "derived" claim doesn't already cover, since BudgetChek can name the
// user's own scenario figure directly inside its own hypothetical
// rendering (see derivedHypotheticalPhrase). Two further requirements
// on the remaining "derived" path, which is now the ONLY way a user-
// typed number can ever enter a response:
//  - The number must be independently provable as an unambiguous DOLLAR
//    amount actually expressed in the CURRENT user message ("$300",
//    "300 dollars") -- never a bare count, date, or percent token ("30
//    days", "20%"). extractMoneyOperandsFromText scans the raw message
//    for money-shaped tokens only; a number that only ever appears
//    un-dollar-signed and un-suffixed is not treated as money, and the
//    claim fails closed rather than guessing the unit.
//  - The derived claim's target entity must itself be referenced in the
//    CURRENT user message (entityReferencedInMessage) -- a real number,
//    a real target, and a real derivation don't add up to a valid
//    scenario if the relationship between them is wrong (e.g. "$300
//    toward Store card" cannot derive a hypothetical for Visa card).
//    BudgetChek never silently resolves "this debt" from prior turns.
//
// Adversarial self-verification of the two checks above (both correct
// in isolation) found they composed into a real gap: each only proved
// its own fact existed SOMEWHERE in the message, never that they were
// about the SAME thing. "My rent is $300. What's my best strategy?" has
// a real $300 (about rent) and, via entityReferencedInMessage's old
// "first distinctive word alone" shortcut, a false "reference" to any
// debt whose first word happened to be an ordinary English word used
// elsewhere in the message ("Best Buy card" via "best", or -- using
// nothing but the shipped fixture's own real debts -- "Phone plan" via
// "my phone screen cracked", "Store card" via "I need to store some
// boxes"). Two fixes, together: entityReferencedInMessage now requires
// the FULL entity name (the shortcut is gone -- unlike the old raw-
// name BAN this module used to run on model prose, where over-
// rejecting was the safe direction, under-rejecting here would bind a
// real number to the wrong real entity, so it can't take the same
// shortcut); and scenarioClauseBindsOperandAndTarget additionally
// requires the dollar figure and the target reference to appear in the
// SAME clause of the message, not just independently somewhere in it --
// the actual "scenario relationship" proof, not two unlinked existence
// checks.
//
// v8 (this round) is a consolidated closure pass across the whole
// chain, not another single-hole fix -- see the CEO's own "PR #10
// CONSOLIDATED TRUST CLOSURE" directive for the full rationale. All
// prior architecture (answerParts, claims, state, missing, actions,
// decisions, the responsible-obligation guardrail, the round-7/8
// user-supplied-number checks) is LOCKED and unchanged; this round adds
// on top of it rather than reworking it:
//  - SCENARIO SEMANTICS: a "derived" claim's operation (add/subtract)
//    used to be whatever the model put in the claim, checked only for
//    money-type and target-presence, never for whether it actually
//    matched what the person's own words describe. parseScenarioIntents
//    is a small, deliberately narrow, deterministic grammar over
//    supported phrasings ("pay $X toward <debt>", "save $X toward
//    <goal>", etc.) that independently derives the ONE real scenario
//    (target, operation, amount) the message expresses; a claim must
//    match it exactly, or it fails closed. Explicit negation ("don't
//    pay...") is recognized and excluded. Multiple money values in one
//    message bind only to their own specific supported phrase, never to
//    "any number in the same sentence". A scenario is also rejected
//    when it would drive a debt balance or goal saved-amount below
//    zero -- see validateScenarioResult.
//  - DEBT-TIMING SOURCE OF TRUTH: decision-engine.ts's buildFundingPlan
//    used to include every debt minimum in the ranked funding plan
//    regardless of due date -- an upstream defect, not just an
//    assistant wording one, since it made funding.shortfall itself
//    unreliable. Fixed there (see that file's own header note); this
//    file's resolveStateClaim/renderActionSentence now surface an
//    honest caveat whenever FundingPlan.debtsWithUnknownTiming is
//    non-empty, so a "no shortfall"/"no action needed" claim never
//    implies debt timing was evaluated when it wasn't. A new ActionCode,
//    debt_timing_unavailable, replaces add_missing_due_date for debts
//    specifically (which is now bill-only) -- there is no UI field to
//    "add" a debt due date to today, so recommending that would itself
//    be dishonest.
//  - ACTION/PLAN ALIGNMENT: hold_for_due_item and pay_required_minimum
//    now also require the target's OWN funding-plan line item to
//    actually be "funded" (isFundingItemFunded) -- a structurally valid,
//    in-window obligation that the ranked plan hasn't actually been
//    able to pay for yet must route to review_shortfall_item/
//    review_obligation_options instead, never a bare "pay/hold this".
//    Since the engine allocates money strictly in rank order, this same
//    check also structurally prevents ever recommending a lower-
//    priority obligation while a higher-priority one is uncovered --
//    it's the same underlying fix, not a second mechanism. A bill
//    already marked paid can no longer be targeted by
//    hold_for_due_item/review_shortfall_item/review_obligation_options
//    at all.
//  - DISCRETIONARY ROOM: validateDecision's gate required the plan
//    complete with no shortfall, but that alone doesn't prove any
//    money is actually free to allocate -- available could exactly
//    equal totalRequested, with zero left over. Now also requires
//    funding.available - funding.totalRequested > 0.
//  - no_action_needed's rendered sentence no longer reads as "nothing
//    to pay" -- it means "no plan change is needed", which is a
//    materially different claim when real scheduled items still exist.

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

/** What the MODEL sends: a reference to a real fact, derivation, or a
 *  qualitative state -- never an authored value or entity name.
 *  BudgetChek resolves and renders every word that carries authority;
 *  the model only ever picks WHICH real thing to talk about. There is
 *  deliberately no "echo the user's own number back as a standalone
 *  answer part" kind (see the round-8 module header note) -- a number
 *  the person typed is never itself financial state; it may only ever
 *  enter a response bound to a real field via "derived". */
export interface Claim {
  kind: "fact" | "derived" | "state";
  /** Required for "fact"/"derived", and for the "state" codes that name
   *  a specific bill/debt/reserved fund. Absent for whole-plan state
   *  codes (plan_complete, has_shortfall, etc.). Exact addressing
   *  scheme: "snapshot.<dotted.path>" for whole-snapshot aggregates, or
   *  "<kind>:<exact entity name>.<field>" for an entity-scoped figure. */
  fieldPath?: string;
  /** "derived" only: the operation combining the base fieldPath's real
   *  value with a figure the person just typed. */
  operation?: "add" | "subtract";
  /** "derived" only: the literal number the person typed THIS turn --
   *  never inferred, never carried over from an earlier turn, and must
   *  be independently provable as an unambiguous DOLLAR amount (never a
   *  bare count/date/percent) actually expressed in the current user
   *  message -- see resolveClaim's derived branch. */
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
  | "no_action_needed"
  | "debt_timing_unavailable";

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

/** A small, closed set of BudgetChek-authored conversational sentences
 *  for connective/meta text that carries NO financial meaning at all --
 *  never state, coverage, timing, paid/unpaid, or a recommendation.
 *  Deliberately a short, fixed enum, not a mechanism to mimic arbitrary
 *  model prose: if a genuinely new situation needs a new closed code,
 *  that is a deliberate addition to this list, never a free-text escape
 *  hatch. See renderFramingSentence for the exact fixed wording of each. */
export type FramingCode =
  | "hypothetical_notice"
  | "user_choice_acknowledgement"
  | "external_information_unavailable"
  | "needs_more_information"
  | "plan_context";

/** Every part of a displayed answer that can carry meaning, closed to
 *  exactly these five shapes. There is no free-text part -- every word
 *  the person sees is written by BudgetChek's own renderer for whichever
 *  part type it is; the model only ever picks WHICH parts are relevant
 *  and in what order. This is what finally closes the "connective prose
 *  asserts an unvalidated fact" channel: there is no field left anywhere
 *  in the contract for the model to write a raw sentence into. */
export type AnswerPart =
  | { type: "claim"; claimIndex: number }
  | { type: "missing"; missingIndex: number }
  | { type: "action" }
  | { type: "decision" }
  | { type: "framing"; code: FramingCode };

/** The contract the model must return instead of free-form prose. Strict:
 *  every field is required, every enum is closed. There is no permissive
 *  default anywhere in the schema that parses this shape (see
 *  AskResponseSchema below) -- a response that doesn't match exactly
 *  fails closed rather than being coerced into something that does. */
export interface AskResponseContract {
  /** The ordered composition of the displayed answer. See AnswerPart --
   *  there is no free-text field anywhere else in this contract either. */
  answerParts: AnswerPart[];
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
  /** Present only when grounded: true -- the fully composed answer, with
   *  every answerPart rendered from its BudgetChek-authored source (a
   *  claim's authoritative phrase, a missing item's question, the
   *  validated action/decision sentence, or a fixed framing sentence).
   *  There is no step anywhere that substitutes in model-authored text --
   *  every word here was written by this module. */
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
 *  real at all, OR if the name is genuinely ambiguous (round-9
 *  adversarial review: two real entities sharing a display name let a
 *  first-match `.find()` silently resolve a DIFFERENT entity than the
 *  one a funding-plan lookup elsewhere in this file independently
 *  matched -- fixed by failing closed on more than one match, the same
 *  "never guess which one" rule isNameUniqueInKind already applies on
 *  the scenario-parser path). */
function resolveFieldPath(fieldPath: string, payload: Record<string, unknown>): Resolved | null {
  const entityMatch = fieldPath.match(ENTITY_FIELD_PATH_RE);
  if (entityMatch) {
    const [, kind, name, field] = entityMatch;
    const meta = ENTITY_FIELDS[kind]?.[field];
    if (!meta) return null;
    const arr = payload[ENTITY_ARRAY_KEY[kind]];
    if (!Array.isArray(arr)) return null;
    const nameField = ENTITY_NAME_FIELD[kind];
    const matches = arr.filter(
      (e) => e && typeof e === "object" && (e as Record<string, unknown>)[nameField] === name,
    );
    if (matches.length !== 1) return null;
    const entity = matches[0];
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

/** Every number the person's CURRENT message expresses as an
 *  unambiguous DOLLAR amount -- "$300" or "300 dollars"/"300 bucks" --
 *  never a bare count, date, or percent token. "What happens in 30
 *  days?" and "My APR is 20%." both yield an empty array; the number is
 *  there, but nothing marks it as money, so it is never derivable as
 *  money. This is the actual security boundary for a "derived" claim's
 *  userOperand -- checked against the raw message, not against
 *  whatever string the model chose to write into userOperand. */
function extractMoneyOperandsFromText(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/-?\$\s?-?\d[\d,]*(?:\.\d{1,2})?/g)) {
    const n = Number.parseFloat(m[0].replace(/[$,\s]/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  for (const m of text.matchAll(/-?\d[\d,]*(?:\.\d{1,2})?\s?(?:dollars?|bucks)\b/gi)) {
    const numMatch = m[0].match(/-?\d[\d,]*(?:\.\d{1,2})?/);
    if (numMatch) {
      const n = Number.parseFloat(numMatch[0].replace(/,/g, ""));
      if (Number.isFinite(n)) out.push(n);
    }
  }
  return out;
}

/** Every real, addressable entity name on file, across every kind
 *  (bill/debt/goal/account/reserved) -- round-9 adversarial review
 *  finding: a shorter real name that's a strict PREFIX of a different,
 *  longer real name (a debt named "Visa" alongside a separate debt
 *  named "Visa card"; a goal named "Emergency" alongside "Emergency
 *  fund") could still \b...\b-match inside a message that only ever
 *  named the LONGER one -- \b fires at a word/space transition just as
 *  readily as at a genuine name boundary. This list is how a match on
 *  the shorter name gets recognized as shadowed rather than accepted. */
function allRealEntityNames(payload: Record<string, unknown>): string[] {
  const names: string[] = [];
  for (const kind of Object.keys(ENTITY_ARRAY_KEY)) {
    const arr = payload[ENTITY_ARRAY_KEY[kind]];
    if (!Array.isArray(arr)) continue;
    const nameField = ENTITY_NAME_FIELD[kind];
    for (const e of arr) {
      if (!e || typeof e !== "object") continue;
      const n = (e as Record<string, unknown>)[nameField];
      if (typeof n === "string") names.push(n);
    }
  }
  return names;
}

/** True if the match for `name` at `matchIndex` in `text` is actually a
 *  strict PREFIX occurrence of a DIFFERENT, longer real entity name --
 *  i.e. the person named the longer entity, not this shorter one. See
 *  allRealEntityNames's doc comment for why a plain \b...\b match can't
 *  tell the difference on its own. */
function isShadowedByLongerEntityName(
  name: string,
  text: string,
  matchIndex: number,
  allNames: string[],
): boolean {
  const words = name.split(/\s+/).filter(Boolean);
  return allNames.some((other) => {
    if (other === name) return false;
    const otherWords = other.split(/\s+/).filter(Boolean);
    if (otherWords.length <= words.length) return false;
    const isPrefix = words.every((w, i) => otherWords[i]?.toLowerCase() === w.toLowerCase());
    if (!isPrefix) return false;
    const otherFull = otherWords.map(escapeRegex).join("\\s+");
    const otherMatch = new RegExp(`\\b${otherFull}\\b`, "i").exec(text);
    return !!otherMatch && otherMatch.index === matchIndex;
  });
}

/** Is this real entity actually referenced in the person's CURRENT
 *  message -- the FULL name only (whitespace-tolerant). Deliberately no
 *  "first distinctive word alone" shortcut here (unlike the old raw-
 *  entity-name BAN this module used to run on model prose): a plain
 *  ordinary English word that happens to be a multi-word debt/goal's
 *  first token ("Phone plan", "Store card", "Best Buy card") would
 *  otherwise "match" any message that happens to use that word for
 *  something else entirely ("my phone screen cracked"). Banning
 *  (fail-safe direction: over-reject) can afford that shortcut; BINDING
 *  a user-typed dollar figure to a target (fail-*unsafe* direction if
 *  wrong: a real number could attach to the wrong real entity) cannot.
 *  A derived claim's target must pass this on the full name; a shortened
 *  reference is a genuine ambiguity BudgetChek asks about rather than
 *  guesses. Never silently resolved from an earlier turn either -- only
 *  the current message counts. `allNames` (every real entity name on
 *  file) is used to reject a match that's actually shadowed by a
 *  different, longer real name -- see isShadowedByLongerEntityName. */
function entityReferencedInMessage(name: string, message: string, allNames: string[]): boolean {
  const words = name.split(/\s+/).filter(Boolean);
  const full = words.map(escapeRegex).join("\\s+");
  const re = new RegExp(`\\b${full}\\b`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(message))) {
    if (!isShadowedByLongerEntityName(name, message, m.index, allNames)) return true;
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  return false;
}

/** Splits the CURRENT message into sentence-like clauses (on ./!/? or a
 *  newline). A short "what if" message is usually one clause; this
 *  exists so a derived claim's operand and target can be proven to
 *  belong to the SAME one, not just to independently exist somewhere in
 *  a longer message. */
function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The actual "scenario relationship" proof: is there ONE clause in the
 *  person's current message that contains BOTH an unambiguous dollar
 *  figure equal to operandNum AND a reference to this exact target?
 *  Checking "money exists somewhere" and "target exists somewhere"
 *  independently is not enough -- a message like "My rent is $300.
 *  What's my best strategy?" contains a real $300 and (via the banned
 *  first-word shortcut this function's sibling used to allow) could
 *  "reference" an entity like "Best Buy card" through the unrelated
 *  word "best", binding someone's rent figure to a card they never
 *  mentioned. Requiring both in the SAME clause closes that -- and
 *  since entityReferencedInMessage now requires the full name anyway,
 *  this is defense in depth on top of that fix, not the only guard. */
function scenarioClauseBindsOperandAndTarget(
  message: string,
  entityName: string,
  operandNum: number,
  payload: Record<string, unknown>,
): boolean {
  const allNames = allRealEntityNames(payload);
  for (const clause of sentencesOf(message)) {
    const hasTarget = entityReferencedInMessage(entityName, clause, allNames);
    const hasMoney = extractMoneyOperandsFromText(clause).some((n) => moneyClose(n, operandNum));
    if (hasTarget && hasMoney) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Scenario semantics -- BudgetChek owns the arithmetic intent. A small,
// deliberately narrow, deterministic grammar over specific supported
// phrasings -- NOT general NLP -- independently derives the ONE real
// scenario (target, operation, amount) the person's own words express.
// A "derived" claim's operation/target/amount must match this exactly;
// the model may never pick a different one. Unknown wording matches
// nothing, which resolveClaim treats as fail closed / ask for
// clarification, the same as any other unresolvable claim.
// ---------------------------------------------------------------------------

export interface ScenarioIntent {
  targetKind: "debt" | "goal";
  targetName: string;
  targetFieldPath: string;
  operation: "add" | "subtract";
  operandMoney: number;
}

/** A small set of intensifier words the supported phrasings tolerate
 *  between the verb and the money token ("put AN EXTRA $300 toward"),
 *  without turning the grammar into general NLP -- still exactly one
 *  optional, closed fragment, never arbitrary text. */
const SCENARIO_FILLER = `(?:an?\\s+(?:extra|additional)\\s+|another\\s+|some\\s+)?`;

/** Regex SOURCE (not a compiled RegExp) for one UNSIGNED money token:
 *  dollar-signed ("$300", "$1,234.50") or "dollars"/"bucks"-suffixed
 *  ("300 dollars", "300bucks"). Used only inside the scenario patterns
 *  below -- direction comes from which verb matched (pay/put/send vs.
 *  charge/borrow, save/add/deposit vs. take/withdraw/use), never from a
 *  sign on the number itself; resolveClaim separately rejects any
 *  non-positive operand outright (see the "no negative operand"
 *  requirement). */
const MONEY_TOKEN = String.raw`\$\s?\d[\d,]*(?:\.\d{1,2})?|\d[\d,]*(?:\.\d{1,2})?\s?(?:dollars?|bucks)\b`;

function moneyTokenToNumber(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "").replace(/dollars?|bucks/gi, "");
  if (cleaned === "") return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface ScenarioPattern {
  operation: "add" | "subtract";
  build: (nameRe: string) => RegExp;
}

const DEBT_SCENARIO_PATTERNS: ScenarioPattern[] = [
  {
    operation: "subtract",
    build: (n) =>
      new RegExp(
        `\\bpay(?:ing)?\\s+(?:down\\s+)?${SCENARIO_FILLER}(${MONEY_TOKEN})\\s+(?:toward|on|to|against)\\s+(?:the\\s+)?${n}\\b`,
        "i",
      ),
  },
  {
    operation: "subtract",
    build: (n) =>
      new RegExp(
        `\\bput\\s+${SCENARIO_FILLER}(${MONEY_TOKEN})\\s+toward\\s+(?:the\\s+)?${n}\\b`,
        "i",
      ),
  },
  {
    operation: "subtract",
    build: (n) =>
      new RegExp(`\\bsend\\s+${SCENARIO_FILLER}(${MONEY_TOKEN})\\s+to\\s+(?:the\\s+)?${n}\\b`, "i"),
  },
  {
    operation: "subtract",
    build: (n) =>
      new RegExp(
        `\\b(?:make\\s+)?(?:an\\s+)?extra\\s+(${MONEY_TOKEN})\\s+payment\\s+on\\s+(?:the\\s+)?${n}\\b`,
        "i",
      ),
  },
  {
    operation: "subtract",
    build: (n) =>
      new RegExp(`\\bpay(?:ing)?\\s+down\\s+(?:the\\s+)?${n}\\s+by\\s+(${MONEY_TOKEN})\\b`, "i"),
  },
  {
    operation: "add",
    build: (n) =>
      new RegExp(`\\bcharge\\s+(?:another\\s+)?(${MONEY_TOKEN})\\s+to\\s+(?:the\\s+)?${n}\\b`, "i"),
  },
  {
    operation: "add",
    build: (n) =>
      new RegExp(
        `\\badd\\s+${SCENARIO_FILLER}(${MONEY_TOKEN})\\s+to\\s+(?:the\\s+)?balance\\s+on\\s+(?:the\\s+)?${n}\\b`,
        "i",
      ),
  },
  {
    operation: "add",
    build: (n) =>
      new RegExp(`\\bborrow\\s+(?:another\\s+)?(${MONEY_TOKEN})\\s+on\\s+(?:the\\s+)?${n}\\b`, "i"),
  },
];

const GOAL_SCENARIO_PATTERNS: ScenarioPattern[] = [
  {
    operation: "add",
    build: (n) =>
      new RegExp(
        `\\bsave\\s+${SCENARIO_FILLER}(${MONEY_TOKEN})\\s+toward\\s+(?:the\\s+)?${n}\\b`,
        "i",
      ),
  },
  {
    operation: "add",
    build: (n) =>
      new RegExp(`\\badd\\s+${SCENARIO_FILLER}(${MONEY_TOKEN})\\s+to\\s+(?:the\\s+)?${n}\\b`, "i"),
  },
  {
    operation: "add",
    build: (n) =>
      new RegExp(
        `\\bcontribute\\s+${SCENARIO_FILLER}(${MONEY_TOKEN})\\s+to\\s+(?:the\\s+)?${n}\\b`,
        "i",
      ),
  },
  {
    operation: "add",
    build: (n) =>
      new RegExp(
        `\\bdeposit\\s+${SCENARIO_FILLER}(${MONEY_TOKEN})\\s+into\\s+(?:the\\s+)?${n}\\b`,
        "i",
      ),
  },
  {
    operation: "subtract",
    build: (n) => new RegExp(`\\btake\\s+(${MONEY_TOKEN})\\s+from\\s+(?:the\\s+)?${n}\\b`, "i"),
  },
  {
    operation: "subtract",
    build: (n) => new RegExp(`\\bwithdraw\\s+(${MONEY_TOKEN})\\s+from\\s+(?:the\\s+)?${n}\\b`, "i"),
  },
  {
    operation: "subtract",
    build: (n) => new RegExp(`\\buse\\s+(${MONEY_TOKEN})\\s+from\\s+(?:the\\s+)?${n}\\b`, "i"),
  },
];

/** Explicit negation must never become a positive scenario. "Don't pay
 *  $300 toward Visa card" and "I can't put $300 toward Visa card" must
 *  NOT be read as the person proposing that payment. Checked against
 *  the portion of the clause BEFORE the matched verb phrase only -- a
 *  negation ANYWHERE in the same clause blocks the match -- round-9
 *  adversarial review found the original "before the match only" check
 *  let an explicit trailing refusal in the same breath ("Pay $300
 *  toward Visa card, don't do it") still render as a real proposed
 *  hypothetical, since nothing after the matched phrase was ever
 *  inspected. Checking the whole clause can over-reject a rare
 *  legitimate case (a negation word used for an unrelated reason later
 *  in the same clause, e.g. "...so I don't fall behind"), but
 *  over-rejecting here only means BudgetChek asks the person to restate
 *  -- never that a real number renders bound to the wrong intent, which
 *  is the same safe-direction tradeoff this file makes everywhere else.
 *  The alternation was also broadened with several common negation
 *  forms that were previously missing entirely (wouldn't, ain't,
 *  refuse to, no way, absolutely not, and a bare "not"). */
const SCENARIO_NEGATION_RE =
  /\b(don'?t|do\s+not|won'?t|will\s+not|can'?t|cannot|could\s?n'?t|could\s+not|should\s?n'?t|should\s+not|would\s?n'?t|would\s+not|ain'?t|refuse[sd]?\s+to|no\s+way|absolutely\s+not|never|not\s+going\s+to|not)\b/i;

function isClauseNegated(clause: string): boolean {
  return SCENARIO_NEGATION_RE.test(clause);
}

/** Independently derives every scenario the person's CURRENT message
 *  expresses, by checking every real debt/goal against every pattern
 *  for its OWN kind (a debt is only ever checked against debt
 *  patterns, a goal only against goal patterns -- no guessing which
 *  kind a name might be). Deduplicated by (target, operation, amount);
 *  a caller (resolveClaim) is responsible for treating "no match" and
 *  "more than one distinct match for this target" both as fail-closed,
 *  never as license to guess. */
/** Does exactly one entity of this kind carry this exact name? If the
 *  same visible name identifies more than one real debt/goal, BudgetChek
 *  must not guess which one a scenario means -- parseScenarioIntents
 *  skips generating an intent for a duplicated name entirely, so the
 *  caller sees "no supported scenario found" (fail closed / ask which
 *  one they mean) rather than silently picking whichever entity a
 *  first-match lookup happens to return. */
function isNameUniqueInKind(
  name: string,
  kind: "debt" | "goal",
  payload: Record<string, unknown>,
): boolean {
  const arr = payload[ENTITY_ARRAY_KEY[kind]];
  if (!Array.isArray(arr)) return true;
  const nameField = ENTITY_NAME_FIELD[kind];
  let count = 0;
  for (const e of arr) {
    if (e && typeof e === "object" && (e as Record<string, unknown>)[nameField] === name) count++;
  }
  return count <= 1;
}

function parseScenarioIntents(message: string, payload: Record<string, unknown>): ScenarioIntent[] {
  const out: ScenarioIntent[] = [];
  const seen = new Set<string>();
  const allNames = allRealEntityNames(payload);
  for (const clause of sentencesOf(message)) {
    for (const kind of ["debt", "goal"] as const) {
      const arr = payload[ENTITY_ARRAY_KEY[kind]];
      if (!Array.isArray(arr)) continue;
      const nameField = ENTITY_NAME_FIELD[kind];
      const patterns = kind === "debt" ? DEBT_SCENARIO_PATTERNS : GOAL_SCENARIO_PATTERNS;
      const field = kind === "debt" ? "balance" : "saved";
      for (const entity of arr) {
        if (!entity || typeof entity !== "object") continue;
        const name = (entity as Record<string, unknown>)[nameField];
        if (typeof name !== "string") continue;
        if (!isNameUniqueInKind(name, kind, payload)) continue;
        const nameRe = name.split(/\s+/).filter(Boolean).map(escapeRegex).join("\\s+");
        for (const pattern of patterns) {
          const re = pattern.build(nameRe);
          const m = re.exec(clause);
          if (!m) continue;
          // Round-9 review: a match on a strict prefix of a different,
          // longer real entity name is shadowed -- the person named
          // the longer entity, not this one (same guard as
          // entityReferencedInMessage, applied here independently since
          // this loop builds its own regex rather than calling that
          // function).
          if (isShadowedByLongerEntityName(name, clause, m.index, allNames)) continue;
          if (isClauseNegated(clause)) continue;
          const amount = moneyTokenToNumber(m[1]);
          if (amount == null || !(amount > 0)) continue;
          const targetFieldPath = `${kind}:${name}.${field}`;
          const key = `${targetFieldPath}:${pattern.operation}:${amount}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            targetKind: kind,
            targetName: name,
            targetFieldPath,
            operation: pattern.operation,
            operandMoney: amount,
          });
        }
      }
    }
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

/** Does this raw snapshot value actually match its declared FactType?
 *  See the "fact" branch of resolveClaim's doc comment for why this
 *  matters -- formatByType has no fail-closed path of its own. */
function valueMatchesFactType(type: FactType, value: unknown): boolean {
  switch (type) {
    case "money":
    case "percent":
    case "count":
      return typeof value === "number" && Number.isFinite(value);
    case "date":
    case "text":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
  }
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

/** The authoritative phrase for a "derived" claim specifically --
 *  distinct from authoritativePhrase's plain hypothetical wording so the
 *  user-supplied scenario figure is itself named, never just implied.
 *  Every derivable field is money-typed (ENTITY_FIELDS has no non-money
 *  entry with derivable: true), so this never needs formatByType's other
 *  branches. "Using $300 you entered for this scenario, Visa card's
 *  hypothetical balance would be $900.00" -- the user's own figure, the
 *  real entity's actual field identity, and the computed result are all
 *  named explicitly and can never be confused with current actual
 *  state, because none of them are ever displayed without this framing. */
function derivedHypotheticalPhrase(fieldPath: string, operandNum: number, result: number): string {
  const formattedOperand = formatMoney(round2(operandNum));
  const formattedResult = formatMoney(round2(result));
  const m = fieldPath.match(ENTITY_FIELD_PATH_RE);
  if (m) {
    const [, kind, name, field] = m;
    const descriptor = FIELD_DESCRIPTORS[kind]?.[field] ?? field;
    return `using ${formattedOperand} you entered for this scenario, ${name}'s hypothetical ${descriptor} would be ${formattedResult}`;
  }
  return `using ${formattedOperand} you entered for this scenario, the hypothetical result would be ${formattedResult}`;
}

// ---------------------------------------------------------------------------
// Resolving one claim -- fact, derived, or state
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
      // funding being null (a real, reachable state -- computeSnapshot
      // returns it when the plan isn't complete enough to compute a
      // funding plan yet) must fail BOTH directions closed. Defaulting
      // the missing-data case to "no shortfall" would let this claim
      // pass as true when it was never actually verified.
      if (!funding) {
        return {
          ok: false,
          reason: `${code} requires a computed funding plan, which isn't available yet`,
        };
      }
      // Never let "no shortfall" imply debt timing was evaluated when
      // it wasn't -- append an honest caveat whenever a real debt
      // minimum was excluded from this cycle's plan for unknown timing,
      // baked into BudgetChek's own rendering so it can't be omitted.
      // Uses the RAW count (see debtsWithUnknownTimingCount's doc
      // comment) so a malformed entry in the underlying array can't
      // silently suppress or undercount this caveat.
      const unknownCount = debtsWithUnknownTimingCount(payload);
      // Deliberately phrased WITHOUT a leading "<N> debt(s)" count -- that
      // exact shape is what checkEntityCountClaims's fail-safe treats as
      // a claim about the TOTAL number of debts on file, which this is
      // not (it's a count of the subset with unknown timing, almost
      // always smaller). A real "1 debt" collision was caught here
      // during round 9's own test matrix before being reported.
      const caveat =
        unknownCount > 0
          ? ` (this doesn't account for ${unknownCount === 1 ? "a debt minimum" : "some debt minimums"} with no known due date, which BudgetChek can't place in this window without guessing)`
          : "";
      if (code === "has_shortfall") {
        if (!(shortfall > 0))
          return { ok: false, reason: "claimed a shortfall exists, but there isn't one" };
        return { ok: true, formatted: `there is a shortfall in the current plan${caveat}` };
      }
      if (shortfall > 0)
        return { ok: false, reason: "claimed there is no shortfall, but there is one" };
      return { ok: true, formatted: `the plan is fully covered, with no shortfall${caveat}` };
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
      // window being null (same real, reachable state as funding above)
      // must fail BOTH directions closed -- defaulting the missing-data
      // case to "not in window" would let out_of_window pass as true
      // when the window was never actually known, let alone checked.
      if (!window) {
        return {
          ok: false,
          reason: `${code} requires a computed planning window, which isn't available yet`,
        };
      }
      const name = extractEntityName(claim.fieldPath)!;
      const inWin = withinWindow(resolved.value, window);
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
    // Round-9 review (pre-existing, not round-9-new, but closed in this
    // same pass): the "derived" branch below has always guarded that
    // its resolved value is really a number before formatting it; this
    // "fact" branch never did. formatMoney's n.toLocaleString silently
    // stringifies a non-number rather than throwing, so a snapshot
    // value that doesn't match its declared FieldMeta.type (a "money"
    // field holding a string, say) rendered unformatted, un-validated
    // raw text instead of failing closed.
    if (!valueMatchesFactType(resolved.meta.type, resolved.value)) {
      return {
        ok: false,
        reason: `fieldPath "${claim.fieldPath}" resolved to a value that does not match its declared type -- BudgetChek never renders an unverified or malformed value`,
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
  // The target must itself be referenced in THIS turn -- a real number
  // and a real target don't make a valid scenario if the relationship
  // between them is wrong ("$300 toward Store card" cannot derive a
  // hypothetical for Visa card). Never resolved from an earlier turn.
  const entityName = extractEntityName(claim.fieldPath);
  if (
    !entityName ||
    !entityReferencedInMessage(entityName, currentUserMessage, allRealEntityNames(payload))
  ) {
    return {
      ok: false,
      reason: `derived claim's target "${entityName ?? claim.fieldPath}" is not referenced in the user's current message -- BudgetChek does not resolve a scenario target from prior context`,
      offendingToken: claim.fieldPath,
    };
  }
  const operandNum = parseNumericClaim(claim.userOperand);
  if (operandNum == null) {
    return {
      ok: false,
      reason: `derived claim's userOperand "${claim.userOperand}" did not parse as a number`,
      offendingToken: claim.userOperand,
    };
  }
  // Scenario money operands must be finite and strictly positive.
  // Direction comes from the operation (add/subtract), never from a
  // sign on the number -- "-$300" or "$0" are never valid operands,
  // regardless of what the message says.
  if (!(operandNum > 0)) {
    return {
      ok: false,
      reason: `derived claim's userOperand "${claim.userOperand}" must be a positive dollar amount greater than zero -- direction comes from the operation, never from a negative operand`,
      offendingToken: claim.userOperand,
    };
  }
  // The number must be provably MONEY, not just present -- a bare
  // count/date/percent in the message ("30 days", "20%") never
  // qualifies, and BudgetChek never guesses the unit.
  if (!extractMoneyOperandsFromText(currentUserMessage).some((n) => moneyClose(n, operandNum))) {
    return {
      ok: false,
      reason: `derived claim's userOperand "${claim.userOperand}" was not expressed as an unambiguous dollar amount by the user this turn -- a bare number, date, or percent may not be treated as money`,
      offendingToken: claim.userOperand,
    };
  }
  // The target and the money figure existing SOMEWHERE in the message
  // each isn't enough -- they must belong to the SAME clause, or a real
  // dollar figure about one thing (rent) could bind to an unrelated real
  // target merely because both happen to appear in the same message.
  if (!scenarioClauseBindsOperandAndTarget(currentUserMessage, entityName, operandNum, payload)) {
    return {
      ok: false,
      reason: `derived claim's target "${entityName}" and its $${operandNum} scenario figure are not clearly part of the same statement in the user's current message -- BudgetChek does not infer a relationship between separate parts of a message`,
      offendingToken: claim.userOperand,
    };
  }
  // The operation must come from the person's OWN scenario wording, not
  // from the model's independent choice. parseScenarioIntents is the
  // sole, deterministic source of truth for which operation a real
  // scenario expresses; unknown wording matches nothing (fail closed),
  // and if the message expresses more than one distinct scenario for
  // THIS target, BudgetChek does not guess which one a claim means.
  const matchingScenarios = parseScenarioIntents(currentUserMessage, payload).filter(
    (s) => s.targetFieldPath === claim.fieldPath,
  );
  if (matchingScenarios.length === 0) {
    return {
      ok: false,
      reason: `no supported scenario phrasing in the user's current message expresses a change to "${entityName}" -- BudgetChek does not interpret free-form wording; ask them to state it plainly (e.g. "pay $${operandNum} toward ${entityName}")`,
      offendingToken: claim.userOperand,
    };
  }
  if (matchingScenarios.length > 1) {
    return {
      ok: false,
      reason: `the user's current message expresses more than one possible amount or direction for "${entityName}" -- BudgetChek does not guess which one a claim refers to`,
      offendingToken: claim.userOperand,
    };
  }
  const scenario = matchingScenarios[0];
  if (!moneyClose(scenario.operandMoney, operandNum)) {
    return {
      ok: false,
      reason: `derived claim's userOperand "${claim.userOperand}" does not match the amount in the user's own scenario wording ($${scenario.operandMoney})`,
      offendingToken: claim.userOperand,
    };
  }
  if (scenario.operation !== claim.operation) {
    return {
      ok: false,
      reason: `derived claim's operation "${claim.operation}" does not match what the user's own scenario wording expresses ("${scenario.operation}") -- the model may not choose a different operation than the person's scenario`,
      offendingToken: claim.operation,
    };
  }
  const result =
    claim.operation === "add" ? resolved.value + operandNum : resolved.value - operandNum;
  // Never render an impossible derived state -- a debt balance or a
  // goal's saved amount can't go below zero. BudgetChek does not invent
  // provider overpayment behavior; it fails closed and lets the model
  // explain the requested amount exceeds what's on file instead.
  if (result < -EPS) {
    return {
      ok: false,
      reason: `derived claim's result ($${round2(result)}) would be negative -- the requested amount exceeds "${entityName}"'s real balance; BudgetChek does not render an impossible state`,
      offendingToken: claim.userOperand,
    };
  }
  return {
    ok: true,
    formatted: derivedHypotheticalPhrase(claim.fieldPath, operandNum, Math.max(0, result)),
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Rendering answerParts -- BudgetChek composes the ENTIRE displayed
// answer from validated, structured pieces. There is no free-text field
// anywhere in the contract, so there is nothing left for the model to
// write a raw figure, a raw entity name, or an unvalidated financial
// assertion into.
// ---------------------------------------------------------------------------

export const FRAMING_CODES = [
  "hypothetical_notice",
  "user_choice_acknowledgement",
  "external_information_unavailable",
  "needs_more_information",
  "plan_context",
] as const;

/** BudgetChek's own fixed, closed set of conversational framing
 *  sentences -- for connective/meta text that carries NO financial
 *  meaning at all. */
function renderFramingSentence(code: FramingCode): string {
  switch (code) {
    case "hypothetical_notice":
      return "Just so you're clear, this is a hypothetical, not your actual plan.";
    case "user_choice_acknowledgement":
      return "That's your call to make -- I can show how the numbers look without treating it as my own recommendation.";
    case "external_information_unavailable":
      return "That's not something BudgetChek has for your plan -- there's no outside rate, average, or policy to check against here.";
    case "needs_more_information":
      return "I don't have enough here to answer that without guessing.";
    case "plan_context":
      return "Here's what that looks like based on your real numbers.";
  }
}

/** State codes whose resolveStateClaim branch opens the formatted
 *  string directly with the raw, on-file entity name (via
 *  extractEntityName), never BudgetChek's own generic lead-in wording.
 *  The other 4 state codes (plan_complete/incomplete, has_shortfall/
 *  no_shortfall) are whole-plan claims with no target and always open
 *  with fixed wording ("the plan...", "there is..."). */
const ENTITY_LED_STATE_CODES = new Set<string>([
  "bill_paid",
  "bill_unpaid",
  "due_present",
  "due_missing",
  "in_window",
  "out_of_window",
  "reserved_tapped",
  "reserved_not_tapped",
]);

/** True if a resolved claim's formatted phrase begins directly with a
 *  raw, on-file entity name at position 0 -- round-9 adversarial
 *  review: claimAsSentence used to blanket-capitalize the first
 *  character of EVERY formatted string, which silently mutated a real
 *  entity name that happens to start lowercase ("eBay card" ->
 *  "EBay card"), contradicting this module's own guarantee that entity
 *  identity is rendered exactly as BudgetChek authored it from
 *  validated data. A 'fact' claim's authoritativePhrase always opens
 *  with the entity name; a 'derived' claim's derivedHypotheticalPhrase
 *  never does (it opens with "using..."). */
function isEntityLedClaim(claim: Claim): boolean {
  if (claim.kind === "fact") return true;
  if (claim.kind === "state" && claim.stateCode) return ENTITY_LED_STATE_CODES.has(claim.stateCode);
  return false;
}

/** Turns a resolved claim phrase (a noun phrase like "Rent's amount
 *  ($900.00)", a state clause like "the plan is complete", or a bare
 *  value like "$300.00") into a complete, period-terminated sentence
 *  for standalone display as its own answerPart. Only capitalizes the
 *  leading character when the phrase is NOT entity-led -- an
 *  entity-led phrase is emitted byte-for-byte as BudgetChek's own
 *  renderer produced it, since a lowercase-leading real name (an
 *  entity someone actually typed, like "eBay card") is normal, correct
 *  English on its own ("eBay's balance is $300.00." needs no cap) and
 *  must never be silently altered. */
function claimAsSentence(formatted: string, entityLed: boolean): string {
  if (entityLed) {
    return /[.!?]$/.test(formatted) ? formatted : `${formatted}.`;
  }
  const cap = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  return /[.!?]$/.test(cap) ? cap : `${cap}.`;
}

/** Renders a missing item as a clarifying question, from the same
 *  closed MissingCode + optional real entity name missingPhrase already
 *  uses for the safe fallback -- no free text here either. */
function missingAsQuestion(item: MissingItem): string {
  if (item.code === "missing_other") return "Can you tell me more about what's missing?";
  return `What's ${missingPhrase(item)}?`;
}

type RenderResult =
  | { ok: true; rendered: string; resolvedFacts: UsedFact[] }
  | { ok: false; reason: string; offendingToken?: string };

/** Renders the ordered answerParts list into the final displayed answer.
 *  Every word comes from a BudgetChek-authored renderer keyed to a
 *  validated, structured part -- a claim's authoritative phrase, a
 *  missing item's question, the validated action/decision sentence, or
 *  one of five fixed framing sentences. The model only ever picks WHICH
 *  parts are relevant and in what order; it never supplies a word of the
 *  rendered text itself. */
function renderAnswerParts(
  response: AskResponseContract,
  payload: Record<string, unknown>,
  currentUserMessage: string,
): RenderResult {
  const { answerParts, claims, missing, nextActionType, action, decision } = response;

  if (!Array.isArray(answerParts) || answerParts.length === 0) {
    return { ok: false, reason: "answerParts must contain at least one part" };
  }

  const sentences: string[] = [];
  const resolvedFacts: UsedFact[] = [];
  let actionParts = 0;
  let decisionParts = 0;
  let claimParts = 0;

  for (const part of answerParts) {
    switch (part.type) {
      case "claim": {
        claimParts++;
        if (part.claimIndex < 0 || part.claimIndex >= claims.length) {
          return {
            ok: false,
            reason: `answerParts references claim ${part.claimIndex} which doesn't exist in claims`,
          };
        }
        const claim = claims[part.claimIndex];
        const res = resolveClaim(claim, payload, currentUserMessage);
        if (!res.ok) return { ok: false, reason: res.reason, offendingToken: res.offendingToken };
        sentences.push(claimAsSentence(res.formatted, isEntityLedClaim(claim)));
        resolvedFacts.push({
          label: res.formatted,
          value: res.formatted,
          source:
            claim.kind === "derived" ? "derived" : claim.kind === "state" ? "state" : "snapshot",
        });
        break;
      }
      case "missing": {
        if (part.missingIndex < 0 || part.missingIndex >= missing.length) {
          return {
            ok: false,
            reason: `answerParts references missing ${part.missingIndex} which doesn't exist in missing`,
          };
        }
        const item = missing[part.missingIndex];
        const v = validateMissingItem(item, payload);
        if (!v.ok) return { ok: false, reason: v.reason };
        sentences.push(missingAsQuestion(item));
        break;
      }
      case "action": {
        actionParts++;
        if (nextActionType !== "concrete_action") {
          return { ok: false, reason: "an action part requires nextActionType concrete_action" };
        }
        if (!action) return { ok: false, reason: "concrete_action requires a structured action" };
        sentences.push(renderActionSentence(action, payload));
        break;
      }
      case "decision": {
        decisionParts++;
        if (nextActionType !== "user_decision") {
          return { ok: false, reason: "a decision part requires nextActionType user_decision" };
        }
        if (!decision) return { ok: false, reason: "user_decision requires a structured decision" };
        sentences.push(renderDecisionSentence(decision, payload));
        break;
      }
      case "framing": {
        sentences.push(renderFramingSentence(part.code));
        break;
      }
    }
  }

  if (actionParts > 1) {
    return { ok: false, reason: "answerParts may contain at most one action part" };
  }
  if (nextActionType === "concrete_action" && actionParts !== 1) {
    return { ok: false, reason: "concrete_action requires exactly one action part in answerParts" };
  }
  if (decisionParts > 1) {
    return { ok: false, reason: "answerParts may contain at most one decision part" };
  }
  if (nextActionType === "user_decision" && decisionParts !== 1) {
    return { ok: false, reason: "user_decision requires exactly one decision part in answerParts" };
  }
  if (nextActionType === "lookup_value" && claimParts < 1) {
    return { ok: false, reason: "lookup_value requires at least one claim part in answerParts" };
  }

  return { ok: true, rendered: sentences.join(" "), resolvedFacts };
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
 *  minimum" labeling convention -- a debt's current-cycle funding-plan
 *  line item IS its minimum payment, never its balance, which is why
 *  only "amount" (bill) and "minimum" (debt) are matched here at all.
 *  Round-9 adversarial review found this label-only matching could
 *  misattribute a bill's funded status to a same-labeled debt minimum
 *  (or vice versa) with no kind to disambiguate, and separately that
 *  two real entities sharing a display name defeated it too -- both
 *  closed by requiring the item's own `kind` (decision-engine.ts now
 *  stamps every RankedItem with one) to match AND requiring the match
 *  be UNIQUE; more than one candidate is treated as "can't prove it"
 *  the same as zero, never guessed at via array order. */
function matchingFundingItemIndices(
  kind: "bill" | "debt",
  name: string,
  items: unknown[],
): number[] {
  const expectedLabel = kind === "bill" ? name.toLowerCase() : `${name.toLowerCase()} minimum`;
  const out: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    if (typeof it.label !== "string" || it.label.toLowerCase() !== expectedLabel) continue;
    if (it.kind !== kind) continue;
    out.push(i);
  }
  return out;
}

function isShortfallAffectedTarget(fieldPath: string, payload: Record<string, unknown>): boolean {
  const m = fieldPath.match(/^(bill|debt):(.+)\.(amount|minimum)$/);
  if (!m) return false;
  const [, kind, name] = m;
  const snap = (payload.snapshot ?? {}) as Record<string, unknown>;
  const funding = snap.funding as { items?: unknown; cutoffIndex?: number } | undefined;
  const items = funding?.items;
  if (!Array.isArray(items)) return false;
  const cutoff = typeof funding?.cutoffIndex === "number" ? funding.cutoffIndex : -1;
  const matches = matchingFundingItemIndices(kind as "bill" | "debt", name, items);
  if (matches.length !== 1) return false; // not found, or ambiguous -- never guess
  const i = matches[0];
  const status = (items[i] as Record<string, unknown>).status;
  if (status === "partial" || status === "unfunded") return true;
  if (cutoff >= 0 && i >= cutoff) return true;
  return false;
}

/** The funding-plan line item this fieldPath matches (kind + label,
 *  see matchingFundingItemIndices), or null if none -- or more than
 *  one -- matches. "Not found" and "ambiguous" are both treated as
 *  "can't prove funded" by every caller, never as "assume funded". */
function findFundingItem(
  fieldPath: string,
  payload: Record<string, unknown>,
): Record<string, unknown> | null {
  const m = fieldPath.match(/^(bill|debt):(.+)\.(amount|minimum)$/);
  if (!m) return null;
  const [, kind, name] = m;
  const snap = (payload.snapshot ?? {}) as Record<string, unknown>;
  const funding = snap.funding as { items?: unknown } | undefined;
  const items = funding?.items;
  if (!Array.isArray(items)) return null;
  const matches = matchingFundingItemIndices(kind as "bill" | "debt", name, items);
  if (matches.length !== 1) return null;
  return items[matches[0]] as Record<string, unknown>;
}

/** Is this real, in-window obligation actually FUNDED by the ranked
 *  plan -- not merely a structurally valid target? A bill or debt
 *  minimum can be genuinely due in-window and still be "partial" or
 *  "unfunded" because a higher-priority obligation used up the money
 *  first. hold_for_due_item/pay_required_minimum must never advise
 *  paying/holding the full amount in that case -- that's what
 *  review_shortfall_item/review_obligation_options are for. Since
 *  buildFundingPlan allocates strictly in rank order, this same check
 *  also structurally prevents ever recommending a LOWER-priority
 *  obligation ("pay the Visa minimum") while a HIGHER-priority one
 *  (Housing) is still short -- a lower-tier item cannot be "funded"
 *  while an earlier, higher-tier item in the same plan is not. Not
 *  found in the plan at all counts as NOT funded -- there's nothing to
 *  prove it with. */
function isFundingItemFunded(fieldPath: string, payload: Record<string, unknown>): boolean {
  const item = findFundingItem(fieldPath, payload);
  return item?.status === "funded";
}

/** Is this specific bill already marked paid? Debts have no "paid"
 *  field (they're an ongoing balance, not a one-off bill), so this only
 *  ever applies to a bill:<name>.* fieldPath. */
function isBillAlreadyPaid(fieldPath: string, payload: Record<string, unknown>): boolean {
  const m = fieldPath.match(/^bill:(.+)\.[a-zA-Z]+$/);
  if (!m) return false;
  const resolved = resolveFieldPath(`bill:${m[1]}.paid`, payload);
  return resolved?.value === true;
}

/** Debts whose minimum is real but whose due date is genuinely unknown
 *  (never silently assumed either way) -- read straight off the real
 *  funding plan decision-engine.ts now excludes them from, so this
 *  module never needs to re-derive it. Empty array (not found /
 *  malformed) if the field is absent, never a guess. */
function debtsWithUnknownTiming(
  payload: Record<string, unknown>,
): { id: string; creditor: string; minPayment: number }[] {
  const snap = (payload.snapshot ?? {}) as Record<string, unknown>;
  const funding = snap.funding as { debtsWithUnknownTiming?: unknown } | undefined;
  const list = funding?.debtsWithUnknownTiming;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (d): d is { id: string; creditor: string; minPayment: number } =>
      !!d &&
      typeof d === "object" &&
      typeof (d as Record<string, unknown>).creditor === "string" &&
      typeof (d as Record<string, unknown>).minPayment === "number",
  );
}

/** The RAW count of funding.debtsWithUnknownTiming, not the strictly-
 *  typed filtered count above. Round-9 adversarial review: the
 *  has_shortfall/no_shortfall/no_action_needed caveat used to gate
 *  purely on debtsWithUnknownTiming(payload).length -- so a real,
 *  non-empty array whose entries didn't happen to match the exact
 *  expected shape (wrong-typed creditor/minPayment, or a missing field)
 *  produced the EXACT SAME caveat-free rendering as a genuinely empty
 *  array, silently suppressing or undercounting the honest disclosure
 *  that a real debt's timing was never evaluated. The caveat text only
 *  ever needs a COUNT (singular vs plural), never individual creditor
 *  names, so counting the raw array -- a deterministic fact straight off
 *  the JSON, never a guess -- is enough to close this without needing
 *  every entry to be well-formed. */
function debtsWithUnknownTimingCount(payload: Record<string, unknown>): number {
  const snap = (payload.snapshot ?? {}) as Record<string, unknown>;
  const funding = snap.funding as { debtsWithUnknownTiming?: unknown } | undefined;
  const list = funding?.debtsWithUnknownTiming;
  return Array.isArray(list) ? list.length : 0;
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
        if (isBillAlreadyPaid(action.targetFieldPath, payload)) {
          return fail(
            "hold_for_due_item target bill is already marked paid -- nothing left to hold money for",
          );
        }
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
        if (!isFundingItemFunded(action.targetFieldPath, payload)) {
          return fail(
            "hold_for_due_item target is not actually funded by the ranked plan -- a higher-priority obligation used the money first; use review_shortfall_item or review_obligation_options instead",
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
        if (!isFundingItemFunded(action.targetFieldPath, payload)) {
          return fail(
            "hold_for_due_item target is not actually funded by the ranked plan -- a higher-priority obligation used the money first; use review_shortfall_item or review_obligation_options instead",
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
      const dueMatch = action.targetFieldPath.match(/^(bill|debt):(.+)\.due$/);
      if (!dueMatch) {
        return fail("review_due_date target must be a bill or debt's due field");
      }
      const [, dueKind, dueName] = dueMatch;
      // Round-9 adversarial review: this action had NO funded-status or
      // paid-status check at all, unlike every sibling that can target
      // the same bill/debt -- it passed unconditionally for an already-
      // paid bill, and for a genuinely partial/unfunded item during a
      // real shortfall, overlapping with review_shortfall_item's
      // precondition space but rendering materially weaker (misleading
      // by omission) advice for the identical target.
      if (dueKind === "bill" && isBillAlreadyPaid(action.targetFieldPath, payload)) {
        return fail(
          "review_due_date target bill is already marked paid -- nothing left to review for it",
        );
      }
      const resolved = resolveFieldPath(action.targetFieldPath, payload);
      if (!resolved || typeof resolved.value !== "string") {
        return fail("review_due_date target has no due date on file to review");
      }
      const ownItemFieldPath =
        dueKind === "bill" ? `bill:${dueName}.amount` : `debt:${dueName}.minimum`;
      if (
        typeof funding?.shortfall === "number" &&
        funding.shortfall > 0 &&
        isShortfallAffectedTarget(ownItemFieldPath, payload)
      ) {
        return fail(
          "review_due_date target is affected by a real shortfall this cycle -- use review_shortfall_item or review_obligation_options instead, which actually say so",
        );
      }
      return { ok: true };
    }

    case "add_missing_due_date": {
      if (!action.targetFieldPath) return fail("add_missing_due_date requires a targetFieldPath");
      // Bills only -- a debt has no due-date field in the product at
      // all today (no persistent column, no UI field), so recommending
      // "add" one for a debt would itself be dishonest. See
      // debt_timing_unavailable for the debt equivalent.
      if (!/^bill:(.+)\.due$/.test(action.targetFieldPath)) {
        return fail(
          "add_missing_due_date target must be a bill's due field -- a debt has no due-date field to add at all; use debt_timing_unavailable instead",
        );
      }
      if (isBillAlreadyPaid(action.targetFieldPath, payload)) {
        return fail(
          "add_missing_due_date target bill is already marked paid -- nothing left to add a due date for",
        );
      }
      const resolved = resolveFieldPath(action.targetFieldPath, payload);
      if (!resolved) return fail("add_missing_due_date target does not resolve to a real item");
      if (resolved.value !== null)
        return fail("add_missing_due_date target already has a due date on file");
      return { ok: true };
    }

    case "debt_timing_unavailable": {
      if (!action.targetFieldPath)
        return fail("debt_timing_unavailable requires a targetFieldPath");
      const m = action.targetFieldPath.match(/^debt:(.+)\.minimum$/);
      if (!m) return fail("debt_timing_unavailable target must be a debt's minimum field");
      const min = resolveFieldPath(action.targetFieldPath, payload);
      if (!min || typeof min.value !== "number") {
        return fail("debt_timing_unavailable target does not resolve to a real minimum payment");
      }
      // Round-9 adversarial review: a minimum of 0 (or negative) has no
      // real obligation to report a timing problem for -- pay_required_-
      // minimum gets this protection for free via isFundingItemFunded
      // (buildFundingPlan excludes non-positive minimums entirely), but
      // this action bypasses funding.items altogether, so the check
      // must be explicit here.
      if (!(min.value > 0)) {
        return fail(
          "debt_timing_unavailable target does not have a real, positive minimum payment obligation to report a timing problem for",
        );
      }
      const due = resolveFieldPath(`debt:${m[1]}.due`, payload);
      if (due && due.value !== null) {
        return fail(
          "debt_timing_unavailable target already has a real due date on file -- use review_due_date or pay_required_minimum instead",
        );
      }
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
      if (!isFundingItemFunded(action.targetFieldPath, payload)) {
        return fail(
          "pay_required_minimum target is not actually funded by the ranked plan -- a higher-priority obligation used the money first; use review_shortfall_item or review_obligation_options instead",
        );
      }
      return { ok: true };
    }

    case "review_shortfall_item": {
      if (!action.targetFieldPath) return fail("review_shortfall_item requires a targetFieldPath");
      // The current-cycle obligation for a debt is its required MINIMUM,
      // never its total balance -- the funding plan's own line item for
      // a debt IS its minimum payment (see isShortfallAffectedTarget's
      // "<name> minimum" label match). No debt:<name>.balance shape.
      const billMatch = action.targetFieldPath.match(/^bill:(.+)\.amount$/);
      const debtMinMatch = action.targetFieldPath.match(/^debt:(.+)\.minimum$/);
      if (!billMatch && !debtMinMatch) {
        return fail(
          "review_shortfall_item target must be a real bill amount, or a real debt's minimum payment -- never a debt's total balance for a current-cycle obligation",
        );
      }
      if (billMatch && isBillAlreadyPaid(action.targetFieldPath, payload)) {
        return fail(
          "review_shortfall_item target bill is already marked paid -- nothing left to review for it",
        );
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
      // Same debt-timing evidence requirement as pay_required_minimum /
      // hold_for_due_item / review_obligation_options -- all four
      // current-cycle obligation actions must agree on this.
      const name = billMatch ? billMatch[1] : debtMinMatch![1];
      const kind = billMatch ? "bill" : "debt";
      const due = resolveFieldPath(`${kind}:${name}.due`, payload);
      if (!due || typeof due.value !== "string") {
        return fail(
          "review_shortfall_item requires a real due date on file -- BudgetChek does not guess timing; use add_missing_due_date or ask instead",
        );
      }
      if (!window || !withinWindow(due.value, window)) {
        return fail(
          "review_shortfall_item target's due date is not within the current planning window",
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
      if (billMatch && isBillAlreadyPaid(action.targetFieldPath, payload)) {
        return fail(
          "review_obligation_options target bill is already marked paid -- nothing left to review for it",
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
      const m = action.targetFieldPath?.match(/^bill:(.+)\.due$/);
      const name = m?.[1] ?? "this item";
      return `Add the due date for ${name} -- it isn't on file yet.`;
    }
    case "debt_timing_unavailable": {
      const m = action.targetFieldPath?.match(/^debt:(.+)\.minimum$/);
      const name = m?.[1] ?? "this debt";
      return `BudgetChek doesn't have ${name}'s due date yet, so its minimum payment can't be placed in this paycheck window without guessing.`;
    }
    case "pay_required_minimum": {
      const m = action.targetFieldPath?.match(/^debt:(.+)\.minimum$/);
      const name = m?.[1] ?? "this debt";
      return `Pay the required minimum of ${moneyOr(action.targetFieldPath ?? "", "the minimum")} on ${name}, due ${dateOr(`debt:${name}.due`, "soon")}.`;
    }
    case "review_shortfall_item": {
      const m = action.targetFieldPath?.match(/^(?:bill:(.+)\.amount|debt:(.+)\.minimum)$/);
      const name = m?.[1] ?? m?.[2] ?? "this item";
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
    case "no_action_needed": {
      // "No action needed" means no PLAN CHANGE is needed -- never
      // "nothing to pay". Real scheduled obligations may still be due;
      // this just says the plan doesn't need an exception. It also
      // never implies debt timing was fully evaluated when it wasn't.
      // Round-9 review, two wording fixes: (1) uses the RAW count (see
      // debtsWithUnknownTimingCount) so a malformed entry can't
      // silently suppress the caveat; (2) the caveat is now fused into
      // the SAME sentence as the reassurance, matching the
      // has_shortfall/no_shortfall pattern -- a caveat tacked on as a
      // separate trailing sentence after an unqualified "No plan change
      // is needed right now" read as tonally self-contradictory.
      const unknownCount = debtsWithUnknownTimingCount(payload);
      const caveat =
        unknownCount > 0
          ? ` for what BudgetChek can verify, though this doesn't cover ${unknownCount === 1 ? "a debt minimum" : "some debt minimums"} with no known due date, which BudgetChek can't place in this window`
          : "";
      // Also: the second sentence used to always presuppose scheduled
      // items exist, even when funding.items is genuinely empty.
      const noActionSnap = (payload.snapshot ?? {}) as Record<string, unknown>;
      const noActionFunding = noActionSnap.funding as { items?: unknown } | undefined;
      const hasScheduledItems =
        Array.isArray(noActionFunding?.items) && noActionFunding.items.length > 0;
      const secondSentence = hasScheduledItems
        ? " Keep following the items already scheduled in this paycheck window."
        : " Nothing is due in this paycheck window right now.";
      return `No plan change is needed right now${caveat}.${secondSentence}`;
    }
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
      // Round-9 adversarial review: validateDecision's discretionaryRoom
      // gate only proves aggregate room across the whole plan -- it says
      // nothing about whether THIS specific debt's own required minimum
      // is even accounted for this cycle. Offering extra principal on a
      // debt whose own obligation is unverified (or genuinely due and
      // still short-funded) is the same class of gap Part C closed for
      // the action codes; a discretionary decision needs the identical
      // guard. Per this file's own comments, every debt's due date is
      // null in production today, so debtsWithUnknownTiming is the
      // deciding factor for essentially every real debt right now --
      // an honest reflection of what can't yet be verified, not an
      // overreach.
      const debtName = m[1];
      if (debtsWithUnknownTiming(payload).some((d) => d.creditor === debtName)) {
        return fail(
          "prioritize_extra_debt_payment target's own required minimum has unknown timing this cycle -- BudgetChek cannot confirm it's accounted for before offering extra principal on top of it",
        );
      }
      const optSnap = (payload.snapshot ?? {}) as Record<string, unknown>;
      const optWindow = (optSnap.window ?? null) as { start: string; end: string } | null;
      const due = resolveFieldPath(`debt:${debtName}.due`, payload);
      if (
        optWindow &&
        due &&
        typeof due.value === "string" &&
        withinWindow(due.value, optWindow) &&
        !isFundingItemFunded(`debt:${debtName}.minimum`, payload)
      ) {
        return fail(
          "prioritize_extra_debt_payment target's own required minimum is due this cycle but not yet funded by the ranked plan -- resolve that first before offering extra principal on top of it",
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
  const funding = snap.funding as
    { shortfall?: number; available?: number; totalRequested?: number } | undefined;
  if (snap.complete !== true || (typeof funding?.shortfall === "number" && funding.shortfall > 0)) {
    return fail(
      "a discretionary decision requires the plan to be complete with no real shortfall -- a real shortfall must be reviewed first, not offered as an equivalent choice",
    );
  }
  // Complete + no shortfall isn't enough on its own -- available could
  // exactly equal totalRequested, leaving genuinely nothing free to
  // allocate. A real discretionary decision requires real room above
  // what's already required. Round-9 adversarial review: typeof alone
  // is true for NaN/Infinity too (a JSON numeric literal with a huge
  // exponent like 1e400 silently overflows to Infinity on parse, which
  // is NOT a NaN-shaped value and so isn't caught by a naive check), and
  // neither Infinity nor a negative available/totalRequested pair is a
  // legitimate discretionary-room signal -- Number.isFinite plus a
  // non-negativity requirement on both figures closes all three.
  const available = funding?.available;
  const totalRequested = funding?.totalRequested;
  if (
    typeof available === "number" &&
    typeof totalRequested === "number" &&
    Number.isFinite(available) &&
    Number.isFinite(totalRequested) &&
    available >= 0 &&
    totalRequested >= 0
  ) {
    const discretionaryRoom = round2(available - totalRequested);
    if (!(discretionaryRoom > 0)) {
      return fail(
        "a discretionary decision requires real discretionary room above what's already required -- available funds exactly cover (or fall short of) required obligations, leaving nothing free to allocate",
      );
    }
  } else {
    return fail(
      "a discretionary decision requires a computed funding plan with known, finite, non-negative available/totalRequested figures to prove real discretionary room exists",
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
 *  closed ActionCode/DecisionCode vocabularies and the closed
 *  answerParts composition are). Catches the responsible-obligation
 *  guardrail's target intent slipping into the final rendered text via a
 *  bug in one of the renderers above -- under a correct implementation
 *  there is no channel for the model's own words to reach this text at
 *  all, so this should never actually fire in practice either. */
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
// running as defense-in-depth alongside the structured "state" claim
// kind (see resolveStateClaim above), per instruction to keep this
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

  // insufficient_data: BudgetChek's own fixed safe-fallback wording only
  // -- never model-authored content, regardless of what answerParts
  // contains, per instruction. The missing-item validation loop still
  // runs (for accurate server-side diagnostics when a model lies about
  // missing data), but the DISPLAYED text is always built from
  // safeMissing either way, so nothing false can ever reach it.
  if (response.nextActionType === "insufficient_data") {
    for (const item of response.missing) {
      const v = validateMissingItem(item, payload);
      if (!v.ok) return { grounded: false, reason: v.reason, safeMissing };
    }
    return {
      grounded: true,
      renderedAnswer: safeFallback(safeMissing),
      resolvedFacts: [],
      safeMissing,
    };
  }

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

  // Defense #2: compose the answer entirely from BudgetChek-authored
  // parts. There is no free-text field anywhere in the contract, so
  // there is nothing left to reverse-validate -- none of this text was
  // ever written by the model.
  const rendered = renderAnswerParts(response, payload, ctx.currentUserMessage);
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
  "debt_timing_unavailable",
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
  kind: z.enum(["fact", "derived", "state"]),
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

const AnswerPartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("claim"), claimIndex: z.number().int().min(0) }),
  z.object({ type: z.literal("missing"), missingIndex: z.number().int().min(0) }),
  z.object({ type: z.literal("action") }),
  z.object({ type: z.literal("decision") }),
  z.object({ type: z.literal("framing"), code: z.enum(FRAMING_CODES) }),
]);

const AskResponseSchema = z.object({
  answerParts: z.array(AnswerPartSchema).min(1),
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
 *  requires a structured action AND exactly one action part in
 *  answerParts (never more, never for another nextActionType);
 *  "user_decision" the same for a structured decision (>= 2 options) and
 *  exactly one decision part; "lookup_value" requires at least one claim
 *  part; "fact"/"derived" claims require a fieldPath; "derived" claims
 *  additionally require operation + userOperand (resolveClaim proves
 *  the operand is genuinely money AND that the target is genuinely
 *  referenced in the current message -- this is only shape-level);
 *  "state" claims require a stateCode; every claim/missing index an
 *  answerPart references must actually exist. Tolerant of surrounding
 *  prose/markdown fences around the JSON object, never tolerant of the
 *  shape once found. Note: neither an "answer" string field (the pre-v6
 *  removed free-text contract) nor a "user_input" claim kind (the
 *  pre-v7 removed echo-back mechanism) is ever accepted, even if present
 *  in the raw JSON -- "answer" is silently dropped by the schema, and
 *  "user_input" as a kind value fails the enum outright. */
export function parseContract(raw: string): AskResponseContract | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    const result = AskResponseSchema.safeParse(parsed);
    if (!result.success) return null;
    const { answerParts, claims, missing, nextActionType, action, decision } = result.data;

    if (nextActionType === "concrete_action" && !action) return null;
    if (nextActionType === "user_decision" && (!decision || decision.options.length < 2)) {
      return null;
    }

    for (const claim of claims) {
      if ((claim.kind === "fact" || claim.kind === "derived") && !claim.fieldPath) return null;
      if (claim.kind === "derived" && (!claim.operation || !claim.userOperand)) return null;
      if (claim.kind === "state" && !claim.stateCode) return null;
    }

    const actionPartCount = answerParts.filter((p) => p.type === "action").length;
    const decisionPartCount = answerParts.filter((p) => p.type === "decision").length;
    const claimPartCount = answerParts.filter((p) => p.type === "claim").length;
    if (actionPartCount !== (nextActionType === "concrete_action" ? 1 : 0)) return null;
    if (decisionPartCount !== (nextActionType === "user_decision" ? 1 : 0)) return null;
    if (nextActionType === "lookup_value" && claimPartCount < 1) return null;

    for (const part of answerParts) {
      if (part.type === "claim" && part.claimIndex >= claims.length) return null;
      if (part.type === "missing" && part.missingIndex >= missing.length) return null;
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
