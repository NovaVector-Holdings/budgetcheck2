export const fmt = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

export const today = () => new Date().toISOString().slice(0, 10);

export const addMonths = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, d));
  return dt.toISOString().slice(0, 10);
};

export interface Profile {
  id: string;
  display_name: string | null;
  monthly_income: number | null;
  money_goal: string | null;
  onboarding_completed: boolean;
  // Manual entry only — nothing here comes from a bank connection.
  pay_frequency: string | null;
  next_pay_date: string | null;
  second_pay_date: string | null;
  income_low_estimate: number | null;
  cash_on_hand: number | null;
  spending_buffer: number;
  balance_as_of: string | null;
  budget_method: string;
}

export interface SavingsGoal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  target_date: string | null;
  archived: boolean;
  created_at: string;
}

export interface SavingsDeposit {
  id: string;
  goal_id: string;
  user_id: string;
  amount: number;
  note: string | null;
  deposited_on: string;
  created_at: string;
}

export interface Debt {
  id: string;
  user_id: string;
  name: string;
  balance: number;
  apr: number | null;
  minimum_payment: number | null;
  archived: boolean;
  created_at: string;
}

export interface PlannedExpense {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  due_date: string;
  category: string;
  recurring: "none" | "weekly" | "monthly" | "yearly";
  paid: boolean;
  archived: boolean;
  created_at: string;
}

export interface MeetingChecklistItem {
  label: string;
  done: boolean;
}

export type MoneyMeetingKind = "weekly" | "monthly";

/** What every new money_meetings row's `checklist` column stores: an
 *  explicit, stable record type alongside the actual checklist items. See
 *  getMeetingKind()/getMeetingItems() for why the column type below also
 *  accepts a bare array. */
export interface MoneyMeetingChecklistPayload {
  kind: MoneyMeetingKind;
  items: MeetingChecklistItem[];
}

export interface MoneyMeeting {
  id: string;
  user_id: string;
  held_on: string;
  /**
   * Rows saved before this discriminator existed store a bare
   * MeetingChecklistItem[] with no record-type field at all. Every row
   * saved from here on stores MoneyMeetingChecklistPayload instead, with an
   * explicit `kind`. Always read through getMeetingKind()/getMeetingItems()
   * rather than touching this field directly -- they handle both shapes.
   */
  checklist: MeetingChecklistItem[] | MoneyMeetingChecklistPayload;
  notes: string | null;
  archived: boolean;
  created_at: string;
}

function isWrappedChecklist(c: MoneyMeeting["checklist"]): c is MoneyMeetingChecklistPayload {
  return !!c && !Array.isArray(c) && typeof c === "object" && "items" in c;
}

/** The actual checklist items, regardless of which shape this row used. */
export function getMeetingItems(m: MoneyMeeting): MeetingChecklistItem[] {
  const c = m.checklist;
  if (isWrappedChecklist(c)) return c.items ?? [];
  return Array.isArray(c) ? c : [];
}

/**
 * Stable, machine-readable record type -- weekly vs. monthly.
 *
 * Legacy handling: rows saved before this discriminator existed have no
 * `kind` field at all (a bare array). For those ONLY, this falls back to a
 * one-time compatibility check on the exact monthly-only checklist label
 * ("Brought a statement to review") that the old monthly flow always wrote.
 * Every row saved going forward carries an explicit `kind` and never
 * touches this fallback. A legacy row matching neither pattern defaults to
 * "weekly" -- the only flow that existed before monthly review shipped, so
 * it's the only thing an unlabeled legacy row could be.
 */
export function getMeetingKind(m: MoneyMeeting): MoneyMeetingKind {
  const c = m.checklist;
  if (isWrappedChecklist(c)) return c.kind;
  const items = Array.isArray(c) ? c : [];
  const isLegacyMonthly = items.some((i) => i.label === "Brought a statement to review");
  return isLegacyMonthly ? "monthly" : "weekly";
}

export interface AlertSettings {
  user_id: string;
  expense_reminder_days: number;
  low_funds_threshold: number | null;
  weekly_summary: boolean;
}

export const EXPENSE_CATEGORIES = [
  "housing",
  "utilities",
  "food",
  "transport",
  "debt",
  "health",
  "personal",
  "fun",
  "other",
] as const;

export const DEFAULT_MEETING_CHECKLIST: MeetingChecklistItem[] = [
  { label: "Reviewed this week's spending", done: false },
  { label: "Checked savings progress", done: false },
  { label: "Paid or scheduled upcoming bills", done: false },
  { label: "Moved money toward my top goal", done: false },
  { label: "Noted one money win, big or small", done: false },
];

export function categorize(description: string): string {
  const d = description.toLowerCase();
  if (/rent|mortgage|apartment/.test(d)) return "housing";
  if (/electric|water|gas|internet|phone|utility/.test(d)) return "utilities";
  if (/grocery|groceries|restaurant|coffee|food|doordash|uber eats/.test(d)) return "food";
  if (/uber|lyft|gas station|fuel|transit|parking|car/.test(d)) return "transport";
  if (/loan|credit card|payment|debt/.test(d)) return "debt";
  if (/pharmacy|doctor|dentist|health|gym/.test(d)) return "health";
  if (/movie|spotify|netflix|game|ticket|fun/.test(d)) return "fun";
  return "other";
}
