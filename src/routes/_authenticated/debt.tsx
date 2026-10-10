import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmt, today, type Debt } from "@/lib/money";
import { ordinalDay, parseDueDayInput, resolveDebtDueDate } from "@/lib/due-day";
import { classifyDebt } from "@/lib/decision-engine";
import { DebtFreeDate } from "@/components/debt-free-date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What this debt is missing for the paycheck plan, decided by the ENGINE's own
 *  classifier (never re-derived here), so this prompt and the Overview's PLAN
 *  INCOMPLETE banner always agree about which debts need what. */
function DebtNeedsInput({ d, onFix }: { d: Debt; onFix: () => void }) {
  const cls = classifyDebt(
    {
      id: d.id,
      creditor: d.name,
      balance: Number(d.balance),
      apr: d.apr,
      minPayment: d.minimum_payment,
      dueDate: resolveDebtDueDate(d, today()),
    },
    () => false,
  );
  if (cls !== "unknown_minimum" && cls !== "unknown_timing") return null;
  const minimum = cls === "unknown_minimum";
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-r-md border-l-4 border-gold bg-gold/15 px-3 py-2 text-sm text-ink">
      <span>
        {minimum
          ? "Minimum payment not entered, so this debt can't be placed in your paycheck plan."
          : "Due day not entered, so this payment can't be placed in your paycheck plan."}
      </span>
      <button
        type="button"
        onClick={onFix}
        className="font-medium text-ink underline underline-offset-2"
      >
        {minimum ? "Add minimum payment" : "Add due day"}
      </button>
    </p>
  );
}

