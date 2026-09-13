import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmt, today, type Debt, type SavingsDeposit, type SavingsGoal } from "@/lib/money";
import { parseStatement, reviewStatement, type Txn } from "@/lib/statement-review";
import { StatementReport } from "@/components/statement-report";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type Step = "intro" | "file" | "balances" | "report";

function Coach({ line, sub }: { line: string; sub?: string }) {
  return (
    <div className="flex items-start gap-4">
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-lg text-primary-foreground"
        aria-hidden
      >
        C
      </div>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Chek · your review guide</p>
        <p className="mt-1 font-serif text-xl text-ink">{line}</p>
        {sub && <p className="mt-2 text-sm text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

export function CoachSession({ userId, monthlyIncome }: { userId: string; monthlyIncome: number | null }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("intro");
  const [text, setText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const review = useMemo(() => (txns.length ? reviewStatement(txns) : null), [txns]);

  const { data: goals = [] } = useQuery({
    queryKey: ["goals", userId],
    queryFn: async () => {
      const { data } = await supabase.from("savings_goals").select("*").eq("archived", false).order("created_at");
      return (data ?? []) as SavingsGoal[];
    },
  });
  const { data: deposits = [] } = useQuery({
    queryKey: ["deposits", userId],
    queryFn: async () => {
      const { data } = await supabase.from("savings_deposits").select("*");
      return (data ?? []) as SavingsDeposit[];
    },
  });
  const { data: debts = [] } = useQuery({
    queryKey: ["debts", userId],
    queryFn: async () => {
      const { data } = await supabase.from("debts").select("*").eq("archived", false).order("created_at");
      return (data ?? []) as Debt[];
    },
  });

  const savedByGoal = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of deposits) m.set(d.goal_id, (m.get(d.goal_id) ?? 0) + Number(d.amount));
    return m;
  }, [deposits]);

  function startAnalyze(raw: string) {
    const parsed = parseStatement(raw);
    if (!parsed.length) {
      toast.error("Couldn't read that. Each row needs a date, a description, and an amount.");
      return;
    }
    setAnalyzing(true);
    window.setTimeout(() => {
      setTxns(parsed);
      setAnalyzing(false);
      setStep("balances");
    }, 1400);
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => startAnalyze(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  // Status lines built only from the numbers the user has entered.
  const status = useMemo(() => {
    const wins: string[] = [];
    const gaps: string[] = [];

    for (const g of goals) {
      const before = savedByGoal.get(g.id) ?? 0;
      const entered = Number(balances[`goal:${g.id}`]);
      const now = Number.isFinite(entered) && balances[`goal:${g.id}`] ? entered : before;
      const pct = g.target_amount ? Math.round((now / Number(g.target_amount)) * 100) : 0;
      if (now > before) wins.push(`${g.name}: up ${fmt(now - before)} since your last recorded amount — now ${fmt(now)} of ${fmt(Number(g.target_amount))} (${pct}%).`);
      else if (pct >= 100) wins.push(`${g.name}: goal reached at ${fmt(now)}.`);
      else gaps.push(`${g.name}: still ${fmt(Number(g.target_amount) - now)} to go (${pct}% there).`);
    }

    for (const d of debts) {
      const entered = Number(balances[`debt:${d.id}`]);
      const now = Number.isFinite(entered) && balances[`debt:${d.id}`] ? entered : Number(d.balance);
      const diff = Number(d.balance) - now;
      if (diff > 0) wins.push(`${d.name}: down ${fmt(diff)} — balance is now ${fmt(now)}.`);
      else if (diff < 0) gaps.push(`${d.name}: up ${fmt(-diff)} to ${fmt(now)}. Worth a look at what got charged.`);
      else gaps.push(`${d.name}: unchanged at ${fmt(now)}.`);
    }

    if (review) {
      if (review.net >= 0) wins.push(`Your statement showed ${fmt(review.net)} more in than out.`);
      else gaps.push(`Your statement showed ${fmt(Math.abs(review.net))} more out than in.`);
      if (review.feesTotal > 0) gaps.push(`${fmt(review.feesTotal)} went to fees — the easiest money to win back.`);
      if (review.transfersTotal > 0) gaps.push(`${fmt(review.transfersTotal)} left as unlabeled transfers.`);
      if (monthlyIncome && review.income > 0) {
        wins.push(`Deposits in the file added up to ${fmt(review.income)} against the ${fmt(monthlyIncome)} monthly income on your profile.`);
      }
    }

    return { wins, gaps };
  }, [goals, debts, savedByGoal, balances, review, monthlyIncome]);

  const finish = useMutation({
    mutationFn: async () => {
      // Record the balance updates the user gave us.
      for (const g of goals) {
        const raw = balances[`goal:${g.id}`];
        if (!raw) continue;
        const now = Number(raw);
        const before = savedByGoal.get(g.id) ?? 0;
        if (!Number.isFinite(now) || now <= before) continue;
        await supabase.from("savings_deposits").insert({
          user_id: userId,
          goal_id: g.id,
          amount: now - before,
          note: "Monthly review update",
          deposited_on: today(),
        });
      }
      for (const d of debts) {
        const raw = balances[`debt:${d.id}`];
        if (!raw) continue;
        const now = Number(raw);
        if (!Number.isFinite(now) || now === Number(d.balance)) continue;
        const paid = Number(d.balance) - now;
        await supabase.from("debts").update({ balance: now }).eq("id", d.id);
        if (paid > 0) {
          await supabase.from("debt_payments").insert({
            user_id: userId,
            debt_id: d.id,
            amount: paid,
            paid_on: today(),
          });
        }
      }

      const checklist = [
        { label: "Brought a statement to review", done: txns.length > 0 },
        { label: "Updated savings and debt balances", done: Object.values(balances).some(Boolean) },
        { label: "Named this month's wins", done: status.wins.length > 0 },
        { label: "Named this month's gaps", done: status.gaps.length > 0 },
        { label: "Picked next month's one move", done: notes.trim().length > 0 },
      ];
      const summary = [
        review ? `Statement ${review.start} to ${review.end}: ${fmt(review.income)} in, ${fmt(review.spend)} out.` : null,
        status.wins.length ? `Wins — ${status.wins.join(" ")}` : null,
        status.gaps.length ? `Gaps — ${status.gaps.join(" ")}` : null,
        notes.trim() ? `Next month: ${notes.trim()}` : null,
      ].filter(Boolean).join("\n");

      const { error } = await supabase.from("money_meetings").insert({
        user_id: userId,
        checklist: JSON.parse(JSON.stringify(checklist)),
        notes: summary || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Monthly review saved.");
      qc.invalidateQueries({ queryKey: ["meetings", userId] });
      qc.invalidateQueries({ queryKey: ["goals", userId] });
      qc.invalidateQueries({ queryKey: ["deposits", userId] });
      qc.invalidateQueries({ queryKey: ["debts", userId] });
      setStep("intro");
      setTxns([]); setText(""); setBalances({}); setNotes("");
    },
    onError: () => toast.error("Couldn't save the review."),
  });

  if (step === "intro") {
    return (
      <div className="paper-card mt-6 p-6">
        <Coach
          line="Ready for your monthly review?"
          sub="We'll do it in three short moves: look at a statement together, update what you've saved and what you owe, then read back your wins and your gaps side by side. Around ten minutes. Nothing here is graded."
        />
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => setStep("file")}>Start the review</Button>
          <Button variant="outline" onClick={() => setStep("balances")}>Skip the statement</Button>
        </div>
      </div>
    );
  }

  if (step === "file") {
    return (
      <div className="paper-card mt-6 p-6">
        <Coach
          line="First — bring me a statement."
          sub="Export a CSV from your bank for last month (look for Statements, Activity, or Export). It's read in your browser only. No file handy? Skip it and we'll work from your balances."
        />
        {analyzing ? (
          <div className="mt-6 flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
            Reading your rows and adding up the months…
          </div>
        ) : (
          <>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <Button onClick={() => fileRef.current?.click()}>Upload CSV file</Button>
              <Button variant="ghost" onClick={() => setStep("balances")}>I don't have one — skip</Button>
            </div>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="coach-paste">…or paste rows</Label>
              <Textarea id="coach-paste" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={"2026-08-01, Paycheck, 1450.00\n2026-08-02, Grocery store, -84.12"} />
              <Button className="mt-2" variant="secondary" onClick={() => startAnalyze(text)}>Analyze these rows</Button>
            </div>
          </>
        )}
      </div>
    );
  }

  if (step === "balances") {
    return (
      <div className="paper-card mt-6 p-6">
        <Coach
          line="Now the balances — take your time."
          sub="Open your accounts and enter what's true today. If you need to go gather the numbers, pause here and come back; nothing is lost until you save at the end."
        />
        <div className="mt-6 space-y-5">
          {goals.length > 0 && (
            <div>
              <p className="eyebrow">Savings — amount set aside today</p>
              <div className="mt-2 space-y-2">
                {goals.map((g) => {
                  const before = savedByGoal.get(g.id) ?? 0;
                  return (
                    <div key={g.id} className="flex flex-wrap items-center gap-3">
                      <Label htmlFor={`goal-${g.id}`} className="min-w-40 flex-1 text-sm text-ink">
                        {g.name}
                        <span className="ml-2 text-xs text-muted-foreground">last recorded {fmt(before)}</span>
                      </Label>
                      <Input
                        id={`goal-${g.id}`}
                        inputMode="decimal"
                        className="w-32"
                        placeholder={String(before)}
                        value={balances[`goal:${g.id}`] ?? ""}
                        onChange={(e) => setBalances((b) => ({ ...b, [`goal:${g.id}`]: e.target.value }))}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {debts.length > 0 && (
            <div>
              <p className="eyebrow">Debts — balance today</p>
              <div className="mt-2 space-y-2">
                {debts.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center gap-3">
                    <Label htmlFor={`debt-${d.id}`} className="min-w-40 flex-1 text-sm text-ink">
                      {d.name}
                      <span className="ml-2 text-xs text-muted-foreground">last recorded {fmt(Number(d.balance))}</span>
                    </Label>
                    <Input
                      id={`debt-${d.id}`}
                      inputMode="decimal"
                      className="w-32"
                      placeholder={String(d.balance)}
                      value={balances[`debt:${d.id}`] ?? ""}
                      onChange={(e) => setBalances((b) => ({ ...b, [`debt:${d.id}`]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {!goals.length && !debts.length && (
            <p className="text-sm text-muted-foreground">
              No savings goals or debts saved yet — add them under Savings and Debt and they'll show up here next month.
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => setStep("report")}>Show me the report</Button>
          <Button variant="outline" onClick={() => setStep("intro")}>Pause — I need to gather info</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="paper-card p-6">
        <Coach
          line={status.wins.length >= status.gaps.length ? "Good month. Here's what stood out." : "Mixed month — and that's normal. Here's the whole picture."}
          sub="Wins first, then gaps. Both matter; one without the other isn't a real review."
        />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border p-4">
            <p className="eyebrow">Wins</p>
            <ul className="mt-2 space-y-2 text-sm text-ink">
              {status.wins.length ? status.wins.map((w, i) => <li key={i}>• {w}</li>) : <li className="text-muted-foreground">Nothing recorded as a win yet — showing up for this review counts as one.</li>}
            </ul>
          </div>
          <div className="rounded-lg border border-border bg-secondary/40 p-4">
            <p className="eyebrow">Gaps</p>
            <ul className="mt-2 space-y-2 text-sm text-ink">
              {status.gaps.length ? status.gaps.map((g, i) => <li key={i}>• {g}</li>) : <li className="text-muted-foreground">No gaps found in what you entered.</li>}
            </ul>
          </div>
        </div>
      </div>

      {review && <StatementReport review={review} />}

      <div className="paper-card p-6">
        <h3 className="font-serif text-lg text-ink">One move for next month</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick the smallest thing that closes the biggest gap above — one line, in your own words.
        </p>
        <Textarea className="mt-3" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Cap cash-app transfers at $150 and put the rest toward the credit card." />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => finish.mutate()} disabled={finish.isPending}>Save this review</Button>
          <Button variant="outline" onClick={() => setStep("balances")}>Back to balances</Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Saving records your updated balances and files this review under Archive. It isn't financial advice.
        </p>
      </div>
    </div>
  );
}
