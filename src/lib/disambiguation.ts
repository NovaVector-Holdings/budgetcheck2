// The disambiguation loop.
//
// Before any analysis is finalised, rows that don't add up are turned into a
// short batch of questions. This is the highest-leverage accuracy step in the
// whole feature: one sharp question beats five generic ones, so it is capped at
// three per session and every question carries the reason it was asked.
//
// Real cases this catches: a large grocery-labelled charge that was actually
// rent, an insurance charge that was a six-month renewal rather than a monthly
// premium, and a retirement withdrawal treated as income.

import type { IngestTxn } from "./ingest";
import { CLASS_META, type PatternClass } from "./pattern-rules";
import { recurringKey } from "./ingest";

export type QuestionKind = "amount_outlier" | "large_for_category" | "new_recurring" | "inflow_source";

export interface Question {
  id: string;
  kind: QuestionKind;
  /** The question itself, in plain words. */
  prompt: string;
  /** Why it was asked — never hidden from the person. */
  because: string;
  txnIndex: number;
  description: string;
  amount: number;
  suggestedClasses: PatternClass[];
}

export type AnswerChoice =
  | { type: "confirm" }
  | { type: "reclassify"; klass: PatternClass; remember: boolean }
  | { type: "skip" };

export interface Answer {
  questionId: string;
  choice: AnswerChoice;
}

const MAX_QUESTIONS = 3;
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function stats(nums: number[]) {
  const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
  const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length;
  return { mean, sd: Math.sqrt(variance) };
}

/** Categories whose typical charge is small, so a large one deserves a check. */
const LARGE_FOR: Partial<Record<PatternClass, number>> = {
  food: 500,
  subscription: 200,
  fun: 300,
  personal: 400,
  transport: 500,
  health: 800,
};

export function buildQuestions(txns: IngestTxn[], previous: IngestTxn[] = []): Question[] {
  const found: Question[] = [];

  // 1. Merchant/amount pairs more than 2 standard deviations from that
  //    merchant's own history for this person.
  const byMerchant = new Map<string, { idx: number; amount: number }[]>();
  const history = new Map<string, number[]>();
  for (const t of previous) {
    if (t.amount >= 0) continue;
    const k = recurringKey(t.description);
    if (!k) continue;
    history.set(k, [...(history.get(k) ?? []), Math.abs(t.amount)]);
  }
  txns.forEach((t, idx) => {
    if (t.amount >= 0) return;
    const k = recurringKey(t.description);
    if (!k) return;
    byMerchant.set(k, [...(byMerchant.get(k) ?? []), { idx, amount: Math.abs(t.amount) }]);
  });

  for (const [key, rows] of byMerchant) {
    const past = history.get(key) ?? [];
    const sample = [...past, ...rows.map((r) => r.amount)];
    if (sample.length < 3) continue;
    const { mean, sd } = stats(sample);
    if (sd <= 0) continue;
    for (const r of rows) {
      if (r.amount - mean <= 2 * sd) continue;
      const t = txns[r.idx];
      found.push({
        id: `outlier:${r.idx}`,
        kind: "amount_outlier",
        prompt: `${t.description} came in at ${money(r.amount)} — far above the ${money(mean)} you usually see there. Is that right, and what was it?`,
        because: `Amounts this far from a merchant's own pattern are usually something else wearing its name — a rent payment, a repair, or an annual renewal.`,
        txnIndex: r.idx,
        description: t.description,
        amount: r.amount,
        suggestedClasses: ["housing", "insurance", "health", "transport", "other"],
      });
    }
  }

  // 2. Anything large for the category it landed in.
  txns.forEach((t, idx) => {
    if (t.amount >= 0) return;
    const ceiling = LARGE_FOR[t.klass];
    if (!ceiling || Math.abs(t.amount) < ceiling) return;
    if (found.some((q) => q.txnIndex === idx)) return;
    found.push({
      id: `large:${idx}`,
      kind: "large_for_category",
      prompt: `${t.description} at ${money(Math.abs(t.amount))} was read as ${CLASS_META[t.klass].label.toLowerCase()}. Does that match?`,
      because: `A charge this size rarely belongs to that category, and one mislabelled row this big skews every number after it.`,
      txnIndex: idx,
      description: t.description,
      amount: Math.abs(t.amount),
      suggestedClasses: ["housing", "insurance", "health", "debt", "transport", "other"],
    });
  });

  // 3. Large money in — pay, or borrowed?
  txns.forEach((t, idx) => {
    if (t.amount <= 0 || t.klass === "true_income") return;
    if (t.amount < 400) return;
    if (found.some((q) => q.txnIndex === idx)) return;
    found.push({
      id: `inflow:${idx}`,
      kind: "inflow_source",
      prompt: `${money(t.amount)} came in as "${t.description}". Was that pay, or money you'll owe back?`,
      because: `Counting borrowed money as income makes everything look more affordable than it is, which is the mistake that hurts most.`,
      txnIndex: idx,
      description: t.description,
      amount: t.amount,
      suggestedClasses: ["true_income", "loan_principal", "other"],
    });
  });

  // 4. Recurring charges appearing for the first time.
  if (previous.length) {
    const before = new Set(previous.map((t) => recurringKey(t.description)));
    const seen = new Set<string>();
    txns.forEach((t, idx) => {
      if (t.amount >= 0) return;
      const k = recurringKey(t.description);
      if (!k || before.has(k) || seen.has(k)) return;
      const count = txns.filter((x) => recurringKey(x.description) === k).length;
      if (count < 2) return;
      seen.add(k);
      if (found.some((q) => q.txnIndex === idx)) return;
      found.push({
        id: `newrec:${idx}`,
        kind: "new_recurring",
        prompt: `${t.description} is repeating this cycle and wasn't there before. Is it a new regular bill?`,
        because: `New repeating charges are how instalment plans and forgotten subscriptions build up unnoticed.`,
        txnIndex: idx,
        description: t.description,
        amount: Math.abs(t.amount),
        suggestedClasses: ["bnpl", "subscription", "utilities", "insurance", "other"],
      });
    });
  }

  // Biggest money first — a capped batch should ask about what matters most.
  return found.sort((a, b) => b.amount - a.amount).slice(0, MAX_QUESTIONS);
}

/** Applies the answers, returning corrected rows plus any rules to remember. */
export function applyAnswers(
  txns: IngestTxn[],
  questions: Question[],
  answers: Answer[],
): { txns: IngestTxn[]; newRules: { pattern: string; classify_as: PatternClass; note: string }[] } {
  const out = txns.map((t) => ({ ...t }));
  const newRules: { pattern: string; classify_as: PatternClass; note: string }[] = [];

  for (const a of answers) {
    const q = questions.find((x) => x.id === a.questionId);
    if (!q || a.choice.type !== "reclassify") continue;
    out[q.txnIndex] = {
      ...out[q.txnIndex],
      klass: a.choice.klass,
      ruleNote: "You corrected this one",
      ruleId: "user-answer",
    };
    if (a.choice.remember) {
      const phrase = q.description.split(/\s+/).slice(0, 2).join(" ");
      newRules.push({
        pattern: phrase.replace(/[^\w ]/g, ""),
        classify_as: a.choice.klass,
        note: `You told us "${phrase}" means ${CLASS_META[a.choice.klass].label.toLowerCase()}`,
      });
    }
  }

  return { txns: out, newRules };
}
