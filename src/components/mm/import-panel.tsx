import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/money";
import {
  buildTxns,
  findRecurring,
  guessColumns,
  readAnyFile,
  readTable,
  reconcile,
  type ColumnMap,
  type IngestTxn,
  type RawTable,
} from "@/lib/ingest";
import { applyAnswers, buildQuestions, type Answer, type Question } from "@/lib/disambiguation";
import { CLASS_META, type PatternClass } from "@/lib/pattern-rules";
import { detectLeakMoves } from "@/lib/decision-engine";
import { monthlyCategoryTotals, type MmImport, type MmPatternRuleRow } from "@/lib/mm";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";

interface Props {
  userId: string;
  rules: MmPatternRuleRow[];
  userRules: Parameters<typeof buildTxns>[2];
  imports: MmImport[];
  knownBills: { name: string; amount: number }[];
  onImported: () => void;
}

const FIELDS: { key: keyof ColumnMap; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "description", label: "Description" },
  { key: "amount", label: "Amount (one signed column)" },
  { key: "debit", label: "Money out column" },
  { key: "credit", label: "Money in column" },
  { key: "type", label: "Debit/credit label column" },
];

export function ImportPanel({ userId, userRules, imports, knownBills, onImported }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<RawTable | null>(null);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [txns, setTxns] = useState<IngestTxn[] | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [busy, setBusy] = useState(false);

  const previous = imports[0]?.txns ?? [];

  function recompute(t: RawTable, m: ColumnMap) {
    const result = buildTxns(t, m, userRules);
    setTxns(result.txns);
    setQuestions(buildQuestions(result.txns, previous));
    setAnswers([]);
    if (!result.txns.length) {
      toast.error("No rows could be read with those columns. Try pointing the fields at different columns.");
    }
    return result;
  }

  async function onFile(file: File) {
    setBusy(true);
    try {
      const text = await readAnyFile(file);
      const t = readTable(text);
      if (!t.rows.length) throw new Error("empty");
      const m = guessColumns(t);
      setFileName(file.name);
      setTable(t);
      setMap(m);
      const r = recompute(t, m);
      toast.success(`Read ${r.txns.length} rows${r.skipped ? `, skipped ${r.skipped} that had no usable date or amount` : ""}.`);
    } catch {
      toast.error("That file couldn't be read. CSV, TSV, XLS and XLSX all work.");
    } finally {
      setBusy(false);
    }
  }

  const corrected = useMemo(
    () => (txns ? applyAnswers(txns, questions, answers) : null),
    [txns, questions, answers],
  );
  const finalTxns = corrected?.txns ?? txns ?? [];

  const totals = useMemo(() => {
    const income = finalTxns.filter((t) => t.amount > 0 && t.klass === "true_income").reduce((s, t) => s + t.amount, 0);
    const out = finalTxns.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const byClass = new Map<PatternClass, number>();
    for (const t of finalTxns) if (t.amount < 0) byClass.set(t.klass, (byClass.get(t.klass) ?? 0) + Math.abs(t.amount));
    return {
      income,
      out,
      byClass: [...byClass.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [finalTxns]);

  const flags = useMemo(() => {
    const out: string[] = [];
    for (const t of finalTxns) {
      const meta = CLASS_META[t.klass];
      if (meta?.signal) out.push(`${t.date} · ${t.description} — ${meta.why}`);
    }
    return out.slice(0, 12);
  }, [finalTxns]);


  const recurring = useMemo(() => findRecurring(finalTxns), [finalTxns]);
  const recon = useMemo(
    () => (finalTxns.length ? reconcile({ incoming: finalTxns, previous, knownBills }) : []),
    [finalTxns, previous, knownBills],
  );
  const leakMoves = useMemo(() => detectLeakMoves(monthlyCategoryTotals(finalTxns)), [finalTxns]);

  const save = useMutation({
    mutationFn: async () => {
      if (!finalTxns.length) throw new Error("nothing");
      const dates = finalTxns.map((t) => t.date).sort();
      const { error } = await supabase.from("mm_imports").insert({
        user_id: userId,
        file_name: fileName || null,
        period_start: dates[0] ?? null,
        period_end: dates[dates.length - 1] ?? null,
        txn_count: finalTxns.length,
        txns: JSON.parse(JSON.stringify(finalTxns)),
      });
      if (error) throw error;

      const newRules = corrected?.newRules ?? [];
      if (newRules.length) {
        await supabase.from("mm_pattern_rules").insert(
          newRules.map((r) => ({ user_id: userId, pattern: r.pattern, classify_as: r.classify_as, note: r.note })),
        );
      }
    },
    onSuccess: () => {
      toast.success("Saved. This file is now what your next upload gets compared against.");
      qc.invalidateQueries({ queryKey: ["mm_imports", userId] });
      qc.invalidateQueries({ queryKey: ["mm_rules", userId] });
      setTable(null);
      setMap(null);
      setTxns(null);
      setQuestions([]);
      setAnswers([]);
      onImported();
    },
    onError: () => toast.error("Couldn't save that file."),
  });

  /** Carried over from the old separate import page: turn a repeating charge into a tracked bill. */
  const addBill = useMutation({
    mutationFn: async (item: { label: string; typicalAmount: number }) => {
      const dates = finalTxns
        .filter((t) => t.description === item.label)
        .map((t) => t.date)
        .sort();
      const { error } = await supabase.from("planned_expenses").insert({
        user_id: userId,
        name: item.label.slice(0, 120),
        amount: item.typicalAmount,
        due_date: dates[dates.length - 1] ?? new Date().toISOString().slice(0, 10),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Added to Bills & expenses.");
      qc.invalidateQueries({ queryKey: ["expenses", userId] });
    },
    onError: () => toast.error("Couldn't add that one."),
  });

  const answerFor = (id: string) => answers.find((a) => a.questionId === id);
  const setAnswer = (a: Answer) => setAnswers((prev) => [...prev.filter((x) => x.questionId !== a.questionId), a]);

  return (
    <div className="mt-6 space-y-5">
      <section className="paper-card p-6">
        <h3 className="font-serif text-lg text-ink">Bring in a statement</h3>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Export a statement from your bank as CSV, XLS or XLSX and drop it here. It's read on your own device, nothing
          is uploaded to a bank, and every charge is sorted by what the description actually says.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,.xls,.xlsx"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
        />
        <Button className="mt-4" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <Upload className="mr-1.5 h-4 w-4" aria-hidden />}
          Choose a file
        </Button>
        {fileName && <p className="mt-2 text-xs text-muted-foreground">{fileName}</p>}
      </section>

      {table && map && (
        <section className="paper-card p-6">
          <h3 className="font-serif text-lg text-ink">Which column is which?</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            These were worked out from the headings. Change any that look wrong — the totals update straight away.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`col-${f.key}`}>{f.label}</Label>
                <select
                  id={`col-${f.key}`}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={map[f.key]}
                  onChange={(e) => {
                    const next = { ...map, [f.key]: Number(e.target.value) };
                    setMap(next);
                    recompute(table, next);
                  }}
                >
                  <option value={-1}>Not in this file</option>
                  {table.headers.map((h, i) => (
                    <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>
      )}

      {questions.length > 0 && (
        <section className="paper-card p-6">
          <h3 className="font-serif text-lg text-ink">
            {questions.length === 1 ? "One thing worth checking" : `${questions.length} things worth checking`}
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Only charges that don't fit your own pattern are queried, and never more than three at a time.
          </p>
          <ul className="mt-4 space-y-4">
            {questions.map((q) => {
              const a = answerFor(q.id);
              return (
                <li key={q.id} className="rounded-lg border border-border p-4">
                  <p className="text-sm text-ink">{q.prompt}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{q.because}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={a?.choice.type === "confirm" ? "default" : "outline"}
                      onClick={() => setAnswer({ questionId: q.id, choice: { type: "confirm" } })}
                    >
                      That's right
                    </Button>
                    {q.suggestedClasses.map((k) => (
                      <Button
                        key={k}
                        size="sm"
                        variant={a?.choice.type === "reclassify" && a.choice.klass === k ? "default" : "outline"}
                        onClick={() => setAnswer({ questionId: q.id, choice: { type: "reclassify", klass: k, remember: true } })}
                      >
                        It was {CLASS_META[k].label.toLowerCase()}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      variant={a?.choice.type === "skip" ? "default" : "ghost"}
                      onClick={() => setAnswer({ questionId: q.id, choice: { type: "skip" } })}
                    >
                      Not sure
                    </Button>
                  </div>
                  {a?.choice.type === "reclassify" && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Saved as a rule, so uploads from now on read it the same way.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {finalTxns.length > 0 && (
        <>
          <section className="paper-card p-6">
            <h3 className="font-serif text-lg text-ink">What this file says</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="eyebrow">Money in</p>
                <p className="mt-1 font-serif text-2xl text-ink">{fmt(totals.income)}</p>
                <p className="text-xs text-muted-foreground">Pay and other real income only — transfers between your own accounts are left out.</p>
              </div>
              <div>
                <p className="eyebrow">Money out</p>
                <p className="mt-1 font-serif text-2xl text-ink">{fmt(totals.out)}</p>
              </div>
              <div>
                <p className="eyebrow">Rows read</p>
                <p className="mt-1 font-serif text-2xl text-ink">{finalTxns.length}</p>
              </div>
            </div>
            <ul className="mt-5 space-y-1.5">
              {totals.byClass.slice(0, 10).map(([k, v]) => (
                <li key={k} className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5 text-sm">
                  <span className="text-ink">{CLASS_META[k]?.label ?? k}</span>
                  <span className="font-medium text-ink">{fmt(v)}</span>
                </li>
              ))}
            </ul>
          </section>

          {flags.length > 0 && (
            <section className="paper-card p-6">
              <h3 className="font-serif text-lg text-ink">Charges worth your attention</h3>
              <ul className="mt-3 space-y-1.5 text-sm text-ink">
                {flags.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </section>
          )}

          {recon.length > 0 && (
            <section className="paper-card p-6">
              <h3 className="font-serif text-lg text-ink">Compared with what you already told us</h3>
              <ul className="mt-3 space-y-1.5 text-sm text-ink">
                {recon.slice(0, 12).map((r) => <li key={r.status + r.key}>{r.sentence}</li>)}
              </ul>
            </section>
          )}

          {leakMoves.length > 0 && (
            <section className="paper-card p-6">
              <h3 className="font-serif text-lg text-ink">Spending that moved rather than stopped</h3>
              <ul className="mt-3 space-y-1.5 text-sm text-ink">
                {leakMoves.map((m, i) => <li key={i}>{m.sentence}</li>)}
              </ul>
            </section>
          )}

          {recurring.length > 0 && (
            <section className="paper-card p-6">
              <h3 className="font-serif text-lg text-ink">Charges that come back every month</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Add any of these to Bills &amp; expenses so they show up in what's owed before your next payday.
              </p>
              <ul className="mt-3 space-y-1.5">
                {recurring.slice(0, 12).map((r) => (
                  <li key={r.key} className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border/60 pb-1.5 text-sm">
                    <span className="text-ink">{r.label}</span>
                    <span className="flex items-baseline gap-3">
                      <span className="text-muted-foreground">
                        about {fmt(r.typicalAmount)} · seen in {r.monthsSeen} months
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={addBill.isPending}
                        onClick={() => addBill.mutate({ label: r.label, typicalAmount: r.typicalAmount })}
                      >
                        Add as a bill
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Save this file</Button>
            <Button variant="ghost" onClick={() => { setTable(null); setMap(null); setTxns(null); setQuestions([]); setAnswers([]); }}>
              Discard
            </Button>
          </div>
        </>
      )}

      {imports.length > 0 && !table && (
        <section className="paper-card p-6">
          <h3 className="font-serif text-lg text-ink">Files you've brought in</h3>
          <ul className="mt-3 space-y-1.5">
            {imports.map((i) => (
              <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border/60 pb-1.5 text-sm">
                <span className="text-ink">{i.file_name ?? "Statement"}</span>
                <span className="text-muted-foreground">
                  {i.txn_count} rows{i.period_start ? ` · ${i.period_start} to ${i.period_end}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
