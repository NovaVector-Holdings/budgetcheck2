import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DebtFreeDate } from "@/components/debt-free-date";
import { CashOnHandEditor, NextMoneyMoveCard, PaycheckPlanCard } from "@/components/paycheck-cards";
import { BudgetMethodView } from "@/components/budget-method-view";
import { buildPaycheckPlan } from "@/lib/paycheck";
import type { BudgetMethod } from "@/lib/budget-methods";
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

  const now = new Date();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const todayStr = today();

  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);
  const upcoming = (data?.expenses ?? []).filter((e) => e.due_date <= in30.toISOString().slice(0, 10));
  const restOfMonth = (data?.expenses ?? []).filter((e) => e.due_date >= todayStr && e.due_date <= monthEnd);
  const restOfMonthTotal = restOfMonth.reduce((s, e) => s + Number(e.amount), 0);
  const totalSaved = (data?.deposits ?? []).reduce((s, d) => s + Number(d.amount), 0);
  const totalDebt = (data?.debts ?? []).reduce((s, d) => s + Number(d.balance), 0);

  const income = data?.profile?.monthly_income ?? null;
  const estimate = income != null ? income - restOfMonthTotal : null;

  // How complete is the picture? Confidence in the estimate depends on it.
  const checks = [
    { label: "Monthly income added", done: income != null, to: "/settings" as const },
    { label: "Bills & expenses added", done: (data?.expenses ?? []).length > 0, to: "/future-expenses" as const },
    { label: "Debts added", done: (data?.debts ?? []).length > 0, to: "/debt" as const },
    { label: "A savings goal set", done: (data?.goals ?? []).length > 0, to: "/savings" as const },
  ];
  const doneChecks = checks.filter((c) => c.done).length;
  const nextStep = checks.find((c) => !c.done);

  // Paycheck-cycle plan. Refuses to produce a number when an input is missing.
  const plan = buildPaycheckPlan({
    profile: data?.profile ?? null,
    expenses: data?.expenses ?? [],
    debts: data?.debts ?? [],
    todayIso: todayStr,
  });

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthExpenses = (data?.expenses ?? []).filter((e) => e.due_date >= monthStart && e.due_date <= monthEnd);
  const monthDeposits = (data?.deposits ?? []).filter((d) => d.deposited_on >= monthStart && d.deposited_on <= monthEnd);
  const budgetMethod = (data?.profile?.budget_method ?? "fifty_thirty_twenty") as BudgetMethod;


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

      {/* Cash on hand feeds the two cards below it, so it comes first. */}
      <div className="mt-8">
        <CashOnHandEditor profile={data?.profile ?? null} userId={user.id} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <PaycheckPlanCard plan={plan} loading={!data} />
        <NextMoneyMoveCard plan={plan} loading={!data} />
      </div>

      {/* The one number people said matters most, with a plain explanation of what it is. */}
      <section className="paper-card mt-8 p-6 sm:p-8">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Estimated left this month
        </p>
        <p className="mt-2 font-serif text-4xl text-ink sm:text-5xl">
          {estimate != null ? fmt(estimate) : "Add your income"}
        </p>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {income != null ? (
            <>
              This is your monthly income of {fmt(income)} minus {fmt(restOfMonthTotal)} of bills and
              expenses still due before the end of the month.
            </>
          ) : (
            <>Add your monthly income in Settings and we can estimate what's left after your bills.</>
          )}
        </p>
        <p className="mt-2 max-w-xl text-xs leading-relaxed text-muted-foreground">
          It's an estimate, not a guarantee — it only knows what you've entered, and it doesn't include
          day-to-day spending. Treat it as a ceiling, not spending money.
        </p>

        <div className="mt-5 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink">
              How complete your picture is: {doneChecks} of {checks.length}
            </p>
            {nextStep && (
              <Link to={nextStep.to} className="text-sm font-medium text-primary hover:underline">
                {nextStep.label} →
              </Link>
            )}
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-secondary">
            <div
              className="h-1.5 rounded-full bg-primary transition-all"
              style={{ width: `${(doneChecks / checks.length) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {doneChecks === checks.length
              ? "You've added everything we ask for — this estimate is as accurate as it gets."
              : "The more you add, the more you can trust the number above."}
          </p>
        </div>
      </section>

      {/* Two supporting numbers only — kept separate so savings and debt don't read as one thing. */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
      </div>

      {(data?.debts ?? []).length > 0 && (
        <div className="mt-4">
          <DebtFreeDate debts={data?.debts ?? []} method="snowball" compact />
        </div>
      )}

      <div className="mt-4">
        <BudgetMethodView
          method={budgetMethod}
          input={{
            income: data?.profile?.monthly_income ?? null,
            monthExpenses,
            debts: data?.debts ?? [],
            monthDeposits,
          }}
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="paper-card p-6">
          <h2 className="font-serif text-lg text-ink">Coming up</h2>
          <p className="mt-1 text-xs text-muted-foreground">Bills due in the next 30 days</p>
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
          {upcoming.length > 5 && (
            <Link to="/future-expenses" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
              See all {upcoming.length}
            </Link>
          )}
        </section>
        <section className="paper-card p-6">
          <h2 className="font-serif text-lg text-ink">One move to make next</h2>
          {nextStep ? (
            <>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {nextStep.label} — that's the piece missing from your picture, and it's the fastest way to
                make the number above worth trusting.
              </p>
              <Link to={nextStep.to} className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                {nextStep.label}
              </Link>
            </>
          ) : (
            <>
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
            </>
          )}
        </section>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Today is {todayStr}.</p>
    </div>
  );
}

