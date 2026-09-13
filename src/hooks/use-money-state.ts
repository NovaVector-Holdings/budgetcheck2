import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { today, type Debt, type PlannedExpense, type Profile, type SavingsDeposit, type SavingsGoal } from "@/lib/money";
import {
  buildEngineInput,
  toPatternRules,
  type MmAccount,
  type MmArtifact,
  type MmImport,
  type MmPatternRuleRow,
  type MmPriorityOverride,
  type MmReservedFund,
  type MmSpendingCap,
} from "@/lib/mm";
import { computeSnapshot } from "@/lib/decision-engine";

/** Loads everything Money Meeting reasons over and computes the live snapshot. */
export function useMoneyState(userId: string, namedConstraints: { label: string; amount: number }[] = []) {
  const q = <T,>(key: string, fn: () => Promise<T>) =>
    useQuery({ queryKey: [key, userId], queryFn: fn });

  const profile = q<Profile | null>("profile", async () => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    return (data ?? null) as Profile | null;
  });
  const accounts = q<MmAccount[]>("mm_accounts", async () => {
    const { data } = await supabase.from("mm_accounts").select("*").eq("archived", false).order("created_at");
    return (data ?? []) as unknown as MmAccount[];
  });
  const reserved = q<MmReservedFund[]>("mm_reserved", async () => {
    const { data } = await supabase.from("mm_reserved_funds").select("*").eq("archived", false).order("created_at");
    return (data ?? []) as unknown as MmReservedFund[];
  });
  const caps = q<MmSpendingCap[]>("mm_caps", async () => {
    const { data } = await supabase.from("mm_spending_caps").select("*").order("created_at");
    return (data ?? []) as unknown as MmSpendingCap[];
  });
  const rules = q<MmPatternRuleRow[]>("mm_rules", async () => {
    const { data } = await supabase.from("mm_pattern_rules").select("*").order("created_at");
    return (data ?? []) as unknown as MmPatternRuleRow[];
  });
  const overrides = q<MmPriorityOverride[]>("mm_overrides", async () => {
    const { data } = await supabase.from("mm_priority_overrides").select("*").order("tier");
    return (data ?? []) as unknown as MmPriorityOverride[];
  });
  const imports = q<MmImport[]>("mm_imports", async () => {
    const { data } = await supabase.from("mm_imports").select("*").order("created_at", { ascending: false }).limit(12);
    return (data ?? []) as unknown as MmImport[];
  });
  const artifacts = q<MmArtifact[]>("mm_artifacts", async () => {
    const { data } = await supabase.from("mm_artifacts").select("*").eq("archived", false).order("created_at", { ascending: false });
    return (data ?? []) as unknown as MmArtifact[];
  });
  const expenses = q<PlannedExpense[]>("expenses", async () => {
    const { data } = await supabase.from("planned_expenses").select("*").eq("archived", false).order("due_date");
    return (data ?? []) as PlannedExpense[];
  });
  const debts = q<Debt[]>("debts", async () => {
    const { data } = await supabase.from("debts").select("*").eq("archived", false).order("created_at");
    return (data ?? []) as Debt[];
  });
  const goals = q<SavingsGoal[]>("goals", async () => {
    const { data } = await supabase.from("savings_goals").select("*").eq("archived", false).order("created_at");
    return (data ?? []) as SavingsGoal[];
  });
  const deposits = q<SavingsDeposit[]>("deposits", async () => {
    const { data } = await supabase.from("savings_deposits").select("*");
    return (data ?? []) as SavingsDeposit[];
  });

  const savedByGoal = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of deposits.data ?? []) m.set(d.goal_id, (m.get(d.goal_id) ?? 0) + Number(d.amount));
    return m;
  }, [deposits.data]);

  const userRules = useMemo(() => toPatternRules(rules.data ?? []), [rules.data]);

  const engineInput = useMemo(
    () =>
      buildEngineInput({
        todayIso: today(),
        profile: profile.data ?? null,
        accounts: accounts.data ?? [],
        reserved: reserved.data ?? [],
        caps: caps.data ?? [],
        expenses: expenses.data ?? [],
        debts: debts.data ?? [],
        goals: goals.data ?? [],
        savedByGoal,
        overrides: overrides.data ?? [],
        namedConstraints,
      }),
    [profile.data, accounts.data, reserved.data, caps.data, expenses.data, debts.data, goals.data, savedByGoal, overrides.data, namedConstraints],
  );

  const snapshot = useMemo(() => computeSnapshot(engineInput), [engineInput]);

  const loading =
    profile.isLoading || accounts.isLoading || expenses.isLoading || debts.isLoading || goals.isLoading;

  return {
    loading,
    profile: profile.data ?? null,
    accounts: accounts.data ?? [],
    reserved: reserved.data ?? [],
    caps: caps.data ?? [],
    rules: rules.data ?? [],
    userRules,
    overrides: overrides.data ?? [],
    imports: imports.data ?? [],
    artifacts: artifacts.data ?? [],
    expenses: expenses.data ?? [],
    debts: debts.data ?? [],
    goals: goals.data ?? [],
    savedByGoal,
    engineInput,
    snapshot,
  };
}

export const MM_KEYS = [
  "mm_accounts",
  "mm_reserved",
  "mm_caps",
  "mm_rules",
  "mm_overrides",
  "mm_imports",
  "mm_artifacts",
] as const;
