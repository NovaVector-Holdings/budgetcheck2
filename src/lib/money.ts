export const fmt = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

export const today = () => new Date().toISOString().slice(0, 10);

export interface Profile {
  id: string;
  display_name: string | null;
  monthly_income: number | null;
  money_goal: string | null;
  onboarding_completed: boolean;
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

export interface MoneyMeeting {
  id: string;
  user_id: string;
  held_on: string;
  checklist: MeetingChecklistItem[];
  notes: string | null;
  archived: boolean;
  created_at: string;
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
