import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { categorize, fmt } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({
    meta: [
      { title: "Import & analyze — BudgetChek" },
      { name: "description", content: "Paste or upload a bank CSV and see where your money went, right in your browser." },
      { property: "og:title", content: "Import & analyze — BudgetChek" },
      { property: "og:description", content: "Paste or upload a bank CSV and see where your money went, right in your browser." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImportPage,
});

interface ParsedRow {
  date: string;
  description: string;
  amount: number;
  category: string;
  selected: boolean;
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const rows: ParsedRow[] = [];
  const startIdx = /date/i.test(lines[0]) ? 1 : 0;
  for (const line of lines.slice(startIdx)) {
    const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length < 3) continue;
    const [date, description, rawAmount] = parts;
    const amount = Number(rawAmount.replace(/[$,]/g, ""));
    if (!/^\d{4}-\d{2}-\d{2}/.test(date) || Number.isNaN(amount)) continue;
    rows.push({
      date: date.slice(0, 10),
      description,
      amount: Math.abs(amount),
      category: categorize(description),
      selected: true,
    });
  }
  return rows;
}

function ImportPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const summary = useMemo(() => {
    const byCat = new Map<string, number>();
    let total = 0;
    for (const r of rows) {
      byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.amount);
      total += r.amount;
    }
    return { byCat: [...byCat.entries()].sort((a, b) => b[1] - a[1]), total };
  }, [rows]);

  const saveSelected = useMutation({
    mutationFn: async () => {
      const selected = rows.filter((r) => r.selected);
      if (!selected.length) throw new Error("Nothing selected");
      const { error } = await supabase.from("planned_expenses").insert(
        selected.map((r) => ({
          user_id: user.id,
          name: r.description.slice(0, 120),
          amount: r.amount,
          due_date: r.date,
          category: r.category,
        }))
      );
      if (error) throw error;
      return selected.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} expenses saved to Future Expenses.`);
      setRows([]); setText("");
      qc.invalidateQueries({ queryKey: ["expenses", user.id] });
    },
    onError: (e) => toast.error(e.message === "Nothing selected" ? "Select at least one row." : "Couldn't save."),
  });

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result ?? ""));
      if (!parsed.length) {
        toast.error("Couldn't read that file. Expected columns: date, description, amount.");
        return;
      }
      setRows(parsed);
    };
    reader.readAsText(file);
  }

  return (
    <div>
      <p className="eyebrow">Import & Analyze</p>
      <h1 className="mt-2 font-serif text-3xl text-ink">Turn a bank statement into insight</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Download a CSV from your bank (usually under "Statements" or "Export"), then upload or paste it here.
        It is read in your browser only — nothing is uploaded until you choose to save rows.
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
          <span className="text-xs text-muted-foreground">Expected columns: date (YYYY-MM-DD), description, amount</span>
        </div>
        <div className="mt-4 space-y-1.5">
          <Label htmlFor="csv-paste">…or paste rows</Label>
          <Textarea
            id="csv-paste"
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"2026-09-01, Grocery store, 84.12\n2026-09-02, Gas station, 40.00"}
          />
        </div>
        <Button className="mt-3" variant="secondary" onClick={() => {
          const parsed = parseCsv(text);
          if (!parsed.length) toast.error("No valid rows. Expected: date, description, amount.");
          else setRows(parsed);
        }}>
          Analyze
        </Button>
      </div>

      {rows.length > 0 && (
        <div className="mt-6 space-y-6">
          <section className="paper-card p-6">
            <h2 className="font-serif text-lg text-ink">Where it went — {fmt(summary.total)} total</h2>
            <ul className="mt-3 space-y-1.5">
              {summary.byCat.map(([c, v]) => (
                <li key={c} className="flex items-center justify-between text-sm">
                  <span className="capitalize text-muted-foreground">{c}</span>
                  <span className="font-medium text-ink">{fmt(v)} · {Math.round((v / summary.total) * 100)}%</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="paper-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg text-ink">Rows ({rows.filter((r) => r.selected).length} selected)</h2>
              <Button size="sm" onClick={() => saveSelected.mutate()} disabled={saveSelected.isPending}>
                Save selected as expenses
              </Button>
            </div>
            <ul className="mt-3 max-h-96 space-y-1 overflow-y-auto">
              {rows.map((r, i) => (
                <li key={i} className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={r.selected}
                    onChange={() => setRows((prev) => prev.map((p, j) => (j === i ? { ...p, selected: !p.selected } : p)))}
                    className="h-4 w-4 accent-primary"
                    aria-label={`Include ${r.description}`}
                  />
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{r.date}</span>
                  <span className="flex-1 truncate text-ink">{r.description}</span>
                  <span className="w-20 text-right font-medium text-ink">{fmt(r.amount)}</span>
                  <select
                    value={r.category}
                    onChange={(e) => setRows((prev) => prev.map((p, j) => (j === i ? { ...p, category: e.target.value } : p)))}
                    className="h-7 rounded border border-input bg-background px-1 text-xs"
                    aria-label="Category"
                  >
                    {["housing","utilities","food","transport","debt","health","personal","fun","other"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