export const Route = createFileRoute("/_authenticated/debt")({
  // ?edit=<debtId> opens that debt's inline editor (the Overview links here to
  // collect a missing due day). The OPTIONAL return type keeps every existing
  // <Link to="/debt"> compiling without a search prop.
  validateSearch: (search: Record<string, unknown>): { edit?: string } =>
    typeof search.edit === "string" && UUID_RE.test(search.edit) ? { edit: search.edit } : {},
  head: () => ({
    meta: [
      { title: "Debt payoff — BudgetChek" },
      {
        name: "description",
        content: "List your debts, pick a payoff order, and log payments as you go.",
      },
      { property: "og:title", content: "Debt payoff — BudgetChek" },
      {
        property: "og:description",
        content: "List your debts, pick a payoff order, and log payments as you go.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DebtPage,
});

function DebtPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [method, setMethod] = useState<"snowball" | "avalanche">("snowball");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [apr, setApr] = useState("");
  const [minPay, setMinPay] = useState("");
  const [payFor, setPayFor] = useState<string | null>(null);
  const [payAmt, setPayAmt] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [dueErr, setDueErr] = useState<string | null>(null);
  // Inline editor: minimum payment and due day ONLY. Balance moves through Log a
  // payment (which writes debt_payments), and name/APR are not editable here.
  const [editId, setEditId] = useState<string | null>(null);
  const [editMin, setEditMin] = useState("");
  const [editDue, setEditDue] = useState("");
  const [editErr, setEditErr] = useState<{ min?: string; due?: string }>({});
  const [focusField, setFocusField] = useState<"min" | "due">("min");
  const minRef = useRef<HTMLInputElement>(null);
  const dueRef = useRef<HTMLInputElement>(null);
  const editBtns = useRef(new Map<string, HTMLButtonElement>());
  const openedFor = useRef<string | null>(null);

  const { data: debts = [] } = useQuery({
    queryKey: ["debts", user.id],
    queryFn: async () => {
      // Shares ["debts", id] with useMoneyState: same ordering, and it must THROW on error --
      // a swallowed [] cached here would be read by the engine as a real, empty debt list.
      const { data, error } = await supabase
        .from("debts")
        .select("*")
        .eq("archived", false)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Debt[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["debts", user.id] });

  const openEdit = useCallback((d: Debt) => {
    setPayFor(null);
    setEditErr({});
    setEditMin(d.minimum_payment == null ? "" : String(d.minimum_payment));
    setEditDue(d.due_day == null ? "" : String(d.due_day));
    // Land on the first thing that is still unknown.
    setFocusField(d.minimum_payment == null ? "min" : d.due_day == null ? "due" : "min");
    setEditId(d.id);
  }, []);

  const closeEdit = (id: string) => {
    setEditId(null);
    setEditErr({});
    if (search.edit) navigate({ search: {}, replace: true });
    editBtns.current.get(id)?.focus();
  };

  // Deep link. Waits for the debts query to SUCCEED before judging the id, so a
  // slow or failed load never reads as "that debt doesn't exist". The ref guard
  // stops a reopen when a save's refetch lands before the param is cleared.
  useEffect(() => {
    if (!search.edit) {
      openedFor.current = null;
      return;
    }
    if (openedFor.current === search.edit) return;
    if (qc.getQueryState(["debts", user.id])?.status !== "success") return;
    openedFor.current = search.edit;
    const target = debts.find((x) => x.id === search.edit);
    if (!target) {
      toast.error("That debt isn't in your active list.");
      navigate({ search: {}, replace: true });
      return;
    }
    openEdit(target);
  }, [search.edit, debts, qc, user.id, navigate, openEdit]);

  useEffect(() => {
    if (!editId) return;
    const el = (focusField === "due" ? dueRef : minRef).current;
    el?.focus();
    el?.scrollIntoView({ block: "center" });
  }, [editId, focusField]);

  const addDebt = useMutation({
    mutationFn: async (due: number | null) => {
      const { error } = await supabase.from("debts").insert({
        user_id: user.id,
        name: name.trim(),
        balance: Number(balance),
        apr: apr ? Number(apr) : null,
        minimum_payment: minPay ? Number(minPay) : null,
        due_day: due,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Debt added.");
      setShowForm(false);
      setName("");
      setBalance("");
      setApr("");
      setMinPay("");
      setDueDay("");
      setDueErr(null);
      refresh();
    },
    onError: () => toast.error("Couldn't save."),
  });

  const logPayment = useMutation({
    mutationFn: async (debt: Debt) => {
      const amount = Number(payAmt);
      const { error: pErr } = await supabase.from("debt_payments").insert({
        debt_id: debt.id,
        user_id: user.id,
        amount,
      });
      if (pErr) throw pErr;
      const newBalance = Math.max(0, Number(debt.balance) - amount);
      const { error: uErr } = await supabase
        .from("debts")
        .update({ balance: newBalance })
        .eq("id", debt.id);
      if (uErr) throw uErr;
    },
    onSuccess: () => {
      toast.success("Payment logged. Balance updated.");
      setPayFor(null);
      setPayAmt("");
      refresh();
    },
    onError: () => toast.error("Couldn't log the payment."),
  });

  const updateDebt = useMutation({
    mutationFn: async (v: {
      id: string;
      minimum_payment: number | null;
      due_day: number | null;
    }) => {
      const { error } = await supabase
        .from("debts")
        .update({ minimum_payment: v.minimum_payment, due_day: v.due_day })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: (_data, v) => {
      toast.success("Debt updated.");
      closeEdit(v.id);
      refresh();
    },
    onError: () => toast.error("Couldn't save the changes."),
  });

  const onEditSubmit = (d: Debt) => (e: React.FormEvent) => {
    e.preventDefault();
    const err: { min?: string; due?: string } = {};
    // Blank = unknown (saved as null). A typed 0 is allowed: it means no payment
    // is required right now, which is different from not knowing.
    const min = editMin.trim() === "" ? null : Number(editMin);
    if (min != null && (!Number.isFinite(min) || min < 0))
      err.min = "Enter an amount of 0 or more, or leave it blank.";
    const due = parseDueDayInput(editDue);
    if (!due.ok) err.due = due.error;
    if (err.min || err.due || !due.ok) {
      setEditErr(err);
      (err.min ? minRef : dueRef).current?.focus();
      return;
    }
    setEditErr({});
    updateDebt.mutate({ id: d.id, minimum_payment: min, due_day: due.value });
  };

  const archiveDebt = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("debts").update({ archived: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Debt archived.");
      refresh();
    },
  });

  const ordered = [...debts].sort((a, b) =>
    method === "snowball"
      ? Number(a.balance) - Number(b.balance)
      : Number(b.apr ?? 0) - Number(a.apr ?? 0),
  );
  const total = debts.reduce((s, d) => s + Number(d.balance), 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Debt</p>
          <h1 className="mt-2 font-serif text-3xl text-ink">
            {debts.length > 0
              ? `${fmt(total)} across ${debts.length} debt${debts.length > 1 ? "s" : ""}`
              : "Your debt payoff plan"}
          </h1>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "Add a debt"}</Button>
      </div>

      {showForm && (
        <form
          className="paper-card mt-6 grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            const due = parseDueDayInput(dueDay);
            if (!due.ok) {
              setDueErr(due.error);
              document.getElementById("db-due")?.focus();
              return;
            }
            setDueErr(null);
            addDebt.mutate(due.value);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="db-name">Name</Label>
            <Input
              id="db-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Store credit card"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="db-bal">Current balance</Label>
            <Input
              id="db-bal"
              required
              type="number"
              min="0"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="850"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="db-apr">APR % (optional)</Label>
            <Input
              id="db-apr"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={apr}
              onChange={(e) => setApr(e.target.value)}
              placeholder="24.99"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="db-min">Minimum payment (optional)</Label>
            <Input
              id="db-min"
              type="number"
              min="0"
              step="0.01"
              value={minPay}
              onChange={(e) => setMinPay(e.target.value)}
              placeholder="35"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="db-due">Due day of month (optional)</Label>
            <Input
              id="db-due"
              type="number"
              inputMode="numeric"
              min="1"
              max="31"
              step="1"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              placeholder="15"
              aria-invalid={!!dueErr}
              aria-describedby="db-due-hint"
            />
            <p id="db-due-hint" aria-live="polite" className="text-xs text-muted-foreground">
              {dueErr ??
                "Day of the month, 1 to 31. Lets BudgetChek place this payment in your paycheck plan."}
            </p>
          </div>
          <div className="sm:col-span-2 lg:col-span-5">
            <Button type="submit" disabled={addDebt.isPending}>
              Save debt
            </Button>
          </div>
        </form>
      )}

      {debts.length > 1 && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary/40 p-4">
          <span className="text-sm font-medium text-ink">Payoff order:</span>
          <div className="flex gap-2" role="radiogroup" aria-label="Payoff method">
            <button
              type="button"
              role="radio"
              aria-checked={method === "snowball"}
              onClick={() => setMethod("snowball")}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors ${method === "snowball" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-ink"}`}
            >
              Snowball (smallest first)
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={method === "avalanche"}
              onClick={() => setMethod("avalanche")}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors ${method === "avalanche" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-ink"}`}
            >
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

      {debts.length > 0 && (
        <div className="mt-6">
          <DebtFreeDate debts={debts} method={method} />
        </div>
      )}

      <ol className="mt-6 space-y-4">
        {ordered.map((d, i) => (
          <li key={d.id} className="paper-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Payoff #{i + 1}
                </p>
                <h2 className="mt-1 font-serif text-xl text-ink">{d.name}</h2>
              </div>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-ink hover:underline"
                onClick={() => archiveDebt.mutate(d.id)}
              >
                Archive
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm">
              <span className="font-serif text-2xl text-ink">{fmt(d.balance)}</span>
              {d.apr != null && (
                <span className="self-end text-muted-foreground">{d.apr}% APR</span>
              )}
              {d.minimum_payment != null && (
                <span className="self-end text-muted-foreground">
                  min {fmt(d.minimum_payment)}/mo
                </span>
              )}
              {d.due_day != null && (
                <span className="self-end text-muted-foreground">
                  due the {ordinalDay(d.due_day)}
                  {d.due_day >= 29 ? " (last day in shorter months)" : ""}
                </span>
              )}
            </div>
            {editId !== d.id && <DebtNeedsInput d={d} onFix={() => openEdit(d)} />}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                type="button"
                ref={(el) => {
                  if (el) editBtns.current.set(d.id, el);
                  else editBtns.current.delete(d.id);
                }}
                aria-expanded={editId === d.id}
                aria-controls={`edit-${d.id}`}
                onClick={() => (editId === d.id ? closeEdit(d.id) : openEdit(d))}
              >
                Edit minimum and due day
              </Button>
              {payFor !== d.id && (
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => {
                    setEditId(null);
                    setPayFor(d.id);
                  }}
                >
                  Log a payment
                </Button>
              )}
            </div>
            {editId === d.id && (
              <form
                id={`edit-${d.id}`}
                noValidate
                aria-label={`Edit ${d.name}`}
                onSubmit={onEditSubmit(d)}
                className="mt-4 grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2"
              >
                <div className="space-y-1.5">
                  <Label htmlFor={`min-${d.id}`}>Minimum payment per month</Label>
                  <Input
                    ref={minRef}
                    id={`min-${d.id}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={editMin}
                    onChange={(e) => setEditMin(e.target.value)}
                    aria-invalid={!!editErr.min}
                    aria-describedby={`min-h-${d.id}`}
                  />
                  <p
                    id={`min-h-${d.id}`}
                    aria-live="polite"
                    className="text-xs text-muted-foreground"
                  >
                    {editErr.min ??
                      "Leave blank if you don't know it yet. Enter 0 if no payment is required right now."}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`due-${d.id}`}>Due day of the month</Label>
                  <Input
                    ref={dueRef}
                    id={`due-${d.id}`}
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="31"
                    step="1"
                    value={editDue}
                    onChange={(e) => setEditDue(e.target.value)}
                    aria-invalid={!!editErr.due}
                    aria-describedby={`due-h-${d.id}`}
                  />
                  <p
                    id={`due-h-${d.id}`}
                    aria-live="polite"
                    className="text-xs text-muted-foreground"
                  >
                    {editErr.due ?? "1 to 31. On 29 to 31, shorter months use their last day."}
                  </p>
                </div>
                <div className="flex gap-2 sm:col-span-2">
                  <Button size="sm" type="submit" disabled={updateDebt.isPending}>
                    Save
                  </Button>
                  <Button size="sm" type="button" variant="outline" onClick={() => closeEdit(d.id)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
            {payFor === d.id && (
              <form
                className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-border p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  logPayment.mutate(d);
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor={`pay-${d.id}`}>Payment amount</Label>
                  <Input
                    id={`pay-${d.id}`}
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={payAmt}
                    onChange={(e) => setPayAmt(e.target.value)}
                  />
                </div>
                <Button size="sm" type="submit" disabled={logPayment.isPending}>
                  Log payment
                </Button>
                <Button size="sm" type="button" variant="outline" onClick={() => setPayFor(null)}>
                  Cancel
                </Button>
              </form>
            )}
          </li>
        ))}
      </ol>

      {debts.length === 0 && !showForm && (
        <p className="mt-6 text-sm text-muted-foreground">
          No debts listed. If you're debt-free, that's worth celebrating — head to Savings.
          Otherwise, add your first debt above to build a payoff order.
        </p>
      )}
    </div>
  );
}
