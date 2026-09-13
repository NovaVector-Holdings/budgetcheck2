import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_MEETING_CHECKLIST, fmt, type MeetingChecklistItem, type MoneyMeeting } from "@/lib/money";
import { formatDay, FUNDING_TIERS } from "@/lib/decision-engine";
import { computeChangesSince } from "@/lib/changes-since";
import { recommendLesson } from "@/lib/learn-recommend";
import { LearnRecommendation } from "@/components/mm/learn-recommendation";
import type { useMoneyState } from "@/hooks/use-money-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2 } from "lucide-react";

type MoneyState = ReturnType<typeof useMoneyState>;

/** Distinguishes the monthly-review record shape from the weekly one --
 *  both are saved into the same money_meetings table, so this is how a
 *  weekly check-in knows to only diff against a PRIOR weekly check-in. */
const isMonthlyRecord = (m: MoneyMeeting) =>
  (m.checklist ?? []).some((c) => c.label === "Brought a statement to review");

function Section({ eyebrow, title, children }: { eyebrow: string; title?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border py-6 first:pt-0 last:border-0">
      <p className="eyebrow">{eyebrow}</p>
      {title && <h3 className="mt-1.5 font-serif text-xl text-ink">{title}</h3>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function WeeklyCheckIn({ userId, state, onGoToData }: { userId: string; state: MoneyState; onGoToData: () => void }) {
  const qc = useQueryClient();
  const [active, setActive] = useState(false);
  const [checklist, setChecklist] = useState<MeetingChecklistItem[]>(DEFAULT_MEETING_CHECKLIST.map((c) => ({ ...c })));
  const [notes, setNotes] = useState("");

  const { data: meetings = [] } = useQuery({
    queryKey: ["meetings", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("money_meetings")
        .select("*")
        .eq("archived", false)
        .order("held_on", { ascending: false });
      return (data ?? []) as unknown as MoneyMeeting[];
    },
  });

  const lastWeekly = useMemo(() => meetings.find((m) => !isMonthlyRecord(m)) ?? null, [meetings]);

  const changes = useMemo(
    () =>
      computeChangesSince(lastWeekly?.created_at ?? null, {
        expenses: state.expenses,
        debts: state.debts,
        goals: state.goals,
        overrides: state.overrides,
        reserved: state.reserved,
      }),
    [lastWeekly, state.expenses, state.debts, state.goals, state.overrides, state.reserved],
  );

  const snap = state.snapshot;
  const funding = snap.funding;
  const remaining = funding ? funding.available - funding.totalRequested : null;
  const shortfall = remaining != null && remaining < 0;
  const cutoffItem = funding && funding.cutoffIndex >= 0 ? funding.items[funding.cutoffIndex] : null;

  // A priority clarification is only worth asking when it would actually
  // change the answer -- i.e. there's a cutoff item and nothing has already
  // been said about ordering around it.
  const needsPriorityClarification = shortfall && !!cutoffItem && state.overrides.length === 0;

  const recommendation = useMemo(
    () =>
      recommendLesson({
        shortfall,
        goals: state.goals,
        savedByGoal: state.savedByGoal,
        debts: state.debts,
        caps: state.caps,
      }),
    [shortfall, state.goals, state.savedByGoal, state.debts, state.caps],
  );

  const focusLine = shortfall
    ? `Close the gap at ${cutoffItem?.label ?? "the cutoff line"} before anything else competes for the same dollar.`
    : funding && funding.items.length > 0
      ? `Keep ${fmt(funding.available - funding.totalRequested)} clear until ${funding.items[0]?.dueDate ? formatDay(funding.items[0].dueDate) : "your next bill"}.`
      : "Nothing urgent this week — a good week to move something toward a goal instead.";

  const doneCount = checklist.filter((c) => c.done).length;

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("money_meetings").insert({
        user_id: userId,
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
      qc.invalidateQueries({ queryKey: ["meetings", userId] });
    },
    onError: () => toast.error("Couldn't save the check-in."),
  });

  if (!active) {
    return (
      <div>
        <div className="paper-card mt-6 p-6 text-center">
          <Button size="lg" onClick={() => setActive(true)}>
            Start this week's check-in
            <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
          </Button>
        </div>
        {meetings.filter((m) => !isMonthlyRecord(m)).length > 0 && (
          <PastCheckIns meetings={meetings.filter((m) => !isMonthlyRecord(m))} />
        )}
      </div>
    );
  }

  return (
    <div className="paper-card mt-6 p-6">
      {/* 1. Opening */}
      <Section eyebrow="This week">
        <p className="font-serif text-xl text-ink">
          {lastWeekly ? "Here's what changed since your last check-in." : "Here's where things stand this week."}
        </p>
      </Section>

      {/* 2. Today's money state */}
      <Section eyebrow="Today's money state" title="What you have and what's due">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Current balance</p>
            <p className="mt-1 font-serif text-2xl text-ink">{fmt(state.engineInput.account.currentBalance)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {shortfall ? "Short by" : "Estimated remaining"}
            </p>
            <p className={`mt-1 font-serif text-2xl ${shortfall ? "text-destructive" : "text-ink"}`}>
              {remaining != null ? fmt(Math.abs(remaining)) : "—"}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-ink">{snap.headline}</p>
        {state.engineInput.safeBuffer > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">{fmt(state.engineInput.safeBuffer)} buffer kept aside.</p>
        )}
        {funding && funding.items.length > 0 && (
          <ul className="mt-3 space-y-1">
            {funding.items.slice(0, 5).map((it) => (
              <li key={it.id} className="flex justify-between text-xs text-muted-foreground">
                <span>{it.label}{it.dueDate ? ` · ${formatDay(it.dueDate)}` : ""}</span>
                <span>{fmt(it.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        {snap.window && (
          <p className="mt-2 text-xs text-muted-foreground">
            Next paycheck expected {formatDay(snap.window.end)}.
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Based on what you entered. Not a live bank balance.</p>
      </Section>

      {/* 3. What changed */}
      <Section eyebrow="What changed">
        {changes.length > 0 ? (
          <ul className="space-y-1.5 text-sm text-ink">
            {changes.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {lastWeekly ? "Nothing new since your last check-in — same bills, debts, and goals on file." : "This is your first check-in, so there's no prior week to compare against yet."}
          </p>
        )}
      </Section>

      {/* 4. What matters most */}
      <Section eyebrow="What matters most" title={state.overrides.length > 0 ? "You've told us these come first" : undefined}>
        {state.overrides.length > 0 ? (
          <ul className="space-y-2">
            {state.overrides.map((o) => (
              <li key={o.id} className="rounded-lg border border-border p-3 text-sm">
                <p className="text-ink">{o.label} — moved to {FUNDING_TIERS[o.tier - 1]?.label}</p>
                {o.reason && <p className="mt-0.5 text-xs text-muted-foreground">{o.reason}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing's been marked as a priority yet — the order above is the default. If something matters more than that order shows,{" "}
            <button type="button" className="underline hover:text-ink" onClick={onGoToData}>
              say so under Your Numbers
            </button>
            .
          </p>
        )}
      </Section>

      {/* 5. Next money move */}
      <Section eyebrow="Next money move" title="One thing to do">
        <p className="text-sm text-ink">{funding?.takeaway ?? snap.headline}</p>
        {shortfall && cutoffItem && (
          <p className="mt-2 text-sm text-muted-foreground">
            Secondary option: move {cutoffItem.label} to a priority tier if it genuinely matters more than what's ahead of it —{" "}
            <button type="button" className="underline hover:text-ink" onClick={onGoToData}>
              set that under Your Numbers
            </button>
            .
          </p>
        )}
        {snap.rebuilds.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {snap.rebuilds.map((r, i) => <li key={i}>• {r.reason}</li>)}
          </ul>
        )}
      </Section>

      {/* 6. Quick decisions */}
      {(snap.missing.length > 0 || needsPriorityClarification) && (
        <Section eyebrow="Quick decisions" title="Needs your input">
          <ul className="space-y-2">
            {snap.missing.map((m) => (
              <li key={m.field} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
                <span className="text-ink">{m.label} — not entered yet.</span>
              </li>
            ))}
            {needsPriorityClarification && (
              <li className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
                <span className="text-ink">
                  Money runs out at {cutoffItem?.label} this week — does anything shown above matter more than that order?{" "}
                  <button type="button" className="underline hover:text-ink" onClick={onGoToData}>
                    Set a priority
                  </button>{" "}
                  only if it does.
                </span>
              </li>
            )}
          </ul>
        </Section>
      )}

      {/* 7. Closeout */}
      <Section eyebrow="Closeout" title="This week, focus on…">
        <p className="text-sm text-ink">{focusLine}</p>

        {recommendation && (
          <div className="mt-4">
            <LearnRecommendation lesson={recommendation.lesson} because={recommendation.because} />
          </div>
        )}

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-ink">Quick checklist</p>
            <span className="text-xs text-muted-foreground">{doneCount} of {checklist.length} done</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-secondary">
            <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${(doneCount / checklist.length) * 100}%` }} />
          </div>
          <ul className="mt-3 space-y-2">
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
        </div>

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="mm-notes">Notes (optional)</Label>
          <Textarea id="mm-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Wins, worries, things to check next week…" rows={3} />
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Next time: we'll compare against what's on file today — {fmt(state.engineInput.account.currentBalance)}, {funding?.items.length ?? 0} obligation{funding?.items.length === 1 ? "" : "s"} tracked, {state.overrides.length} priorit{state.overrides.length === 1 ? "y" : "ies"} set.
        </p>

        <div className="mt-4 flex gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden />
            Save check-in
          </Button>
          <Button variant="outline" onClick={() => setActive(false)}>Cancel</Button>
        </div>
      </Section>
    </div>
  );
}

function PastCheckIns({ meetings }: { meetings: MoneyMeeting[] }) {
  return (
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
  );
}
