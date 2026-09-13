import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CashOnHandEditor, NextMoneyMoveCard, PaycheckPlanCard } from "@/components/paycheck-cards";
import { buildPaycheckPlan } from "@/lib/paycheck";
import { buildPayoffPlan, humanMonths } from "@/lib/payoff";
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

  const todayStr = today();
  const totalSaved = (data?.deposits ?? []).reduce((s, d) => s + Number(d.amount), 0);
  const totalDebt = (data?.debts ?? []).reduce((s, d) => s + Number(d.balance), 0);
  const hasDebt = (data?.debts ?? []).length > 0;

  const income = data?.profile?.monthly_income ?? null;

  // How complete is the picture? Used for the single next-step prompt.
  const checks = [
    { label: "Monthly income added", done: income != null, to: "/settings" as const },
    { label: "Bills & expenses added", done: (data?.expenses ?? []).length > 0, to: "/future-expenses" as const },
    { label: "Debts added", done: (data?.debts ?? []).length > 0, to: "/debt" as const },
    { label: "A savings goal set", done: (data?.goals ?? []).length > 0, to: "/savings" as const },
  ];
  const doneChecks = checks.filter((c) => c.done).length;
  const nextStep = checks.find((c) => !c.done);

  const plan = buildPaycheckPlan({
    profile: data?.profile ?? null,
    expenses: data?.expenses ?? [],
    debts: data?.debts ?? [],
    todayIso: todayStr,
  });

  const debtPlan = hasDebt ? buildPayoffPlan(data!.debts, "snowball") : null;

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

      {data && (
        <div className="mt-8">
          <CashOnHandEditor profile={data.profile} userId={user.id} />
        </div>
      )}

      <div className="mt-4 grid items-start gap-4 md:grid-cols-2">
        <PaycheckPlanCard plan={plan} loading={!data} />
        <NextMoneyMoveCard plan={plan} loading={!data} />
      </div>

      {/* Progress strip: savings, debt, and the debt-free goal in one glanceable row. */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/savings" className="paper-card block p-5 transition-shadow hover:shadow-md">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Saved so far</p>
          <p className="mt-2 font-serif text-2xl text-ink">{fmt(totalSaved)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Across your savings goals</p>
        </Link>

        <Link to="/debt" className="paper-card block p-5 transition-shadow hover:shadow-md">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Owed so far</p>
          <p className="mt-2 font-serif text-2xl text-ink">{fmt(totalDebt)}</p>
          <p className="mt-1 text-xs text-muted-foreground">What's left on your debts</p>
        </Link>

        <Link
          to="/debt"
          className="paper-card group flex flex-col justify-between p-5 transition-shadow hover:shadow-md sm:col-span-2 lg:col-span-1"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Debt-free goal</p>
          {debtPlan?.possible ? (
            <div className="mt-2">
              <p className="font-serif text-2xl text-ink">{debtPlan.freeLabel}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, ((debtPlan.series[0]?.balance ?? 0) - (debtPlan.series[debtPlan.series.length - 1]?.balance ?? 0)) / (debtPlan.series[0]?.balance || 1)) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {humanMonths(debtPlan.months)} away at {fmt(debtPlan.monthlyPayment)}/mo · see the plan →
              </p>
            </div>
          ) : hasDebt ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Add minimum payments on the Debt page to see your payoff date.
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No debts tracked. That’s the goal — add one here if anything changes.
            </p>
          )}
        </Link>
      </div>

      {/* One consolidated next-step prompt, only shown when something is missing. */}
      {nextStep && (
        <section className="paper-card mt-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Picture completeness: {doneChecks} of {checks.length}
              </p>
              <h2 className="mt-1 font-serif text-lg text-ink">Next step: {nextStep.label.toLowerCase()}</h2>
            </div>
            <Link
              to={nextStep.to}
              className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {nextStep.label}
            </Link>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-secondary">
            <div
              className="h-1.5 rounded-full bg-primary transition-all"
              style={{ width: `${(doneChecks / checks.length) * 100}%` }}
            />
          </div>
        </section>
      )}

      <p className="mt-6 text-xs text-muted-foreground">Today is {todayStr}.</p>
    </div>
  );
}
