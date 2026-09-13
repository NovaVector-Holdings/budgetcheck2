import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EXPENSE_CATEGORIES, fmt, today, type PlannedExpense } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/future-expenses")({
  head: () => ({
    meta: [
      { title: "Bills & expenses — BudgetChek" },
      { name: "description", content: "Plan upcoming bills and one-time costs before they surprise you." },
      { property: "og:title", content: "Bills & expenses — BudgetChek" },
      { property: "og:description", content: "Plan upcoming bills and one-time costs before they surprise you." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FutureExpensesPage,
});

function FutureExpensesPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [recurring, setRecurring] = useState<string>("none");

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("planned_expenses")
        .select("*")
        .eq("archived", false)
        .order("due_date");
      return (data ?? []) as PlannedExpense[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["expenses", user.id] });

  const addExpense = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("planned_expenses").insert({
        user_id: user.id,
        name: name.trim(),
        amount: Number(amount),
        due_date: dueDate,
        category,
        recurring,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expense planned.");
      setShowForm(false); setName(""); setAmount(""); setDueDate(""); setCategory("other"); setRecurring("none");
      refresh();
    },
    onError: () => toast.error("Couldn't save."),
  });

  const togglePaid = useMutation({
    mutationFn: async (e: PlannedExpense) => {
      const { error } = await supabase.from("planned_expenses").update({ paid: !e.paid }).eq("id", e.id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("planned_expenses").update({ archived: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Archived."); refresh(); },
  });

  const t = today();
  const upcoming = expenses.filter((e) => !e.paid && e.due_date >= t);
  const overdue = expenses.filter((e) => !e.paid && e.due_date < t);
  const paid = expenses.filter((e) => e.paid);

  const Row = ({ e, muted }: { e: PlannedExpense; muted?: boolean }) => (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div>
        <p className={`text-sm font-medium ${muted ? "text-muted-foreground line-through" : "text-ink"}`}>{e.name}</p>
        <p className="text-xs text-muted-foreground">
          {e.due_date} · {e.category}{e.recurring !== "none" ? ` · repeats ${e.recurring}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-ink">{fmt(e.amount)}</span>
        <Button size="sm" variant="outline" onClick={() => togglePaid.mutate(e)}>
          {e.paid ? "Undo" : "Mark paid"}
        </Button>
        <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => archive.mutate(e.id)}>
          Archive
        </button>
      </div>
    </li>
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Bills & expenses</p>
          <h1 className="mt-2 font-serif text-3xl text-ink">Plan before it's due</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Bills, birthdays, car registration — put them here so they never ambush your month.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "Plan an expense"}</Button>
      </div>

      {showForm && (
        <form className="paper-card mt-6 grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => { e.preventDefault(); addExpense.mutate(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="ex-name">Name</Label>
            <Input id="ex-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Car insurance" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-amount">Amount</Label>
            <Input id="ex-amount" required type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="120" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-date">Due date</Label>
            <Input id="ex-date" required type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-cat">Category</Label>
            <select id="ex-cat" className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-rec">Repeats</Label>
            <select id="ex-rec" className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={recurring} onChange={(e) => setRecurring(e.target.value)}>
              <option value="none">One time</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={addExpense.isPending}>Save expense</Button>
          </div>
        </form>
      )}

      <div className="mt-6 space-y-6">
        {overdue.length > 0 && (
          <section className="paper-card border-destructive/40 p-6">
            <h2 className="font-serif text-lg text-destructive">Overdue</h2>
            <ul className="divide-y divide-border">{overdue.map((e) => <Row key={e.id} e={e} />)}</ul>
          </section>
        )}
        <section className="paper-card p-6">
          <h2 className="font-serif text-lg text-ink">Upcoming</h2>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nothing planned. Add your next known bill above.</p>
          ) : (
            <ul className="divide-y divide-border">{upcoming.map((e) => <Row key={e.id} e={e} />)}</ul>
          )}
        </section>
        {paid.length > 0 && (
          <section className="paper-card p-6">
            <h2 className="font-serif text-lg text-muted-foreground">Paid</h2>
            <ul className="divide-y divide-border">{paid.map((e) => <Row key={e.id} e={e} muted />)}</ul>
          </section>
        )}
      </div>
    </div>
  );
}
