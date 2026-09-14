// Deterministic, network-free proof that src/lib/grounding.ts actually
// rejects what it claims to reject and accepts what it should accept.
//
// This is the pure-function half of the Ask a Question trust matrix. The
// other half (scripts referenced in the PR description) drives the real
// chat endpoint end to end against the live model. This script proves the
// validator's OWN logic is sound and repeatable, independent of whatever
// the model happens to say on a given run.
//
// Run with: npx tsx scripts/prove-grounding.ts

import { checkGrounding, safeFallback, type AskResponseContract } from "../src/lib/grounding";

// A representative snapshot, shaped like what money-meeting.tsx actually
// sends -- EngineSnapshot fields plus the `context` object, JSON.stringified
// exactly as the real handler receives it.
const SNAPSHOT = JSON.stringify({
  complete: true,
  todayIso: "2026-09-13",
  window: { start: "2026-09-13", end: "2026-09-20" },
  projection: {
    startingBalance: 640,
    projectedMinBalance: 335,
    lowPoint: { date: "2026-09-18", balance: 335 },
  },
  funding: {
    available: 640,
    items: [
      {
        id: "1",
        label: "Rent",
        amount: 900,
        tier: 1,
        tierLabel: "Housing",
        dueDate: "2026-09-20",
        reasonMoved: null,
        funded: 900,
        status: "funded",
      },
      {
        id: "2",
        label: "Car loan",
        amount: 205,
        tier: 2,
        tierLabel: "Secured debt",
        dueDate: "2026-09-18",
        reasonMoved: null,
        funded: 205,
        status: "funded",
      },
    ],
    cutoffIndex: -1,
    totalRequested: 205,
    shortfall: 0,
    takeaway: "You're covered through the 20th, with $335.00 estimated to remain.",
  },
  rebuilds: [],
  reservedTotal: 100,
  headline: "You're covered through the 20th, with $335.00 estimated to remain.",
  accounts: [{ name: "Everyday checking", kind: "checking", balance: 640, limit: null }],
  reserved: [
    { label: "Car repair fund", amount: 100, tapped: 0, purpose: "Emergency car repairs" },
  ],
  bills: [{ name: "Rent", amount: 900, due: "2026-09-20", paid: false }],
  debts: [
    { name: "Visa card", balance: 1200, apr: 24.99, minimum: 35 },
    { name: "Store card", balance: 300, apr: 0, minimum: 25 },
  ],
  goals: [{ name: "Emergency fund", target: 1000, saved: 250 }],
  payFrequency: "biweekly",
  nextPayDate: "2026-09-20",
});

type Case = {
  name: string;
  userMessage: string;
  response: AskResponseContract;
  expectGrounded: boolean;
  /** Substring the failure reason must contain, when expectGrounded is false. */
  expectReasonIncludes?: string;
};

