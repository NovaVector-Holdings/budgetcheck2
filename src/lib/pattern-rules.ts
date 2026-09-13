// Pattern detection on RAW transaction descriptions.
//
// Bank category tags are unreliable, so every row is re-read from its raw
// description before any budgeting math runs. The rule table is DATA, not
// hardcoded branching, so a person can extend it with their own phrases
// (stored in mm_pattern_rules) and it improves for them over time.
//
// Nothing here invents a number. A rule only relabels a row that already
// exists in the file the person uploaded.

export type PatternClass =
  | "cash_advance_repayment"
  | "penalty"
  | "bnpl"
  | "untracked_transfer"
  | "true_income"
  | "loan_principal"
  | "housing"
  | "utilities"
  | "food"
  | "transport"
  | "debt"
  | "health"
  | "insurance"
  | "subscription"
  | "personal"
  | "fun"
  | "other";

export interface ClassMeta {
  label: string;
  /** Why this class matters — shown to the person, never hidden. */
  why: string;
  /** True when the class is a warning sign rather than a plain category. */
  signal: boolean;
  /** Treated as leaky/discretionary for cap tracking. */
  leaky: boolean;
}

export const CLASS_META: Record<PatternClass, ClassMeta> = {
  cash_advance_repayment: {
    label: "Cash-advance repayment",
    why: "Paying back an app advance points to a paycheck-advance loop, where each advance makes the next one likelier.",
    signal: true,
    leaky: false,
  },
  penalty: {
    label: "Penalty or fee",
    why: "An overdraft, late, or returned-item fee is direct evidence that the buffer ran out.",
    signal: true,
    leaky: false,
  },
  bnpl: {
    label: "Buy-now-pay-later instalment",
    why: "These are real recurring debts that rarely appear in a budget, so they compound quietly.",
    signal: true,
    leaky: false,
  },
  untracked_transfer: {
    label: "Untracked transfer",
    why: "A transfer has no category, so the money vanishes from every budget view. Naming it is the single fastest fix.",
    signal: true,
    leaky: true,
  },
  true_income: {
    label: "Pay",
    why: "Separates real pay from advances and loans, so income isn't overstated.",
    signal: false,
    leaky: false,
  },
  loan_principal: {
    label: "Loan money in — not income",
    why: "Counting borrowed money as income inflates what looks affordable.",
    signal: true,
    leaky: false,
  },
  housing: { label: "Housing", why: "Rent or mortgage — the obligation that is never late.", signal: false, leaky: false },
  utilities: { label: "Utilities", why: "Fixed monthly service bills.", signal: false, leaky: false },
  food: { label: "Food", why: "Groceries and eating out, sized to the pay cycle.", signal: false, leaky: true },
  transport: { label: "Getting around", why: "Fuel, transit, and car costs.", signal: false, leaky: false },
  debt: { label: "Debt payment", why: "A payment toward a balance you owe.", signal: false, leaky: false },
  health: { label: "Health", why: "Care, prescriptions, and copays.", signal: false, leaky: false },
  insurance: { label: "Insurance", why: "Premiums, which often bill every six months rather than monthly.", signal: false, leaky: false },
  subscription: { label: "Subscription", why: "Small repeating charges that are easy to forget.", signal: false, leaky: true },
  personal: { label: "Personal", why: "Everyday personal spending.", signal: false, leaky: true },
  fun: { label: "Fun", why: "Discretionary spending — the part a cap belongs on.", signal: false, leaky: true },
  other: { label: "Unlabelled", why: "Nothing in the description matched a known pattern.", signal: false, leaky: true },
};

export interface PatternRule {
  id: string;
  /** Case-insensitive regular expression source, matched against the raw description. */
  pattern: string;
  classify_as: PatternClass;
  note: string;
  /** Which direction of money the rule applies to. */
  appliesTo: "out" | "in" | "any";
  source: "default" | "user";
  /** User rules can be switched off without deleting them. */
  active?: boolean;
}

/**
 * The shipped rule table. Sources are the descriptions themselves — these are
 * merchant and product names, not claims about anyone's finances.
 */
