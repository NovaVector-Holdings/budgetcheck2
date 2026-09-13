import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { type AlertSettings, type Profile } from "@/lib/money";
import { PAY_FREQUENCIES, type PayFrequency } from "@/lib/paycheck";
import { BUDGET_METHODS, type BudgetMethod } from "@/lib/budget-methods";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — BudgetChek" },
      { name: "description", content: "Manage your profile, alert preferences, and your data." },
      { property: "og:title", content: "Settings — BudgetChek" },
      { property: "og:description", content: "Manage your profile, alert preferences, and your data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [income, setIncome] = useState("");
  const [goal, setGoal] = useState("");
  const [days, setDays] = useState("3");
  const [threshold, setThreshold] = useState("");
  const [weekly, setWeekly] = useState(true);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [freq, setFreq] = useState<PayFrequency | "">("");
  const [nextPay, setNextPay] = useState("");
  const [secondPay, setSecondPay] = useState("");
  const [lowIncome, setLowIncome] = useState("");
  const [method, setMethod] = useState<BudgetMethod>("fifty_thirty_twenty");

  const { data } = useQuery({
    queryKey: ["settings", user.id],
    queryFn: async () => {
      const [profile, alerts] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("alert_settings").select("*").eq("user_id", user.id).maybeSingle(),
      ]);
      return {
        profile: profile.data as Profile | null,
        alerts: (alerts.data ?? null) as AlertSettings | null,
      };
    },
  });

  useEffect(() => {
    if (data?.profile) {
      setName(data.profile.display_name ?? "");
      setIncome(data.profile.monthly_income != null ? String(data.profile.monthly_income) : "");
      setGoal(data.profile.money_goal ?? "");
      setFreq((data.profile.pay_frequency ?? "") as PayFrequency | "");
      setNextPay(data.profile.next_pay_date ?? "");
      setSecondPay(data.profile.second_pay_date ?? "");
      setLowIncome(data.profile.income_low_estimate != null ? String(data.profile.income_low_estimate) : "");
      setMethod((data.profile.budget_method ?? "fifty_thirty_twenty") as BudgetMethod);
    }
    if (data?.alerts) {
      setDays(String(data.alerts.expense_reminder_days));
      setThreshold(data.alerts.low_funds_threshold != null ? String(data.alerts.low_funds_threshold) : "");
      setWeekly(data.alerts.weekly_summary);
    }
  }, [data]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").update({
        display_name: name.trim() || null,
        monthly_income: income ? Number(income) : null,
        money_goal: goal.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => toast.success("Profile saved."),
    onError: () => toast.error("Couldn't save."),
  });

  const saveAlerts = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("alert_settings").upsert({
        user_id: user.id,
        expense_reminder_days: Number(days) || 3,
        low_funds_threshold: threshold ? Number(threshold) : null,
        weekly_summary: weekly,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Alert preferences saved."),
    onError: () => toast.error("Couldn't save."),
  });

  const exportData = useMutation({
    mutationFn: async () => {
      const [profile, goals, deposits, debts, payments, expenses, meetings, alerts] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id),
        supabase.from("savings_goals").select("*"),
        supabase.from("savings_deposits").select("*"),
        supabase.from("debts").select("*"),
        supabase.from("debt_payments").select("*"),
        supabase.from("planned_expenses").select("*"),
        supabase.from("money_meetings").select("*"),
        supabase.from("alert_settings").select("*"),
      ]);
      return {
        exported_at: new Date().toISOString(),
        profile: profile.data, savings_goals: goals.data, savings_deposits: deposits.data,
        debts: debts.data, debt_payments: payments.data, planned_expenses: expenses.data,
        money_meetings: meetings.data, alert_settings: alerts.data,
      };
    },
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "budgetchek-my-data.json";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Your data downloaded.");
    },
    onError: () => toast.error("Couldn't export right now."),
  });

  const deleteAll = useMutation({
    mutationFn: async () => {
      // Children first (FK), then parents
      await supabase.from("savings_deposits").delete().eq("user_id", user.id);
      await supabase.from("debt_payments").delete().eq("user_id", user.id);
      await supabase.from("savings_goals").delete().eq("user_id", user.id);
      await supabase.from("debts").delete().eq("user_id", user.id);
      await supabase.from("planned_expenses").delete().eq("user_id", user.id);
      await supabase.from("money_meetings").delete().eq("user_id", user.id);
      await supabase.from("alert_settings").delete().eq("user_id", user.id);
    },
    onSuccess: () => {
      toast.success("All your money data is deleted. Your profile stays.");
      setConfirmingDelete(false);
      qc.clear();
      navigate({ to: "/overview" });
    },
    onError: () => toast.error("Couldn't delete everything. Try again."),
  });

  async function handleSignOut() {
    qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="max-w-2xl">
      <p className="eyebrow">Settings</p>
      <h1 className="mt-2 font-serif text-3xl text-ink">Your account and your data</h1>

      <form className="paper-card mt-6 space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); saveProfile.mutate(); }}>
        <h2 className="font-serif text-lg text-ink">Profile</h2>
        <div className="space-y-1.5">
          <Label htmlFor="set-name">Display name</Label>
          <Input id="set-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="set-income">Monthly income</Label>
            <Input id="set-income" type="number" min="0" step="0.01" value={income} onChange={(e) => setIncome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="set-goal">Top money goal</Label>
            <Input id="set-goal" value={goal} onChange={(e) => setGoal(e.target.value)} />
          </div>
        </div>
        <Button type="submit" disabled={saveProfile.isPending}>Save profile</Button>
      </form>

      <form className="paper-card mt-6 space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); saveAlerts.mutate(); }}>
        <h2 className="font-serif text-lg text-ink">Alert preferences</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="set-days">Warn me about bills this many days ahead</Label>
            <Input id="set-days" type="number" min="0" max="30" value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="set-threshold">Low-funds comfort line ($, optional)</Label>
            <Input id="set-threshold" type="number" min="0" step="0.01" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="e.g. 100" />
          </div>
        </div>
        <label className="flex items-center gap-3 text-sm text-ink">
          <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} className="h-4 w-4 accent-primary" />
          Include a weekly summary nudge in my alerts
        </label>
        <Button type="submit" disabled={saveAlerts.isPending}>Save alert preferences</Button>
      </form>

      <section className="paper-card mt-6 space-y-4 p-6">
        <h2 className="font-serif text-lg text-ink">Your data</h2>
        <p className="text-sm text-muted-foreground">
          Everything you've entered belongs to you. Download it anytime, or wipe it completely.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => exportData.mutate()} disabled={exportData.isPending}>
            Download my data (JSON)
          </Button>
          {!confirmingDelete ? (
            <Button variant="outline" className="text-destructive" onClick={() => setConfirmingDelete(true)}>
              Delete all my money data
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-destructive">Sure? This can't be undone.</span>
              <Button variant="destructive" size="sm" onClick={() => deleteAll.mutate()} disabled={deleteAll.isPending}>
                Yes, delete everything
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(false)}>Keep it</Button>
            </div>
          )}
        </div>
      </section>

      <section className="mt-6 flex items-center justify-between rounded-lg border border-border p-4">
        <div className="text-sm">
          <p className="font-medium text-ink">Signed in as {user.email}</p>
        </div>
        <Button variant="outline" onClick={handleSignOut}>Sign out</Button>
      </section>
    </div>
  );
}
