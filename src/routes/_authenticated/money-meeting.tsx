import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_MEETING_CHECKLIST, fmt, type MeetingChecklistItem, type MoneyMeeting } from "@/lib/money";
import { formatDay } from "@/lib/decision-engine";
import { useMoneyState } from "@/hooks/use-money-state";
import { Assistant } from "@/components/mm/assistant";
import { DataPanel } from "@/components/mm/data-panel";
import { ImportPanel } from "@/components/mm/import-panel";
import { ArtifactShelf } from "@/components/mm/artifact-shelf";
import { CoachSession } from "@/components/coach-session";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";

const TAB_KEYS = ["weekly", "monthly", "ask", "plans", "statements", "data"] as const;

export const Route = createFileRoute("/_authenticated/money-meeting")({
  validateSearch: (search: Record<string, unknown>): { tab?: (typeof TAB_KEYS)[number] } =>
    TAB_KEYS.includes(search.tab as (typeof TAB_KEYS)[number])
      ? { tab: search.tab as (typeof TAB_KEYS)[number] }
      : {},
  head: () => ({
    meta: [
      { title: "Money meeting — BudgetChek" },
      { name: "description", content: "A short weekly check-in, a fuller monthly review, and a place to ask questions about your own numbers." },
      { property: "og:title", content: "Money meeting — BudgetChek" },
      { property: "og:description", content: "A short weekly check-in, a fuller monthly review, and a place to ask questions about your own numbers." },
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
  const qc = useQueryClient();
  const search = Route.useSearch();
  const [tab, setTab] = useState<Tab>(search.tab ?? "weekly");
  const state = useMoneyState(user.id);
  const meta = TABS.find((t) => t.key === tab)!;

  // Weekly check-in
  const [active, setActive] = useState(false);
  const [checklist, setChecklist] = useState<MeetingChecklistItem[]>(DEFAULT_MEETING_CHECKLIST);
  const [notes, setNotes] = useState("");

  const { data: meetings = [] } = useQuery({
    queryKey: ["meetings", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("money_meetings")
        .select("*")
        .eq("archived", false)
        .order("held_on", { ascending: false });
      return (data ?? []) as unknown as MoneyMeeting[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("money_meetings").insert({
        user_id: user.id,
        checklist: JSON.parse(JSON.stringify(checklist)),
        notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Check-in saved. See you next week.");
      setActive(false);
      setChecklist(DEFAULT_MEETING_CHECKLIST.map((c) => ({ ...c })));
      setNotes("");
      qc.invalidateQueries({ queryKey: ["meetings", user.id] });
    },
    onError: () => toast.error("Couldn't save the check-in."),
  });

  const doneCount = checklist.filter((c) => c.done).length;
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
              tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-ink"
            }`}
          >
            {t.nav}
          </button>
        ))}
      </div>

      {/* One shared read on where things stand, so every mode starts from the same figure. */}
      <div className="paper-card mt-5 p-5">
        <p className="text-sm text-ink">{snap.headline}</p>
        {snap.projection && snap.window && (
          <p className="mt-2 text-sm text-muted-foreground">
            Between today and {formatDay(snap.window.end)} you're projected to have{" "}
            <span className="font-medium text-ink">{fmt(snap.projection.projectedMinBalance)}</span> at your lowest point
            {snap.reservedTotal > 0 ? `, with ${fmt(snap.reservedTotal)} held back and not counted` : ""}.
          </p>
        )}
        {snap.missing.length > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            Still needed: {snap.missing.map((m) => m.label.toLowerCase()).join(", ")}.{" "}
            <button type="button" className="underline hover:text-ink" onClick={() => setTab("data")}>
              Add it now
            </button>
          </p>
        )}
        {snap.rebuilds.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {snap.rebuilds.map((r, i) => <li key={i}>{r.reason}</li>)}
          </ul>
        )}
      </div>

      {tab === "weekly" && (
        <>
          {!active ? (
            <div className="paper-card mt-6 p-6 text-center">
              <Button size="lg" onClick={() => setActive(true)}>
                Start this week's check-in
                <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
              </Button>
            </div>
          ) : (
            <div className="paper-card mt-6 p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-lg text-ink">This week</h2>
                <span className="text-sm text-muted-foreground">{doneCount} of {checklist.length} done</span>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-secondary">
                <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${(doneCount / checklist.length) * 100}%` }} />
              </div>
              <ul className="mt-4 space-y-2">
                {checklist.map((item, i) => (
                  <li key={i}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-secondary/50">
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() => setChecklist((prev) => prev.map((c, j) => (j === i ? { ...c, done: !c.done } : c)))}
                        className="h-4 w-4 accent-primary"
                      />
                      <span className={`text-sm ${item.done ? "text-muted-foreground line-through" : "text-ink"}`}>{item.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="mt-4 space-y-1.5">
                <Label htmlFor="mm-notes">Notes (optional)</Label>
                <Textarea id="mm-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Wins, worries, things to check next week…" rows={3} />
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={() => save.mutate()} disabled={save.isPending}>Save check-in</Button>
                <Button variant="outline" onClick={() => setActive(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {meetings.length > 0 && (
            <section className="mt-8">
              <h2 className="font-serif text-lg text-ink">Past check-ins</h2>
              <ul className="mt-3 space-y-3">
                {meetings.slice(0, 8).map((m) => {
                  const done = (m.checklist ?? []).filter((c) => c.done).length;
                  return (
                    <li key={m.id} className="paper-card p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-ink">{m.held_on}</span>
                        <span className="text-xs text-muted-foreground">{done}/{(m.checklist ?? []).length} done</span>
                      </div>
                      {m.notes && <p className="mt-2 text-sm text-muted-foreground">{m.notes}</p>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      {tab === "monthly" && <CoachSession userId={user.id} monthlyIncome={state.profile?.monthly_income ?? null} />}

      {tab === "ask" && (
        <Assistant
          userId={user.id}
          snapshot={snap}
          context={{
            accounts: state.accounts.map((a) => ({ name: a.name, kind: a.kind, balance: Number(a.current_balance), limit: a.credit_limit })),
            reserved: state.reserved.map((r) => ({ label: r.label, amount: Number(r.amount), tapped: Number(r.tapped_amount), purpose: r.purpose })),
            caps: state.caps.map((c) => ({ category: c.category, cap: Number(c.cap_amount) })),
            bills: state.expenses.map((e) => ({ name: e.name, amount: Number(e.amount), due: e.due_date, paid: e.paid })),
            debts: state.debts.map((d) => ({ name: d.name, balance: Number(d.balance), apr: d.apr, minimum: d.minimum_payment })),
            goals: state.goals.map((g) => ({ name: g.name, target: Number(g.target_amount), saved: state.savedByGoal.get(g.id) ?? 0 })),
            payFrequency: state.profile?.pay_frequency ?? null,
            nextPayDate: state.profile?.next_pay_date ?? null,
            budgetMethod: state.profile?.budget_method ?? null,
            latestStatement: state.imports[0]
              ? { period: [state.imports[0].period_start, state.imports[0].period_end], rows: state.imports[0].txn_count }
              : null,
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
          overrides={state.overrides.map((o) => ({ id: o.id, label: o.label, tier: o.tier, reason: o.reason }))}
        />
      )}
    </div>
  );
}
