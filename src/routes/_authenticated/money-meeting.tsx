import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { fmt } from "@/lib/money";
import { formatDay } from "@/lib/decision-engine";
import { useMoneyState } from "@/hooks/use-money-state";
import { Assistant } from "@/components/mm/assistant";
import { DataPanel } from "@/components/mm/data-panel";
import { ImportPanel } from "@/components/mm/import-panel";
import { ArtifactShelf } from "@/components/mm/artifact-shelf";
import { WeeklyCheckIn } from "@/components/mm/weekly-check-in";
import { CoachSession } from "@/components/coach-session";

const TAB_KEYS = ["weekly", "monthly", "ask", "plans", "statements", "data"] as const;

export const Route = createFileRoute("/_authenticated/money-meeting")({
  validateSearch: (search: Record<string, unknown>): { tab?: (typeof TAB_KEYS)[number] } =>
    TAB_KEYS.includes(search.tab as (typeof TAB_KEYS)[number])
      ? { tab: search.tab as (typeof TAB_KEYS)[number] }
      : {},
  head: () => ({
    meta: [
      { title: "Money meeting — BudgetChek" },
      {
        name: "description",
        content:
          "A short weekly check-in, a fuller monthly review, and a place to ask questions about your own numbers.",
      },
      { property: "og:title", content: "Money meeting — BudgetChek" },
      {
        property: "og:description",
        content:
          "A short weekly check-in, a fuller monthly review, and a place to ask questions about your own numbers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MoneyMeetingPage,
});

type Tab = "weekly" | "monthly" | "ask" | "plans" | "statements" | "data";

/** Each mode is a different kind of sitting-down, so each gets its own framing. */
const TABS: { key: Tab; nav: string; eyebrow: string; heading: string; caption: string }[] = [
  {
    key: "weekly",
    nav: "Weekly check-in",
    eyebrow: "Weekly check-in",
    heading: "Ten minutes with your money",
    caption:
      "A quick pass through the week — alone, with a partner, or with a friend. Tick off the short list, note anything that surprised you, and get on with your day.",
  },
  {
    key: "monthly",
    nav: "Monthly review",
    eyebrow: "Monthly review",
    heading: "Close out the month properly",
    caption:
      "A longer, guided sit-down once a month: bring in a statement, update your balances, name what worked and what slipped, and leave with one thing to do next.",
  },
  {
    key: "ask",
    nav: "Ask a question",
    eyebrow: "Ask a question",
    heading: "Talk it through with your own numbers",
    caption:
      "Ask about a bill, a payoff, a date, or a decision you're weighing. Answers use only the figures you've entered — nothing is assumed and nothing is looked up elsewhere.",
  },
  {
    key: "plans",
    nav: "Plans & printouts",
    eyebrow: "Plans and printouts",
    heading: "Something you can act on today",
    caption:
      "Build a plan from your own figures, keep it, tick it off, and redo it later with newer numbers. All of them print cleanly.",
  },
  {
    key: "statements",
    nav: "Statements",
    eyebrow: "Statements",
    heading: "Read a statement without the guesswork",
    caption:
      "Bring in a CSV, XLS or XLSX export. Charges are sorted by what the description actually says, compared with what you already told us, and anything odd is queried rather than assumed.",
  },
  {
    key: "data",
    nav: "Your numbers",
    eyebrow: "Your numbers",
    heading: "What the answers are built from",
    caption:
      "Accounts, money set aside, the ceilings you've chosen, and how charges get read. Change anything here and every answer above updates with it.",
  },
];

function MoneyMeetingPage() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const [tab, setTab] = useState<Tab>(search.tab ?? "weekly");
  const state = useMoneyState(user.id);
  const meta = TABS.find((t) => t.key === tab)!;
  const snap = state.snapshot;

  return (
    <div>
      <p className="eyebrow">{meta.eyebrow}</p>
      <h1 className="mt-2 font-serif text-3xl text-ink">{meta.heading}</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{meta.caption}</p>

      <div className="mt-5 flex flex-wrap gap-1 rounded-xl border border-border p-1 print:hidden">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3.5 py-1.5 text-sm transition-colors ${
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-ink"
            }`}
          >
            {t.nav}
          </button>
        ))}
      </div>

      {/* Weekly and monthly are now full guided reviews with their own framing;
          the other tabs still share this one at-a-glance figure. */}
      {tab !== "weekly" && tab !== "monthly" && (
        <div className="paper-card mt-5 p-5">
          <p className="text-sm text-ink">{snap.headline}</p>
          {snap.projection && snap.window && (
            <p className="mt-2 text-sm text-muted-foreground">
              Between today and {formatDay(snap.window.end)} you're projected to have{" "}
              <span className="font-medium text-ink">
                {fmt(snap.projection.projectedMinBalance)}
              </span>{" "}
              at your lowest point
              {snap.reservedTotal > 0
                ? `, with ${fmt(snap.reservedTotal)} held back and not counted`
                : ""}
              .
            </p>
          )}
          {snap.missing.length > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              Still needed: {snap.missing.map((m) => m.label.toLowerCase()).join(", ")}.{" "}
              <button
                type="button"
                className="underline hover:text-ink"
                onClick={() => setTab("data")}
              >
                Add it now
              </button>
            </p>
          )}
          {snap.rebuilds.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-ink">
              {snap.rebuilds.map((r, i) => (
                <li key={i}>{r.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "weekly" && (
        <WeeklyCheckIn userId={user.id} state={state} onGoToData={() => setTab("data")} />
      )}

      {tab === "monthly" && (
        <CoachSession
          userId={user.id}
          monthlyIncome={state.profile?.monthly_income ?? null}
          state={state}
          onGoToData={() => setTab("data")}
        />
      )}

      {tab === "ask" && (
        <Assistant
          userId={user.id}
          snapshot={snap}
          // Only what the assistant's supported question types actually need.
          // `budgetMethod` (a display label the engine never consumes) and
          // `latestStatement` (a period + row count with no line-item value,
          // and Statements already has its own dedicated view) were sent
          // before purely because they were available -- removed. See the
          // PR description's data-flow map for the full field-by-field call.
          context={{
            accounts: state.accounts.map((a) => ({
              name: a.name,
              kind: a.kind,
              balance: Number(a.current_balance),
              limit: a.credit_limit,
            })),
            reserved: state.reserved.map((r) => ({
              label: r.label,
              amount: Number(r.amount),
              tapped: Number(r.tapped_amount),
              purpose: r.purpose,
            })),
            caps: state.caps.map((c) => ({ category: c.category, cap: Number(c.cap_amount) })),
            bills: state.expenses.map((e) => ({
              name: e.name,
              amount: Number(e.amount),
              due: e.due_date,
              paid: e.paid,
            })),
            debts: state.debts.map((d) => ({
              name: d.name,
              balance: Number(d.balance),
              apr: d.apr,
              minimum: d.minimum_payment,
              // Debts have no due-date column at all today -- always
              // null, honestly reflecting a permanently-missing field
              // (not "not yet loaded"). This is what makes the
              // assistant's "add_missing_due_date" action meaningfully
              // real for a debt: the due date genuinely isn't on file.
              due: null,
            })),
            goals: state.goals.map((g) => ({
              name: g.name,
              target: Number(g.target_amount),
              saved: state.savedByGoal.get(g.id) ?? 0,
            })),
            payFrequency: state.profile?.pay_frequency ?? null,
            nextPayDate: state.profile?.next_pay_date ?? null,
          }}
        />
      )}

      {tab === "plans" && (
        <ArtifactShelf
          userId={user.id}
          engineInput={state.engineInput}
          profile={state.profile}
          debts={state.debts}
          goals={state.goals}
          expenses={state.expenses}
          caps={state.caps}
          savedByGoal={state.savedByGoal}
          imports={state.imports}
          artifacts={state.artifacts}
        />
      )}

      {tab === "statements" && (
        <ImportPanel
          userId={user.id}
          rules={state.rules}
          userRules={state.userRules}
          imports={state.imports}
          knownBills={state.expenses.map((e) => ({ name: e.name, amount: Number(e.amount) }))}
          onImported={() => setTab("plans")}
        />
      )}

      {tab === "data" && (
        <DataPanel
          userId={user.id}
          accounts={state.accounts}
          reserved={state.reserved}
          caps={state.caps}
          rules={state.rules}
          overrides={state.overrides.map((o) => ({
            id: o.id,
            label: o.label,
            tier: o.tier,
            reason: o.reason,
          }))}
          expenses={state.expenses.map((e) => ({ id: e.id, name: e.name }))}
          debts={state.debts.map((d) => ({ id: d.id, name: d.name }))}
          goals={state.goals.map((g) => ({ id: g.id, name: g.name }))}
        />
      )}
    </div>
  );
}
