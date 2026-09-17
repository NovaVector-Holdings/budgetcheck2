import { createFileRoute, Link } from "@tanstack/react-router";
import { useMoneyState } from "@/hooks/use-money-state";
import { PaycheckBriefing } from "@/components/overview/paycheck-briefing";
import { CashOnHandEditor } from "@/components/paycheck-cards";
import { buildPayoffPlan, humanMonths } from "@/lib/payoff";
import { fmt } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/overview")({
  head: () => ({
    meta: [
      { title: "Your money overview — BudgetChek" },
      {
        name: "description",
        content: "What your next paycheck needs to cover, and what's estimated to remain.",
      },
      { property: "og:title", content: "Your money overview — BudgetChek" },
      {
        property: "og:description",
        content: "What your next paycheck needs to cover, and what's estimated to remain.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OverviewPage,
});

function OverviewPage() {
  const { user } = Route.useRouteContext();
  const state = useMoneyState(user.id);

  const totalSaved = [...state.savedByGoal.values()].reduce((s, n) => s + n, 0);
  const totalDebt = state.debts.reduce((s, d) => s + Number(d.balance), 0);
  const hasDebt = state.debts.length > 0;
  const debtPlan = hasDebt ? buildPayoffPlan(state.debts, "snowball") : null;

  return (
    <div>
      <p className="eyebrow">Overview</p>
      <h1 className="mt-2 font-serif text-3xl text-ink">
        Hey{state.profile?.display_name ? ` ${state.profile.display_name}` : ""} — here's your
        paycheck briefing
      </h1>
      {state.profile?.money_goal && (
        <p className="mt-2 text-sm text-muted-foreground">
          Your focus: <span className="font-medium text-ink">{state.profile.money_goal}</span>
        </p>
      )}

      {/* Gate 1 — the decision spine. Estimated remaining is the only
          oversized figure on the page; everything below is real,
          useful, and deliberately smaller. */}
      <div className="mt-8">
        <PaycheckBriefing state={state} />
      </div>

      {/* Gate 1 fix, discovered while building this exact page:
          CashOnHandEditor's `editing` state initializes from `useState`
          on first mount, when `profile` is always still null (the query
          hasn't resolved yet) -- so it opened in "enter your balance"
          mode even when a real balance was already on file, every
          single page load. Not rendering it until the real state has
          loaded means its own first mount sees the real profile value,
          which is all the fix needs (CashOnHandEditor itself untouched). */}
      {!state.loading && (
        <div className="mt-4">
          <CashOnHandEditor profile={state.profile} userId={user.id} />
        </div>
      )}

      {/* Secondary context -- kept because Round-2 evidence said people
          valued it, but never sized or positioned to compete with the
          paycheck briefing above. */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/savings" className="paper-card block p-5 transition-shadow hover:shadow-md">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Saved so far
          </p>
          <p className="mt-2 font-serif text-xl text-ink">{fmt(totalSaved)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Across your savings goals</p>
        </Link>

        <Link to="/debt" className="paper-card block p-5 transition-shadow hover:shadow-md">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Owed so far
          </p>
          <p className="mt-2 font-serif text-xl text-ink">{fmt(totalDebt)}</p>
          <p className="mt-1 text-xs text-muted-foreground">What's left on your debts</p>
        </Link>

        <Link
          to="/debt"
          className="paper-card group flex flex-col justify-between p-5 transition-shadow hover:shadow-md sm:col-span-2 lg:col-span-1"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Debt-free goal
          </p>
          {debtPlan?.possible ? (
            <div className="mt-2">
              <p className="font-serif text-xl text-ink">{debtPlan.freeLabel}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(100, Math.max(0, ((debtPlan.series[0]?.balance ?? 0) - (debtPlan.series[debtPlan.series.length - 1]?.balance ?? 0)) / (debtPlan.series[0]?.balance || 1))) * 100}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {humanMonths(debtPlan.months)} away at {fmt(debtPlan.monthlyPayment)}/mo · see the
                plan →
              </p>
            </div>
          ) : hasDebt ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Add minimum payments on the Debt page to see your payoff date.
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No debts tracked. That's the goal — add one here if anything changes.
            </p>
          )}
        </Link>
      </div>
    </div>
  );
}
