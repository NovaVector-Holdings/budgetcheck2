import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmt, today, type SavingsDeposit, type SavingsGoal } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/savings")({
  head: () => ({
    meta: [
      { title: "Savings goals — BudgetChek" },
      { name: "description", content: "Create savings goals and watch your progress grow." },
      { property: "og:title", content: "Savings goals — BudgetChek" },
      { property: "og:description", content: "Create savings goals and watch your progress grow." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SavingsPage,
});

function SavingsPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [depositFor, setDepositFor] = useState<string | null>(null);
  const [depositAmt, setDepositAmt] = useState("");
  const [depositNote, setDepositNote] = useState("");

  const { data } = useQuery({
    queryKey: ["savings", user.id],
    queryFn: async () => {
      const [goals, deposits] = await Promise.all([
        supabase.from("savings_goals").select("*").eq("archived", false).order("created_at"),
        supabase.from("savings_deposits").select("*"),
      ]);
      return {
        goals: (goals.data ?? []) as SavingsGoal[],
        deposits: (deposits.data ?? []) as SavingsDeposit[],
      };
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["savings", user.id] });

  const addGoal = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("savings_goals").insert({
        user_id: user.id,
        name: name.trim(),
        target_amount: Number(target),
        target_date: targetDate || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Goal created.");
      setShowGoalForm(false);
      setName(""); setTarget(""); setTargetDate("");
      refresh();
    },
    onError: () => toast.error("Couldn't save the goal."),
  });

  const addDeposit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("savings_deposits").insert({
        goal_id: depositFor!,
        user_id: user.id,
        amount: Number(depositAmt),
        note: depositNote.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deposit logged. Nice.");
      setDepositFor(null); setDepositAmt(""); setDepositNote("");
      refresh();
    },
    onError: () => toast.error("Couldn't log the deposit."),
  });

  const archiveGoal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("savings_goals").update({ archived: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Goal archived."); refresh(); },
  });

  const savedFor = (goalId: string) =>
    (data?.deposits ?? []).filter((d) => d.goal_id === goalId).reduce((s, d) => s + Number(d.amount), 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Savings</p>
          <h1 className="mt-2 font-serif text-3xl text-ink">Your savings goals</h1>
        </div>
        <Button onClick={() => setShowGoalForm((v) => !v)}>
          {showGoalForm ? "Cancel" : "New goal"}
        </Button>
      </div>

      {showGoalForm && (
        <form
          className="paper-card mt-6 grid gap-4 p-6 sm:grid-cols-3"
          onSubmit={(e) => { e.preventDefault(); addGoal.mutate(); }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="g-name">Goal name</Label>
            <Input id="g-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergency fund" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-target">Target amount</Label>
            <Input id="g-target" required type="number" min="1" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="1000" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-date">Target date (optional)</Label>
            <Input id="g-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" disabled={addGoal.isPending}>Save goal</Button>
          </div>
        </form>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {(data?.goals ?? []).map((g) => {
          const saved = savedFor(g.id);
          const pct = Math.min(100, Math.round((saved / Number(g.target_amount)) * 100));
          return (
            <article key={g.id} className="paper-card p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-serif text-xl text-ink">{g.name}</h2>
                  {g.target_date && <p className="text-xs text-muted-foreground">by {g.target_date}</p>}
                </div>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-ink hover:underline"
                  onClick={() => archiveGoal.mutate(g.id)}
                >
                  Archive
                </button>
              </div>
              <p className="mt-3 font-serif text-2xl text-ink">
                {fmt(saved)} <span className="text-base text-muted-foreground">of {fmt(g.target_amount)}</span>
              </p>
              <div className="mt-3 h-2 rounded-full bg-secondary" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.name} progress`}>
                <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{pct}% there</p>

              {depositFor === g.id ? (
                <form
                  className="mt-4 space-y-3 rounded-lg border border-border p-4"
                  onSubmit={(e) => { e.preventDefault(); addDeposit.mutate(); }}
                >
                  <div className="space-y-1.5">
                    <Label htmlFor={`d-amt-${g.id}`}>Amount</Label>
                    <Input id={`d-amt-${g.id}`} required type="number" min="0.01" step="0.01" value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`d-note-${g.id}`}>Note (optional)</Label>
                    <Input id={`d-note-${g.id}`} value={depositNote} onChange={(e) => setDepositNote(e.target.value)} placeholder="e.g. skipped takeout" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" type="submit" disabled={addDeposit.isPending}>Log it</Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => setDepositFor(null)}>Cancel</Button>
                  </div>
                </form>
              ) : (
                <Button size="sm" variant="outline" className="mt-4" onClick={() => setDepositFor(g.id)}>
                  Log a deposit
                </Button>
              )}
            </article>
          );
        })}
      </div>

      {(data?.goals ?? []).length === 0 && !showGoalForm && (
        <p className="mt-6 text-sm text-muted-foreground">
          No goals yet. Even $10 toward a named goal beats a vague "save more." Create your first one above.
        </p>
      )}
      <p className="mt-6 text-xs text-muted-foreground">Today is {today()}.</p>
    </div>
  );
}
