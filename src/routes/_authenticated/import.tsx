import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/money";
import { parseStatement, reviewStatement, type Txn } from "@/lib/statement-review";
import { StatementReport } from "@/components/statement-report";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({
    meta: [
      { title: "Import spending — BudgetChek" },
      { name: "description", content: "Upload a bank CSV and get a plain-language review of where your money went." },
      { property: "og:title", content: "Import spending — BudgetChek" },
      { property: "og:description", content: "Upload a bank CSV and get a plain-language review of where your money went." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImportPage,
});

function ImportPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [txns, setTxns] = useState<Txn[]>([]);
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [showRows, setShowRows] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const review = useMemo(() => (txns.length ? reviewStatement(txns) : null), [txns]);
  const spendRows = useMemo(
    () => txns.map((t, i) => ({ ...t, i })).filter((t) => t.amount < 0),
    [txns]
  );
  const selectedCount = spendRows.filter((r) => picked[r.i]).length;

  function load(parsed: Txn[]) {
    setTxns(parsed);
    setPicked({});
    setShowRows(false);
  }

  const saveSelected = useMutation({
    mutationFn: async () => {
      const selected = spendRows.filter((r) => picked[r.i]);
      if (!selected.length) throw new Error("Nothing selected");
      const { error } = await supabase.from("planned_expenses").insert(
        selected.map((r) => ({
          user_id: user.id,
          name: r.description.slice(0, 120),
          amount: Math.abs(r.amount),
          due_date: r.date,
          category: r.category,
        }))
      );
      if (error) throw error;
      return selected.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} added to Bills & expenses.`);
      setPicked({});
      qc.invalidateQueries({ queryKey: ["expenses", user.id] });
    },
    onError: (e) =>
      toast.error(e.message === "Nothing selected" ? "Pick at least one row." : "Couldn't save those rows."),
  });

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseStatement(String(reader.result ?? ""));
      if (!parsed.length) {
        toast.error("Couldn't read that file. It needs a date, a description, and an amount.");
        return;
      }
      load(parsed);
    };
    reader.readAsText(file);
  }

  return (
    <div>
      <p className="eyebrow">Import spending</p>
      <h1 className="mt-2 font-serif text-3xl text-ink">Turn a bank statement into a review</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Download a CSV from your bank (usually under "Statements" or "Export"), then upload or paste it here. It's read
        in your browser only — nothing is saved unless you choose to save rows.
      </p>

      <div className="paper-card mt-6 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>Upload CSV file</Button>
          <span className="text-xs text-muted-foreground">
            Works with a date, a description, and either one amount column or separate debit and credit columns.
          </span>
        </div>
        <div className="mt-4 space-y-1.5">
          <Label htmlFor="csv-paste">…or paste rows</Label>
          <Textarea
            id="csv-paste"
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"2026-09-01, Grocery store, -84.12\n2026-09-02, Paycheck, 1450.00"}
          />
        </div>
        <Button
          className="mt-3"
          variant="secondary"
          onClick={() => {
            const parsed = parseStatement(text);
            if (!parsed.length) toast.error("No readable rows found. Each row needs a date, a description, and an amount.");
            else load(parsed);
          }}
        >
          Review it
        </Button>
      </div>

      {review && (
        <div className="mt-8 space-y-6">
          <StatementReport review={review} />

          <section className="paper-card p-6">
            <h3 className="font-serif text-lg text-ink">Recommended next steps</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>• Add the charges that repeat every month under <Link to="/future-expenses" className="text-ink underline">Bills &amp; expenses</Link> so nothing surprises you.</li>
              <li>• Give any unclear transfer a real name — that's usually the biggest hidden number.</li>
              <li>• Put one line from "money left over" toward your <Link to="/savings" className="text-ink underline">savings goal</Link> or <Link to="/debt" className="text-ink underline">smallest debt</Link>.</li>
              <li>• Bring this review to your next <Link to="/money-meeting" className="text-ink underline">money meeting</Link>.</li>
            </ul>
          </section>

          <section className="paper-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-serif text-lg text-ink">Save rows as bills</h3>
                <p className="text-xs text-muted-foreground">
                  {spendRows.length} charges found{selectedCount ? ` · ${selectedCount} picked` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowRows((v) => !v)}>
                  {showRows ? "Hide rows" : "Show rows"}
                </Button>
                <Button size="sm" onClick={() => saveSelected.mutate()} disabled={saveSelected.isPending || !selectedCount}>
                  Save picked rows
                </Button>
              </div>
            </div>
            {showRows && (
              <ul className="mt-4 max-h-96 space-y-1 overflow-y-auto">
                {spendRows.map((r) => (
                  <li key={r.i} className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!picked[r.i]}
                      onChange={() => setPicked((p) => ({ ...p, [r.i]: !p[r.i] }))}
                      className="h-4 w-4 accent-primary"
                      aria-label={`Include ${r.description}`}
                    />
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">{r.date}</span>
                    <span className="flex-1 truncate text-ink">{r.description}</span>
                    <span className="w-20 text-right font-medium text-ink">{fmt(Math.abs(r.amount))}</span>
                    <span className="w-20 text-right text-xs capitalize text-muted-foreground">{r.category}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
