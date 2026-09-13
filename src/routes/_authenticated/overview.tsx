import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmt, today, type Debt, type PlannedExpense, type Profile, type SavingsDeposit, type SavingsGoal } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/overview")({
  head: () => ({
    meta: [
      { title: "Your money overview — BudgetChek" },
      { name: "description", content: "See your savings, debt, and upcoming expenses at a glance." },
      { property: "og:title", content: "Your money overview — BudgetChek" },
      { property: "og:description", content: "See your savings, debt, and upcoming expenses at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OverviewPage,
});

function OverviewPage() {
  const { user } = Route.useRouteContext();

  const { data } = useQuery({
    queryKey: ["overview", user.id],
    queryFn: async () => {
      const [profile, goals, deposits, debts, expenses] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("savings_goals").select("*").eq("archived", false),
        supabase.from("savings_deposits").select("*"),
        supabase.from("debts").select("*").eq("archived", false),
        supabase.from("planned_expenses").select("*").eq("archived", false).eq("paid", false),
      ]);
      return {
        profile: profile.data as Profile | null,
        goals: (goals.data ?? []) as SavingsGoal[],
        deposits: (deposits.data ?? []) as SavingsDeposit[],
        debts: (debts.data ?? []) as Debt[],
        expenses: (expenses.data ?? []) as PlannedExpense[],
      };
    },
  });

  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);
  const upcoming = (data?.expenses ?? []).filter((e) => e.due_date <= in30.toISOString().slice(0, 10));
  const totalSaved = (data?.deposits ?? []).reduce((s, d) => s + Number(d.amount), 0);
  const totalDebt = (data?.debts ?? []).reduce((s, d) => s + Number(d.balance), 0);
  const upcomingTotal = upcoming.reduce((s, e) => s + Number(e.amount), 0);

  const cards = [
    { label: "Monthly income", value: data?.profile?.monthly_income ? fmt(data.profile.monthly_income) : "Not set", to: "/settings" },
    { label: "Total saved", value: fmt(totalSaved), to: "/savings" },
    { label: "Total debt", value: fmt(totalDebt), to: "/debt" },
    { label: "Due in next 30 days", value: fmt(upcomingTotal), to: "/future-expenses" },
  ];

  return (
    <div>
      <p className="eyebrow">Overview</p>
      <h1 className="mt-2 font-serif text-3xl text-ink">
        Hey{data?.profile?.display_name ? ` ${data.profile.display_name}` : ""} — here's your money at a glance
      </h1>
      {data?.profile?.money_goal && (
        <p className="mt-2 text-sm text-muted-foreground">
          Your focus: <span className="font-medium text-ink">{data.profile.money_goal}</span>
        </p>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="paper-card block p-5 transition-shadow hover:shadow-md">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.label}</p>
            <p className="mt-2 font-serif text-2xl text-ink">{c.value}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <section className="paper-card p-6">
          <h2 className="font-serif text-lg text-ink">Coming up</h2>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Nothing due in the next 30 days.{" "}
              <Link to="/future-expenses" className="text-primary hover:underline">Plan an expense</Link>
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {upcoming.slice(0, 5).map((e) => (
                <li key={e.id} className="flex items-center justify-between text-sm">
                  <span className="text-ink">{e.name}</span>
                  <span className="text-muted-foreground">
                  {e.due_date} · {fmt(e.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="paper-card p-6">
          <h2 className="font-serif text-lg text-ink">Small step for today</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            A ten-minute weekly money meeting is the single habit most tied to feeling in control.
            Your checklist is ready.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/money-meeting" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              Start a money meeting
            </Link>
            <Link to="/learn" className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-secondary">
              Listen to a lesson
            </Link>
          </div>
        </section>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Today is {today()}.</p>
    </div>
  );
}
