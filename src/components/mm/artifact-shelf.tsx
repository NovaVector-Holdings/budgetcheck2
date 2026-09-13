import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArtifactView } from "@/components/mm/artifact-view";
import {
  ARTIFACT_META,
  buildBudgetActual,
  buildCashFlow,
  buildPayoffSchedule,
  buildSavingsPhases,
  checklistFromCashFlow,
  checklistFromSchedule,
  type ArtifactKind,
  type ArtifactPayload,
} from "@/lib/artifacts";
import type { EngineInput } from "@/lib/decision-engine";
import type { MmArtifact, MmImport, MmSpendingCap } from "@/lib/mm";
import type { Debt, PlannedExpense, Profile, SavingsGoal } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  userId: string;
  engineInput: EngineInput;
  profile: Profile | null;
  debts: Debt[];
  goals: SavingsGoal[];
  expenses: PlannedExpense[];
  caps: MmSpendingCap[];
  savedByGoal: Map<string, number>;
  imports: MmImport[];
  artifacts: MmArtifact[];
}

export function ArtifactShelf({
  userId, engineInput, profile, debts, goals, expenses, caps, savedByGoal, imports, artifacts,
}: Props) {
  const qc = useQueryClient();
  const [recomputingId, setRecomputingId] = useState<string | null>(null);
  const cadence = profile?.pay_frequency ?? "monthly";
  const latest = imports[0] ?? null;

  function build(kind: ArtifactKind): { payload: ArtifactPayload; sourceImportId: string | null } | string {
    if (kind === "cash_flow") {
      return { payload: buildCashFlow(engineInput, { debts, goals, savedByGoal }), sourceImportId: null };
    }
    if (kind === "payoff_schedule" || kind === "checklist") {
      if (kind === "checklist" && !debts.length) {
        return { payload: checklistFromCashFlow(buildCashFlow(engineInput, { debts, goals, savedByGoal })), sourceImportId: null };
      }
      const debt = [...debts].sort((a, b) => Number(b.apr ?? 0) - Number(a.apr ?? 0))[0];
      if (!debt) return "Add a debt on the Debt page first, and this builds itself from that balance.";
      const schedule = buildPayoffSchedule({
        debt,
        cadence,
        startIso: engineInput.todayIso,
        extraPerCycle: 0,
        fixedPerCycle: 0,
      });
      return {
        payload: kind === "checklist" ? checklistFromSchedule(schedule) : schedule,
        sourceImportId: null,
      };
    }
    if (kind === "budget_actual") {
      if (!latest) return "Bring in a statement first — this one compares your plan against what actually happened.";
      return {
        payload: buildBudgetActual({
          txns: latest.txns,
          planned: expenses.map((e) => ({ name: e.name, amount: Number(e.amount), category: e.category })),
          caps: caps.map((c) => ({ category: c.category, cap_amount: Number(c.cap_amount) })),
        }),
        sourceImportId: latest.id,
      };
    }
    return {
      payload: buildSavingsPhases({
        depositAmount: profile?.income_low_estimate == null ? null : Number(profile.income_low_estimate),
        debtRemaining: debts.reduce((s, d) => s + Number(d.balance), 0),
        goals: goals.map((g) => ({ name: g.name })),
      }),
      sourceImportId: null,
    };
  }

  const create = useMutation({
    mutationFn: async (kind: ArtifactKind) => {
      const built = build(kind);
      if (typeof built === "string") throw new Error(built);
      const { error } = await supabase.from("mm_artifacts").insert({
        user_id: userId,
        kind,
        title: built.payload.title,
        takeaway: built.payload.takeaway,
        payload: JSON.parse(JSON.stringify(built.payload)),
        source_import_id: built.sourceImportId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mm_artifacts", userId] });
      toast.success("Built and saved — it stays here until you archive it.");
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't build that."),
  });

  const recompute = useMutation({
    mutationFn: async (a: MmArtifact) => {
      setRecomputingId(a.id);
      const built = build(a.kind);
      if (typeof built === "string") throw new Error(built);
      const { error } = await supabase
        .from("mm_artifacts")
        .update({
          title: built.payload.title,
          takeaway: built.payload.takeaway,
          payload: JSON.parse(JSON.stringify(built.payload)),
          updated_at: new Date().toISOString(),
        })
        .eq("id", a.id);
      if (error) throw error;
    },
    onSettled: () => setRecomputingId(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mm_artifacts", userId] });
      toast.success("Redone with today's numbers.");
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't redo that."),
  });

  const toggle = useMutation({
    mutationFn: async ({ a, key, value }: { a: MmArtifact; key: string; value: boolean }) => {
      const next = { ...(a.check_state ?? {}), [key]: value };
      const { error } = await supabase.from("mm_artifacts").update({ check_state: next }).eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mm_artifacts", userId] }),
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("mm_artifacts").update({ archived: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mm_artifacts", userId] }),
  });

  return (
    <div className="mt-6 space-y-5">
      <section className="paper-card p-6 print:hidden">
        <h3 className="font-serif text-lg text-ink">Build something you can act on</h3>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Each one is made from your own figures, saved to your account, and can be redone later with newer numbers.
          They all print cleanly if you'd rather work on paper.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(Object.keys(ARTIFACT_META) as ArtifactKind[]).map((kind) => (
            <div key={kind} className="rounded-lg border border-border p-4">
              <p className="text-sm font-medium text-ink">{ARTIFACT_META[kind].label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{ARTIFACT_META[kind].blurb}</p>
              <Button className="mt-3" size="sm" variant="outline" onClick={() => create.mutate(kind)} disabled={create.isPending}>
                Build it
              </Button>
            </div>
          ))}
        </div>
      </section>

      {artifacts.map((a) => (
        <div key={a.id}>
          <ArtifactView
            artifact={a}
            recomputing={recomputingId === a.id}
            onRecompute={() => recompute.mutate(a)}
            onToggle={(key, value) => toggle.mutate({ a, key, value })}
          />
          <div className="mt-2 print:hidden">
            <Button size="sm" variant="ghost" onClick={() => archive.mutate(a.id)}>Move to archive</Button>
          </div>
        </div>
      ))}

      {!artifacts.length && (
        <p className="text-sm text-muted-foreground">Nothing built yet. Pick one above and it'll appear here.</p>
      )}
    </div>
  );
}
