import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fmt, today, type AlertSettings, type PlannedExpense, type Profile, type SavingsDeposit, type SavingsGoal } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({
    meta: [
      { title: "Bill reminders — BudgetChek" },
      { name: "description", content: "Upcoming bills, low savings pace, and gentle nudges — all in one place." },
      { property: "og:title", content: "Alerts — BudgetChek" },
      { property: "og:description", content: "Upcoming bills, low savings pace, and gentle nudges — all in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AlertsPage,
});

function AlertsPage() {
  const { user } = Route.useRouteContext();

  const { data } = useQuery({
    queryKey: ["alerts", user.id],
    queryFn: async () => {
      const [settings, expenses, goals, deposits, profile] = await Promise.all([
        supabase.from("alert_settings").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("planned_expenses").select("*").eq("archived", false).eq("paid", false),
        supabase.from("savings_goals").select("*").eq("archived", false),
        supabase.from("savings_deposits").select("*"),
        supabase.from("profiles").select("*").eq("id", user.id).single(),
      ]);
      return {
        settings: (settings.data ?? null) as AlertSettings | null,
        expenses: (expenses.data ?? []) as PlannedExpense[],
        goals: (goals.data ?? []) as SavingsGoal[],
        deposits: (deposits.data ?? []) as SavingsDeposit[],
        profile: (profile.data ?? null) as Profile | null,
      };
    },
  });

  const days = data?.settings?.expense_reminder_days ?? 3;
  const t = new Date(today() + "T00:00:00");
  const horizon = new Date(t);
  horizon.setDate(horizon.getDate() + days);
  const horizonStr = horizon.toISOString().slice(0, 10);

  const dueSoon = (data?.expenses ?? []).filter((e) => e.due_date <= horizonStr && e.due_date >= today());
  const overdue = (data?.expenses ?? []).filter((e) => e.due_date < today());

  const lowFundsAlerts: string[] = [];
  const threshold = data?.settings?.low_funds_threshold;
  if (threshold != null && data?.profile?.monthly_income) {
    const dueThisMonth = (data?.expenses ?? [])
      .filter((e) => e.due_date.slice(0, 7) === today().slice(0, 7))
      .reduce((s, e) => s + Number(e.amount), 0);
    const remaining = Number(data.profile.monthly_income) - dueThisMonth;
    if (remaining < threshold) {
      lowFundsAlerts.push(
        `After this month's planned expenses, about ${fmt(Math.max(0, remaining))} of your ${fmt(data.profile.monthly_income)} income is unspoken for — below your ${fmt(threshold)} comfort line.`
      );
    }
  }

  const staleGoals = (data?.goals ?? []).filter((g) => {
    const last = (data?.deposits ?? []).filter((d) => d.goal_id === g.id).map((d) => d.deposited_on).sort().pop();
    if (!last) return true;
    const diff = (t.getTime() - new Date(last + "T00:00:00").getTime()) / 86400000;
    return diff > 14;
  });

  const anyAlerts = dueSoon.length > 0 || overdue.length > 0 || lowFundsAlerts.length > 0 || staleGoals.length > 0;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Reminders</p>
          <h1 className="mt-2 font-serif text-3xl text-ink">Gentle nudges, no judgment</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            These update automatically from what you've entered. Tune how far ahead we warn you in{" "}
            <Link to="/settings" className="text-primary hover:underline">Settings</Link>.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {overdue.length > 0 && (
          <section className="paper-card border-destructive/40 p-6">
            <h2 className="font-serif text-lg text-destructive">Past due</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {overdue.map((e) => (
                <li key={e.id} className="flex justify-between">
                  <span className="text-ink">{e.name}</span>
                  <span className="text-muted-foreground">due {e.due_date} · {fmt(e.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {dueSoon.length > 0 && (
          <section className="paper-card p-6">
            <h2 className="font-serif text-lg text-ink">Due in the next {days} day{days === 1 ? "" : "s"}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {dueSoon.map((e) => (
                <li key={e.id} className="flex justify-between">
                  <span className="text-ink">{e.name}</span>
                  <span className="text-muted-foreground">{e.due_date} · {fmt(e.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {lowFundsAlerts.map((a, i) => (
          <section key={i} className="paper-card border-destructive/40 p-6">
            <h2 className="font-serif text-lg text-ink">Tight month ahead</h2>
            <p className="mt-2 text-sm text-muted-foreground">{a}</p>
          </section>
        ))}

        {staleGoals.length > 0 && (
          <section className="paper-card p-6">
            <h2 className="font-serif text-lg text-ink">Goals waiting on you</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              No deposits in the last two weeks on:{" "}
              <span className="font-medium text-ink">{staleGoals.map((g) => g.name).join(", ")}</span>.
              Even $5 keeps the habit alive.
            </p>
          </section>
        )}

        {!anyAlerts && (
          <section className="paper-card p-6 text-center">
            <h2 className="font-serif text-lg text-ink">All clear</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              No overdue bills, nothing due soon, and your goals are getting love. Enjoy it.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
