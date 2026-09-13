import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmt, type Debt } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/debt")({
  head: () => ({
    meta: [
      { title: "Debt payoff — BudgetChek" },
      { name: "description", content: "List your debts, pick a payoff order, and log payments as you go." },
      { property: "og:title", content: "Debt payoff — BudgetChek" },
      { property: "og:description", content: "List your debts, pick a payoff order, and log payments as you go." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DebtPage,
});

function DebtPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [method, setMethod] = useState<"snowball" | "avalanche">("snowball");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [apr, setApr] = useState("");
  const [minPay, setMinPay] = useState("");
  const [payFor, setPayFor] = useState<string | null>(null);
  const [payAmt, setPayAmt] = useState("");

  const { data: debts = [] } = useQuery({
    queryKey: ["debts", user.id],
    queryFn: async () => {
      const { data } = await supabase.from("debts").select("*").eq("archived", false);
      return (data ?? []) as Debt[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["debts", user.id] });

  const addDebt = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("debts").insert({
        user_id: user.id,
        name: name.trim(),
        balance: Number(balance),
        apr: apr ? Number(apr) : null,
        minimum_payment: minPay ? Number(minPay) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Debt added.");
      setShowForm(false); setName(""); setBalance(""); setApr(""); setMinPay("");
      refresh();
    },
    onError: () => toast.error("Couldn't save."),
  });

  const logPayment = useMutation({
    mutationFn: async (debt: Debt) => {
      const amount = Number(payAmt);
      const { error: pErr } = await supabase.from("debt_payments").insert({
        debt_id: debt.id, user_id: user.id, amount,
      });
      if (pErr) throw pErr;
      const newBalance = Math.max(0, Number(debt.balance) - amount);
      const { error: uErr } = await supabase.from("debts").update({ balance: newBalance }).eq("id", debt.id);
      if (uErr) throw uErr;
    },
    onSuccess: () => {
      toast.success("Payment logged. Balance updated.");
      setPayFor(null); setPayAmt("");
      refresh();
    },
    onError: () => toast.error("Couldn't log the payment."),
  });

  const archiveDebt = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("debts").update({ archived: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Debt archived."); refresh(); },
  });

  const ordered = [...debts].sort((a, b) =>
    method === "snowball"
      ? Number(a.balance) - Number(b.balance)
      : Number(b.apr ?? 0) - Number(a.apr ?? 0)
  );
  const total = debts.reduce((s, d) => s + Number(d.balance), 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Debt</p>
          <h1 className="mt-2 font-serif text-3xl text-ink">
            {debts.length > 0 ? `${fmt(total)} across ${debts.length} debt${debts.length > 1 ? "s" : ""}` : "Your debt payoff plan"}
          </h1>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "Add a debt"}</Button>
      </div>

      {showForm && (
        <form className="paper-card mt-6 grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); addDebt.mutate(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="db-name">Name</Label>
            <Input id="db-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Store credit card" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="db-bal">Current balance</Label>
            <Input id="db-bal" required type="number" min="0" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="850" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="db-apr">APR % (optional)</Label>
            <Input id="db-apr" type="number" min="0" max="100" step="0.01" value={apr} onChange={(e) => setApr(e.target.value)} placeholder="24.99" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="db-min">Minimum payment (optional)</Label>
            <Input id="db-min" type="number" min="0" step="0.01" value={minPay} onChange={(e) => setMinPay(e.target.value)} placeholder="35" />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="submit" disabled={addDebt.isPending}>Save debt</Button>
          </div>
        </form>
      )}

      {debts.length > 1 && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary/40 p-4">
          <span className="text-sm font-medium text-ink">Payoff order:</span>
          <div className="flex gap-2" role="radiogroup" aria-label="Payoff method">
            <button type="button" role="radio" aria-checked={method === "snowball"} onClick={() => setMethod("snowball")}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors ${method === "snowball" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-ink"}`}>
              Snowball (smallest first)
            </button>
            <button type="button" role="radio" aria-checked={method === "avalanche"} onClick={() => setMethod("avalanche")}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors ${method === "avalanche" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-ink"}`}>
              Avalanche (highest APR first)
            </button>
          </div>
          <p className="w-full text-xs text-muted-foreground">
            {method === "snowball"
              ? "Knock out the smallest balance first for quick wins that keep you going."
              : "Hit the highest interest rate first to pay the least overall."}
          </p>
        </div>
      )}

      <ol className="mt-6 space-y-4">
        {ordered.map((d, i) => (
          <li key={d.id} className="paper-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payoff #{i + 1}</p>
                <h2 className="mt-1 font-serif text-xl text-ink">{d.name}</h2>
              </div>
              <button type="button" className="text-xs text-muted-foreground hover:text-ink hover:underline" onClick={() => archiveDebt.mutate(d.id)}>
                Archive
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm">
              <span className="font-serif text-2xl text-ink">{fmt(d.balance)}</span>
              {d.apr != null && <span className="self-end text-muted-foreground">{d.apr}% APR</span>}
              {d.minimum_payment != null && <span className="self-end text-muted-foreground">min {fmt(d.minimum_payment)}/mo</span>}
            </div>
            {payFor === d.id ? (
              <form className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-border p-4" onSubmit={(e) => { e.preventDefault(); logPayment.mutate(d); }}>
                <div className="space-y-1.5">
                  <Label htmlFor={`pay-${d.id}`}>Payment amount</Label>
                  <Input id={`pay-${d.id}`} required type="number" min="0.01" step="0.01" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} />
                </div>
                <Button size="sm" type="submit" disabled={logPayment.isPending}>Log payment</Button>
                <Button size="sm" type="button" variant="outline" onClick={() => setPayFor(null)}>Cancel</Button>
              </form>
            ) : (
              <Button size="sm" variant="outline" className="mt-4" onClick={() => setPayFor(d.id)}>
                Log a payment
              </Button>
            )}
          </li>
        ))}
      </ol>

      {debts.length === 0 && !showForm && (
        <p className="mt-6 text-sm text-muted-foreground">
          No debts listed. If you're debt-free, that's worth celebrating — head to Savings. Otherwise, add your first debt above to build a payoff order.
        </p>
      )}
    </div>
  );
}
