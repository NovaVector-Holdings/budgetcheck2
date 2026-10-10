import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  today,
  type Debt,
  type PlannedExpense,
  type Profile,
  type SavingsDeposit,
  type SavingsGoal,
} from "@/lib/money";
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
import {
  deriveDataStatus,
  ENGINE_SOURCES,
  EXTRA_SOURCES,
  type EngineSourceKey,
  type ExtraSourceKey,
  type SourceFetchStatus,
  type SourceState,
} from "@/lib/data-status";

/** Hoisted so the default is one identity: a fresh `[]` per render re-ran buildEngineInput + computeSnapshot every render. */
const NO_CONSTRAINTS: { label: string; amount: number }[] = [];

/**
 * Loads everything Money Meeting reasons over and computes the live snapshot.
 *
 * Every query THROWS on a Supabase error (never `data ?? []`), so a failed
 * required read is an explicit `unavailable` state rather than an empty list the
 * engine would price as a healthy plan (SME ruling, 2026-10-09). `snapshot` and
 * `engineInput` are only trustworthy when `status === "ready"`; callers gate on
 * it (see MoneyDataGate) instead of reading them while loading or unavailable.
 */
export function useMoneyState(
  userId: string,
  namedConstraints: { label: string; amount: number }[] = NO_CONSTRAINTS,
) {
  // Engine queries retry twice (~3s) so "unavailable" surfaces quickly; the extras keep the default.
  const useSource = <T>(key: string, fn: () => Promise<T>, engine = true) =>
    useQuery({ queryKey: [key, userId], queryFn: fn, ...(engine ? { retry: 2 } : {}) });

  const profile = useSource<Profile>("profile", async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    // Anyone past onboarding has a profile row; null is the only visible sign of an
    // RLS-filtered or expired session, so it is "unavailable", never "no profile yet".
    if (!data) throw new Error("profile not found");
    return data as Profile;
  });
  const accounts = useSource<MmAccount[]>("mm_accounts", async () => {
    const { data, error } = await supabase
      .from("mm_accounts")
      .select("*")
      .eq("archived", false)
      .order("created_at");
    if (error) throw error;
    return (data ?? []) as unknown as MmAccount[];
  });
  const reserved = useSource<MmReservedFund[]>("mm_reserved", async () => {
    const { data, error } = await supabase
      .from("mm_reserved_funds")
      .select("*")
      .eq("archived", false)
      .order("created_at");
    if (error) throw error;
    return (data ?? []) as unknown as MmReservedFund[];
  });
  const caps = useSource<MmSpendingCap[]>("mm_caps", async () => {
    const { data, error } = await supabase.from("mm_spending_caps").select("*").order("created_at");
    if (error) throw error;
    return (data ?? []) as unknown as MmSpendingCap[];
  });
  const rules = useSource<MmPatternRuleRow[]>(
    "mm_rules",
    async () => {
      const { data, error } = await supabase
        .from("mm_pattern_rules")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as MmPatternRuleRow[];
    },
    false,
  );
  const overrides = useSource<MmPriorityOverride[]>("mm_overrides", async () => {
    const { data, error } = await supabase.from("mm_priority_overrides").select("*").order("tier");
    if (error) throw error;
    return (data ?? []) as unknown as MmPriorityOverride[];
  });
  const imports = useSource<MmImport[]>(
    "mm_imports",
    async () => {
      const { data, error } = await supabase
        .from("mm_imports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as unknown as MmImport[];
    },
    false,
  );
  const artifacts = useSource<MmArtifact[]>(
    "mm_artifacts",
    async () => {
      const { data, error } = await supabase
        .from("mm_artifacts")
        .select("*")
        .eq("archived", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MmArtifact[];
    },
    false,
  );
  const expenses = useSource<PlannedExpense[]>("expenses", async () => {
    const { data, error } = await supabase
      .from("planned_expenses")
      .select("*")
      .eq("archived", false)
      .order("due_date");
    if (error) throw error;
    return (data ?? []) as PlannedExpense[];
  });
  const debts = useSource<Debt[]>("debts", async () => {
    const { data, error } = await supabase
      .from("debts")
      .select("*")
      .eq("archived", false)
      .order("created_at");
    if (error) throw error;
    return (data ?? []) as Debt[];
  });
  const goals = useSource<SavingsGoal[]>("goals", async () => {
    const { data, error } = await supabase
      .from("savings_goals")
      .select("*")
      .eq("archived", false)
      .order("created_at");
    if (error) throw error;
    return (data ?? []) as SavingsGoal[];
  });
  const deposits = useSource<SavingsDeposit[]>("deposits", async () => {
    const { data, error } = await supabase.from("savings_deposits").select("*");
    if (error) throw error;
    return (data ?? []) as SavingsDeposit[];
  });

  const savedByGoal = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of deposits.data ?? [])
      m.set(d.goal_id, (m.get(d.goal_id) ?? 0) + Number(d.amount));
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
    [
      profile.data,
      accounts.data,
      reserved.data,
      caps.data,
      expenses.data,
      debts.data,
      goals.data,
      savedByGoal,
      overrides.data,
      namedConstraints,
    ],
  );

  const snapshot = useMemo(() => computeSnapshot(engineInput), [engineInput]);

  const engineResults = {
    profile,
    accounts,
    reserved,
    caps,
    expenses,
    debts,
    goals,
    deposits,
    overrides,
  };
  const extraResults = { rules, imports, artifacts };
  const probe = (
    r: { isPending: boolean; isError: boolean; fetchStatus: SourceFetchStatus },
    s: { key: string; label: string },
  ) => ({
    key: s.key,
    label: s.label,
    isPending: r.isPending,
    isError: r.isError,
    fetchStatus: r.fetchStatus,
  });
  const engine = deriveDataStatus(ENGINE_SOURCES.map((s) => probe(engineResults[s.key], s)));
  const extrasStatus = deriveDataStatus(EXTRA_SOURCES.map((s) => probe(extraResults[s.key], s)));

  /** Refetch only what failed or is parked offline; never cancel a request that is already in flight. */
  const retry = () =>
    Promise.all(
      [...Object.values(engineResults), ...Object.values(extraResults)]
        .filter((r) => r.isError || r.fetchStatus === "paused")
        .map((r) => r.refetch()),
    );

  return {
    // Back-compat: `loading` is now exactly `status === "loading"` (all nine engine queries, isPending-based).
    loading: engine.status === "loading",
    status: engine.status,
    unavailable: engine.unavailable,
    offline: engine.offline,
    retrying: engine.retrying,
    retry,
    /** Per-engine-source state, for the repair surface that shows each list on its own. */
    sourceStatus: engine.sources as Record<EngineSourceKey, SourceState>,
    /** rules / imports / artifacts: not engine inputs, but the surfaces that SAVE from them wait on these. */
    extras: {
      status: extrasStatus.status,
      unavailable: extrasStatus.unavailable,
      offline: extrasStatus.offline,
      sourceStatus: extrasStatus.sources as Record<ExtraSourceKey, SourceState>,
    },
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
    deposits: deposits.data ?? [],
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
