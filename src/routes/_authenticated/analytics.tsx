import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmt, type Debt, type PlannedExpense, type SavingsDeposit, type SavingsGoal } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Money reports — BudgetChek" },
      { name: "description", content: "See where your money stands: savings pace, debt trend, and spending by category." },
      { property: "og:title", content: "Money analytics — BudgetChek" },
      { property: "og:description", content: "See where your money stands: savings pace, debt trend, and spending by category." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { user } = Route.useRouteContext();

  const { data } = useQuery({
    queryKey: ["analytics", user.id],
    queryFn: async () => {
      const [goals, deposits, debts, expenses] = await Promise.all([
        supabase.from("savings_goals").select("*").eq("archived", false),
        supabase.from("savings_deposits").select("*"),
        supabase.from("debts").select("*").eq("archived", false),
        supabase.from("planned_expenses").select("*").eq("archived", false),
      ]);
      return {
        goals: (goals.data ?? []) as SavingsGoal[],
        deposits: (deposits.data ?? []) as SavingsDeposit[],
        debts: (debts.data ?? []) as Debt[],
        expenses: (expenses.data ?? []) as PlannedExpense[],
      };
    },
  });

  const deposits = data?.deposits ?? [];
  const totalSaved = deposits.reduce((s, d) => s + Number(d.amount), 0);
  const totalDebt = (data?.debts ?? []).reduce((s, d) => s + Number(d.balance), 0);
  const weightedApr = (() => {
    const ds = (data?.debts ?? []).filter((d) => d.apr != null && Number(d.balance) > 0);
    const sum = ds.reduce((s, d) => s + Number(d.balance), 0);
    if (!sum) return null;
    return ds.reduce((s, d) => s + Number(d.apr) * Number(d.balance), 0) / sum;
  })();

  // Savings by month (last 6 months)
  const byMonth = new Map<string, number>();
  for (const d of deposits) {
    const key = d.deposited_on.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + Number(d.amount));
  }
  const months = [...byMonth.entries()].sort().slice(-6);
  const maxMonth = Math.max(1, ...months.map(([, v]) => v));

  // Planned spending by category
  const byCat = new Map<string, number>();
  for (const e of data?.expenses ?? []) {
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + Number(e.amount));
  }
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...cats.map(([, v]) => v));

  const empty = deposits.length === 0 && (data?.debts ?? []).length === 0 && (data?.expenses ?? []).length === 0;

  return (
    <div>
      <p className="eyebrow">Reports</p>
      <h1 className="mt-2 font-serif text-3xl text-ink">The story in your numbers</h1>

      {empty ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Nothing to analyze yet. Add a <Link to="/savings" className="text-primary hover:underline">savings goal</Link>,{" "}
          a <Link to="/debt" className="text-primary hover:underline">debt</Link>, or a{" "}
          <Link to="/future-expenses" className="text-primary hover:underline">planned expense</Link> and your charts will appear here.
        </p>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <section className="paper-card p-6">
            <h2 className="font-serif text-lg text-ink">Savings by month</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-primary" aria-hidden="true" />
                Money you deposited that month
              </span>
              <span>Bar length compares months; longest = your best month</span>
            </p>
            {months.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Log a deposit to start this chart.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {months.map(([m, v]) => (
                  <div key={m} className="flex items-center gap-3">
                    <span className="w-16 text-xs text-muted-foreground">{m}</span>
                    <div className="h-4 flex-1 rounded bg-secondary">
                      <div className="h-4 rounded bg-primary" style={{ width: `${(v / maxMonth) * 100}%` }} />
                    </div>
                    <span className="w-20 text-right text-xs font-medium text-ink">{fmt(v)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 text-sm text-muted-foreground">Total saved: <span className="font-medium text-ink">{fmt(totalSaved)}</span></p>
          </section>

          <section className="paper-card p-6">
            <h2 className="font-serif text-lg text-ink">Planned spending by category</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-primary/70" aria-hidden="true" />
                Total you've planned to spend
              </span>
              <span>Biggest category first</span>
            </p>
            {cats.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Plan an expense to start this chart.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {cats.map(([c, v]) => (
                  <div key={c} className="flex items-center gap-3">
                    <span className="w-20 text-xs capitalize text-muted-foreground">{c}</span>
                    <div className="h-4 flex-1 rounded bg-secondary">
                      <div className="h-4 rounded bg-primary/70" style={{ width: `${(v / maxCat) * 100}%` }} />
                    </div>
                    <span className="w-20 text-right text-xs font-medium text-ink">{fmt(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>


          <section className="paper-card p-6 md:col-span-2">
            <h2 className="font-serif text-lg text-ink">Debt snapshot</h2>
            {(data?.debts ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No active debts tracked.</p>
            ) : (
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Total balance</p>
                  <p className="mt-1 font-serif text-2xl text-ink">{fmt(totalDebt)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Debts tracked</p>
                  <p className="mt-1 font-serif text-2xl text-ink">{(data?.debts ?? []).length}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Avg. interest (weighted)</p>
                  <p className="mt-1 font-serif text-2xl text-ink">{weightedApr != null ? `${weightedApr.toFixed(1)}%` : "—"}</p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