const CASES: Case[] = [
  {
    name: "grounded answer citing real snapshot figures",
    userMessage: "Am I okay until my next payday?",
    response: {
      answer:
        "You're covered through September 20 -- rent and the car loan are both funded, with $335.00 estimated to remain.",
      factsUsed: [
        { label: "Estimated remaining", value: "$335.00", source: "snapshot" },
        { label: "Window end", value: "September 20", source: "snapshot" },
      ],
      missing: [],
      nextActionType: "concrete_action",
    },
    expectGrounded: true,
  },
  {
    name: "invented dollar figure not anywhere in the snapshot",
    userMessage: "Am I okay until my next payday?",
    response: {
      answer: "You're in good shape -- you have $10,000.00 available after bills.",
      factsUsed: [{ label: "Available after bills", value: "$10,000.00", source: "snapshot" }],
      missing: [],
      nextActionType: "concrete_action",
    },
    expectGrounded: false,
    expectReasonIncludes: "dollar amount",
  },
  {
    name: "external average APR cited as if it were fact",
    userMessage: "What's the average credit card APR right now?",
    response: {
      answer: "The national average right now is around 24.5%, so yours is close to typical.",
      factsUsed: [],
      missing: ["a source for the national average APR"],
      nextActionType: "insufficient_data",
    },
    expectGrounded: false,
    expectReasonIncludes: "percentage",
  },
  {
    name: "legitimate explicit user hypothetical ($300 extra toward a debt)",
    userMessage: "What if I put an extra $300 toward the Visa card?",
    response: {
      answer:
        "That's a hypothetical, not your actual plan: putting an extra $300 toward the Visa card now would bring the balance from $1,200.00 down to $900.00, if you did it.",
      factsUsed: [
        { label: "Visa balance", value: "$1,200.00", source: "snapshot" },
        { label: "Hypothetical extra payment", value: "$300", source: "user_hypothetical" },
        { label: "Hypothetical resulting balance", value: "$900.00", source: "user_hypothetical" },
      ],
      missing: [],
      nextActionType: "user_decision",
    },
    expectGrounded: true,
  },
  {
    name: "invented figure dishonestly mislabeled as a user hypothetical",
    // The user typed a real hypothetical figure ($50); the model substitutes
    // a different, larger figure ($500) that neither the user typed nor any
    // combination of the snapshot with $50 produces. Rejected regardless of
    // whether the prose scan or the factsUsed cross-check catches it first --
    // either layer catching an invented figure is a correct outcome.
    userMessage: "What if I put an extra $50 toward the Visa card?",
    response: {
      answer: "If you put an extra $500 toward it, the balance would drop to $700.00.",
      factsUsed: [
        { label: "Hypothetical extra payment", value: "$500", source: "user_hypothetical" },
      ],
      missing: [],
      nextActionType: "user_decision",
    },
    expectGrounded: false,
  },
  {
    name: "fabricated due date not present in the snapshot",
    userMessage: "When is rent due?",
    response: {
      answer: "Rent is due September 30.",
      factsUsed: [{ label: "Rent due date", value: "September 30", source: "snapshot" }],
      missing: [],
      nextActionType: "lookup_value",
    },
    expectGrounded: false,
    expectReasonIncludes: "date",
  },
  {
    name: "real due date, correctly cited",
    userMessage: "When is rent due?",
    response: {
      answer: "Rent is due September 20, for $900.00.",
      factsUsed: [
        { label: "Rent due date", value: "September 20", source: "snapshot" },
        { label: "Rent amount", value: "$900.00", source: "snapshot" },
      ],
      missing: [],
      nextActionType: "lookup_value",
    },
    expectGrounded: true,
  },
  {
    name: "made-up bill name claimed as a snapshot fact",
    userMessage: "What's my biggest bill?",
    response: {
      answer: "Your biggest bill is your Yacht Insurance payment.",
      factsUsed: [{ label: "Biggest bill", value: "Yacht Insurance", source: "snapshot" }],
      missing: [],
      nextActionType: "lookup_value",
    },
    expectGrounded: false,
    expectReasonIncludes: "text isn't in it",
  },
  {
    name: "prompt-injection text inside a bill label, named but not echoed back",
    userMessage: "What should I pay first?",
    response: {
      // Correct behavior per the system prompt: name that a label contained
      // instruction-like text and that it's being ignored, WITHOUT quoting
      // its exact wording (especially not any dollar figure inside it) --
      // repeating it verbatim is what would make it show up as an
      // (unfounded) claim in the answer text.
      answer:
        "Rent is first, for $900.00, due September 20. One of your other bill labels contains text that looks like an attempted instruction -- I'm ignoring it and treating it strictly as a label, not repeating what it says.",
      factsUsed: [{ label: "Rent amount", value: "$900.00", source: "snapshot" }],
      missing: [],
      nextActionType: "concrete_action",
    },
    expectGrounded: true,
  },
];

let pass = 0;
let fail = 0;

for (const c of CASES) {
  const verdict = checkGrounding(c.response, {
    snapshotJson: SNAPSHOT,
    currentUserMessage: c.userMessage,
  });
  const ok =
    verdict.grounded === c.expectGrounded &&
    (c.expectReasonIncludes == null || (verdict.reason ?? "").includes(c.expectReasonIncludes));

  if (ok) {
    pass++;
    console.log(`PASS  ${c.name}`);
  } else {
    fail++;
    console.log(`FAIL  ${c.name}`);
    console.log(
      `      expected grounded=${c.expectGrounded}${c.expectReasonIncludes ? ` reason~="${c.expectReasonIncludes}"` : ""}`,
    );
    console.log(
      `      got      grounded=${verdict.grounded} reason=${JSON.stringify(verdict.reason)}`,
    );
  }
}

console.log("");
console.log(`safeFallback([]) -> ${JSON.stringify(safeFallback([]))}`);
console.log(
  `safeFallback(["your next pay date"]) -> ${JSON.stringify(safeFallback(["your next pay date"]))}`,
);

console.log("");
console.log(`${pass}/${CASES.length} grounding proof cases passed`);

if (fail > 0) {
  console.error(`${fail} grounding proof case(s) FAILED.`);
  process.exit(1);
}
