import { createFileRoute, Link } from "@tanstack/react-router";
import { useMoneyState } from "@/hooks/use-money-state";
import { MoneyDataGate } from "@/components/money-data-gate";
import { PaycheckBriefing } from "@/components/overview/paycheck-briefing";
import { DebtFreeCard } from "@/components/overview/debt-free-card";
import { debtFreeCardState } from "@/lib/debt-free-card";
import { planStatusFromState } from "@/lib/plan-status";
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

type MoneyState = ReturnType<typeof useMoneyState>;

function OverviewPage() {
  const { user } = Route.useRouteContext();
  const state = useMoneyState(user.id);

  return (
    <div>
      <p className="eyebrow">Overview</p>
      <h1 className="mt-2 font-serif text-3xl text-ink">
        Hey{state.profile?.display_name ? ` ${state.profile.display_name}` : ""} — here's your
        paycheck briefing
      </h1>

      {/* Data gate (SME/CEO return): nothing below the greeting renders until
          every engine source has loaded, and a failed source becomes an
          explicit "can't calculate" card with a retry -- never a $0, a
          "No debts tracked", or a healthy-looking plan built from [].
          Everything inside is rendered only when ready. */}
      <div className="mt-8">
        <MoneyDataGate state={state}>
          <OverviewBody state={state} userId={user.id} />
        </MoneyDataGate>
      </div>
    </div>
  );
}

function OverviewBody({ state, userId }: { state: MoneyState; userId: string }) {
  // ONE PlanStatus, computed once and shared by the briefing and the
  // Debt-free card, so the two can never describe the plan differently.
  const view = planStatusFromState(state);

  const totalSaved = [...state.savedByGoal.values()].reduce((s, n) => s + n, 0);
  const totalDebt = state.debts.reduce((s, d) => s + Math.max(0, Number(d.balance)), 0);
  const card = debtFreeCardState({
    debts: state.debts,
    obligations: state.engineInput.obligations.debts,
    status: view.status,
  });

  return (
    <>
      {/* Gate 1 — the decision spine. Estimated remaining is the only
          oversized figure on the page; everything below is real,
          useful, and deliberately smaller.

          Gate 2 remediation: the balance and its Update control live INSIDE
          the briefing's calculation (there is no second "Current balance"
          card repeating the same figure), and the free-text "Your focus"
          line is gone -- the briefing carries the ONE next focus, derived
          from the plan, so the page never states two competing priorities. */}
      <PaycheckBriefing state={state} userId={userId} view={view} />

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

        <DebtFreeCard card={card} />
      </div>
    </>
  );
}