export const DEFAULT_PATTERN_RULES: PatternRule[] = [
  { id: "d-advance", pattern: "earnin.*repay|earnin|\\bdave\\b|brigit|empower cash|cleo advance", classify_as: "cash_advance_repayment", note: "Paycheck-advance app", appliesTo: "out", source: "default" },
  { id: "d-penalty", pattern: "overdraft|\\bnsf\\b|insufficient funds|late fee|returned item|service (charge|fee)|maintenance fee", classify_as: "penalty", note: "Fee charged by the bank or a lender", appliesTo: "out", source: "default" },
  { id: "d-bnpl", pattern: "klarna|afterpay|sezzle|\\bzip( pay)?\\b|possible finance|affirm|quadpay", classify_as: "bnpl", note: "Buy-now-pay-later instalment", appliesTo: "out", source: "default" },
  { id: "d-transfer", pattern: "apple cash|venmo|zelle|cash app|cashapp|paypal|transfer|wire|withdrawal|atm", classify_as: "untracked_transfer", note: "Money moved without a category", appliesTo: "out", source: "default" },
  { id: "d-income", pattern: "payroll|direct dep|dir dep|salary|\\bpay(check|roll)\\b|employer", classify_as: "true_income", note: "Looks like pay from work", appliesTo: "in", source: "default" },
  { id: "d-loan-in", pattern: "loan (proceeds|advance|disbursement)|earnin|\\bdave\\b|brigit|affirm|klarna|oportun|opploans|lendup|cash advance", classify_as: "loan_principal", note: "Money in from a lender, not earnings", appliesTo: "in", source: "default" },
  { id: "d-housing", pattern: "rent|mortgage|landlord|property mgmt|apartment|leasing", classify_as: "housing", note: "Housing", appliesTo: "out", source: "default" },
  { id: "d-utilities", pattern: "electric|power co|water (dept|util)|\\bgas co\\b|internet|comcast|xfinity|spectrum|at&t|verizon|t-mobile|utility", classify_as: "utilities", note: "Utility or phone bill", appliesTo: "out", source: "default" },
  { id: "d-insurance", pattern: "geico|state farm|progressive|allstate|insurance|premium", classify_as: "insurance", note: "Insurance premium — often a 6-month bill", appliesTo: "out", source: "default" },
  { id: "d-food", pattern: "grocer|kroger|aldi|safeway|walmart|publix|trader joe|whole foods|restaurant|doordash|uber eats|grubhub|starbucks|coffee|cafe|pizza|mcdonald", classify_as: "food", note: "Food", appliesTo: "out", source: "default" },
  { id: "d-transport", pattern: "shell|chevron|exxon|bp #|fuel|gas station|uber(?! eats)|lyft|transit|metro|parking|auto repair|tire|jiffy lube", classify_as: "transport", note: "Getting around", appliesTo: "out", source: "default" },
  { id: "d-debt", pattern: "card payment|cardmember|loan payment|student loan|navient|nelnet|creditcard|visa payment|autopay", classify_as: "debt", note: "Payment on a balance owed", appliesTo: "out", source: "default" },
  { id: "d-health", pattern: "pharmacy|cvs|walgreens|dental|dentist|clinic|hospital|medical|copay|optometr", classify_as: "health", note: "Health", appliesTo: "out", source: "default" },
  { id: "d-subscription", pattern: "netflix|spotify|hulu|disney\\+|apple\\.com/bill|prime video|patreon|gym|planet fitness|membership|subscription", classify_as: "subscription", note: "Repeating small charge", appliesTo: "out", source: "default" },
  { id: "d-fun", pattern: "cinema|movie|ticketmaster|steam games|playstation|xbox|casino|bar &|tavern|liquor", classify_as: "fun", note: "Fun", appliesTo: "out", source: "default" },
];

export interface RuleHit {
  rule: PatternRule;
  classify_as: PatternClass;
}

function matches(rule: PatternRule, description: string, amount: number): boolean {
  const dir = amount < 0 ? "out" : "in";
  if (rule.appliesTo !== "any" && rule.appliesTo !== dir) return false;
  try {
    return new RegExp(rule.pattern, "i").test(description);
  } catch {
    // A bad user-entered pattern falls back to a plain substring test.
    return description.toLowerCase().includes(rule.pattern.toLowerCase());
  }
}

/**
 * Classifies a raw description. User rules are checked first so a personal
 * correction ("Kroger means rent for me") always beats a shipped default.
 */
export function classifyRaw(
  description: string,
  amount: number,
  userRules: PatternRule[] = [],
): RuleHit | null {
  for (const rule of [...userRules, ...DEFAULT_PATTERN_RULES]) {
    if (rule.active === false) continue;
    if (matches(rule, description, amount)) return { rule, classify_as: rule.classify_as };
  }
  return null;
}

export function classOf(description: string, amount: number, userRules: PatternRule[] = []): PatternClass {
  const hit = classifyRaw(description, amount, userRules);
  if (hit) return hit.classify_as;
  return amount > 0 ? "other" : "other";
}

export const LEAKY_CLASSES = (Object.keys(CLASS_META) as PatternClass[]).filter((k) => CLASS_META[k].leaky);
export const SIGNAL_CLASSES = (Object.keys(CLASS_META) as PatternClass[]).filter((k) => CLASS_META[k].signal);
