import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { readBalanceScreenshot } from "@/lib/mm-vision.functions";
import { fmt, today } from "@/lib/money";
import { ACCOUNT_KINDS, type MmAccount, type MmPatternRuleRow, type MmReservedFund, type MmSpendingCap } from "@/lib/mm";
import { checkCap, tapReserved, FUNDING_TIERS } from "@/lib/decision-engine";
import { CLASS_META, type PatternClass } from "@/lib/pattern-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";

interface Props {
  userId: string;
  accounts: MmAccount[];
  reserved: MmReservedFund[];
  caps: MmSpendingCap[];
  rules: MmPatternRuleRow[];
  overrides: { id: string; label: string; tier: number; reason: string | null }[];
}

function Section({ title, blurb, children }: { title: string; blurb: string; children: React.ReactNode }) {
  return (
    <section className="paper-card p-6">
      <h3 className="font-serif text-lg text-ink">{title}</h3>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{blurb}</p>
      {children}
    </section>
  );
}

export function DataPanel({ userId, accounts, reserved, caps, rules, overrides }: Props) {
  const qc = useQueryClient();
  const readShot = useServerFn(readBalanceScreenshot);
  const shotRef = useRef<HTMLInputElement>(null);

  const [acct, setAcct] = useState({ name: "", kind: "checking", balance: "", limit: "" });
  const [res, setRes] = useState({ label: "", amount: "", purpose: "" });
  const [cap, setCap] = useState({ category: "untracked_transfer", amount: "", instrument: "", limit: "" });
  const [rule, setRule] = useState({ pattern: "", klass: "housing" as PatternClass });

  const refresh = (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k, userId] }));

  const addAccount = useMutation({
    mutationFn: async () => {
      const balance = Number(acct.balance);
      if (!acct.name.trim() || !Number.isFinite(balance)) throw new Error("Needs a name and a balance");
      const { error } = await supabase.from("mm_accounts").insert({
        user_id: userId,
        name: acct.name.trim(),
        kind: acct.kind,
        current_balance: balance,
        credit_limit: acct.limit ? Number(acct.limit) : null,
        balance_as_of: today(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setAcct({ name: "", kind: "checking", balance: "", limit: "" });
      refresh("mm_accounts");
      toast.success("Account added.");
    },
    onError: (e: Error) => toast.error(e.message === "Needs a name and a balance" ? "Give it a name and a balance." : "Couldn't add that."),
  });

  const addReserved = useMutation({
    mutationFn: async () => {
      const amount = Number(res.amount);
      if (!res.label.trim() || !Number.isFinite(amount)) throw new Error("bad");
      const { error } = await supabase.from("mm_reserved_funds").insert({
        user_id: userId,
        label: res.label.trim(),
        amount,
        purpose: res.purpose.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setRes({ label: "", amount: "", purpose: "" });
      refresh("mm_reserved");
      toast.success("Set aside. It's out of every 'available' number until you say otherwise.");
    },
    onError: () => toast.error("Give it a name and an amount."),
  });

  const tap = useMutation({
    mutationFn: async ({ fund, amount }: { fund: MmReservedFund; amount: number }) => {
      const next = tapReserved(
        { id: fund.id, label: fund.label, amount: Number(fund.amount), purpose: fund.purpose ?? "", tapped: Number(fund.tapped_amount) },
        amount,
      );
      const { error } = await supabase.from("mm_reserved_funds").update({ tapped_amount: next.fund.tapped }).eq("id", fund.id);
      if (error) throw error;
      return next.rebuild;
    },
    onSuccess: (rebuild) => {
      refresh("mm_reserved");
      toast.success(rebuild.reason);
    },
    onError: () => toast.error("Couldn't record that."),
  });

  const addCap = useMutation({
    mutationFn: async () => {
      const amount = Number(cap.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("bad");
      const { error } = await supabase.from("mm_spending_caps").upsert(
        {
          user_id: userId,
          category: cap.category,
          cap_amount: amount,
          instrument_label: cap.instrument.trim() || null,
          instrument_limit: cap.limit ? Number(cap.limit) : null,
        },
        { onConflict: "user_id,category" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      setCap({ category: "untracked_transfer", amount: "", instrument: "", limit: "" });
      refresh("mm_caps");
      toast.success("Cap saved.");
    },
    onError: () => toast.error("Enter a cap amount above zero."),
  });

  const addRule = useMutation({
    mutationFn: async () => {
      if (!rule.pattern.trim()) throw new Error("bad");
      const { error } = await supabase.from("mm_pattern_rules").insert({
        user_id: userId,
        pattern: rule.pattern.trim(),
        classify_as: rule.klass,
        note: `You told us "${rule.pattern.trim()}" means ${CLASS_META[rule.klass].label.toLowerCase()}`,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setRule({ pattern: "", klass: "housing" });
      refresh("mm_rules");
      toast.success("Rule saved. Every future upload will read it your way.");
    },
    onError: () => toast.error("Type the words to look for."),
  });

  const remove = useMutation({
    mutationFn: async ({ table, id }: { table: string; id: string }) => {
      const { error } = await (supabase as any).from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => refresh("mm_accounts", "mm_reserved", "mm_caps", "mm_rules", "mm_overrides"),
    onError: () => toast.error("Couldn't remove that."),
  });

  const scan = useMutation({
    mutationFn: async (file: File) => {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("Couldn't read the image"));
        r.readAsDataURL(file);
      });
      return readShot({ data: { imageDataUrl: dataUrl } });
    },
    onSuccess: (r) => {
      const parts: string[] = [];
      if (r.currentBalance != null) parts.push(`balance ${fmt(r.currentBalance)}`);
      if (r.minimumPayment != null) parts.push(`minimum ${fmt(r.minimumPayment)}`);
      if (r.dueDate) parts.push(`due ${r.dueDate}`);
      setAcct((a) => ({
        ...a,
        name: r.accountName ?? a.name,
        balance: r.currentBalance != null ? String(r.currentBalance) : a.balance,
        limit: r.creditLimit != null ? String(r.creditLimit) : a.limit,
      }));
      toast.success(
        parts.length
          ? `Read ${parts.join(", ")} — check it, then save.`
          : `Nothing was legible enough to trust. ${r.notes || "Type the numbers in instead."}`,
      );
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't read that screenshot."),
  });

  const spendable = accounts.filter((a) => ["checking", "cash"].includes(a.kind));
  const spendableTotal = spendable.reduce((s, a) => s + Number(a.current_balance), 0);

  return (
    <div className="mt-6 space-y-5">
      <Section
        title="Your accounts"
        blurb="Add each account by hand — checking, savings, cards, cash. Everyday accounts and cash are what 'available' is counted from; savings and cards are shown but held out of it."
      >
        {accounts.length > 0 && (
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink">{a.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {ACCOUNT_KINDS.find((k) => k.value === a.kind)?.label}
                    {a.credit_limit != null ? ` · limit ${fmt(Number(a.credit_limit))}` : ""}
                    {a.balance_as_of ? ` · as of ${a.balance_as_of}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-ink">{fmt(Number(a.current_balance))}</span>
                  <Button size="icon" variant="ghost" aria-label={`Remove ${a.name}`} onClick={() => remove.mutate({ table: "mm_accounts", id: a.id })}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          Spendable across {spendable.length} account{spendable.length === 1 ? "" : "s"}: <span className="font-medium text-ink">{fmt(spendableTotal)}</span>
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="acct-name">Account name</Label>
            <Input id="acct-name" value={acct.name} onChange={(e) => setAcct({ ...acct, name: e.target.value })} placeholder="Everyday checking" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acct-kind">Type</Label>
            <select
              id="acct-kind"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={acct.kind}
              onChange={(e) => setAcct({ ...acct, kind: e.target.value })}
            >
              {ACCOUNT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acct-bal">Balance today</Label>
            <Input id="acct-bal" inputMode="decimal" value={acct.balance} onChange={(e) => setAcct({ ...acct, balance: e.target.value })} placeholder="0.00" />
          </div>
          {acct.kind === "credit" && (
            <div className="space-y-1.5">
              <Label htmlFor="acct-limit">Card limit</Label>
              <Input id="acct-limit" inputMode="decimal" value={acct.limit} onChange={(e) => setAcct({ ...acct, limit: e.target.value })} placeholder="0.00" />
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => addAccount.mutate()} disabled={addAccount.isPending}>Add account</Button>
          <input
            ref={shotRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) scan.mutate(f); }}
          />
          <Button size="sm" variant="outline" onClick={() => shotRef.current?.click()} disabled={scan.isPending}>
            {scan.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
            Fill from a screenshot
          </Button>
          <span className="text-xs text-muted-foreground">
            A screenshot of your balance screen fills the fields in. Anything unreadable is left blank rather than guessed.
          </span>
        </div>
      </Section>

      <Section
        title="Money you've set aside"
        blurb="Reserved money is held out of every 'available' figure until you explicitly use it. If you do use some, putting it back becomes first in line on your next payday — the same priority as rent."
      >
        {reserved.length > 0 && (
          <ul className="mt-4 space-y-2">
            {reserved.map((r) => {
              const held = Number(r.amount) - Number(r.tapped_amount);
              return (
                <li key={r.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm text-ink">{r.label}</p>
                    <p className="text-sm font-medium text-ink">{fmt(held)} held</p>
                  </div>
                  {r.purpose && <p className="mt-1 text-xs text-muted-foreground">{r.purpose}</p>}
                  {Number(r.tapped_amount) > 0 && (
                    <p className="mt-1 text-xs text-ink">
                      {fmt(Number(r.tapped_amount))} is out and owed back — first in line next payday.
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const raw = window.prompt(`How much of ${r.label} are you using?`);
                        const amount = Number(raw);
                        if (Number.isFinite(amount) && amount > 0) tap.mutate({ fund: r, amount });
                      }}
                    >
                      Use some of this
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate({ table: "mm_reserved_funds", id: r.id })}>Remove</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="res-label">What is it</Label>
            <Input id="res-label" value={res.label} onChange={(e) => setRes({ ...res, label: e.target.value })} placeholder="Tax cushion" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="res-amount">Amount</Label>
            <Input id="res-amount" inputMode="decimal" value={res.amount} onChange={(e) => setRes({ ...res, amount: e.target.value })} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="res-purpose">What it's for</Label>
            <Input id="res-purpose" value={res.purpose} onChange={(e) => setRes({ ...res, purpose: e.target.value })} placeholder="April tax bill" />
          </div>
        </div>
        <Button className="mt-3" size="sm" onClick={() => addReserved.mutate()} disabled={addReserved.isPending}>Set aside</Button>
      </Section>

      <Section
        title="Spending caps"
        blurb="A cap is a ceiling you choose, not the average you happen to spend. If the card behind a cap allows more than the cap, that gap is flagged — you can't overspend a limit that doesn't exist."
      >
        {caps.length > 0 && (
          <ul className="mt-4 space-y-2">
            {caps.map((c) => {
              const check = checkCap({
                category: CLASS_META[c.category as PatternClass]?.label ?? c.category,
                cap: Number(c.cap_amount),
                observedAvg: null,
                cycleSpent: null,
                instrumentLabel: c.instrument_label,
                instrumentLimit: c.instrument_limit == null ? null : Number(c.instrument_limit),
              });
              return (
                <li key={c.id} className={`rounded-lg border p-4 ${check.structuralGap ? "border-primary/50 bg-primary/5" : "border-border"}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm text-ink">{CLASS_META[c.category as PatternClass]?.label ?? c.category}</p>
                    <p className="text-sm font-medium text-ink">{fmt(Number(c.cap_amount))} / month</p>
                  </div>
                  <p className="mt-1 text-xs text-ink">{check.sentence}</p>
                  <Button className="mt-2" size="sm" variant="ghost" onClick={() => remove.mutate({ table: "mm_spending_caps", id: c.id })}>Remove</Button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="cap-cat">Category</Label>
            <select
              id="cap-cat"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={cap.category}
              onChange={(e) => setCap({ ...cap, category: e.target.value })}
            >
              {(Object.keys(CLASS_META) as PatternClass[])
                .filter((k) => CLASS_META[k].leaky)
                .map((k) => <option key={k} value={k}>{CLASS_META[k].label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cap-amt">Your ceiling</Label>
            <Input id="cap-amt" inputMode="decimal" value={cap.amount} onChange={(e) => setCap({ ...cap, amount: e.target.value })} placeholder="150" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cap-inst">Card behind it</Label>
            <Input id="cap-inst" value={cap.instrument} onChange={(e) => setCap({ ...cap, instrument: e.target.value })} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cap-lim">That card's limit</Label>
            <Input id="cap-lim" inputMode="decimal" value={cap.limit} onChange={(e) => setCap({ ...cap, limit: e.target.value })} placeholder="Optional" />
          </div>
        </div>
        <Button className="mt-3" size="sm" onClick={() => addCap.mutate()} disabled={addCap.isPending}>Save cap</Button>
      </Section>

      <Section
        title="How charges get read"
        blurb="Uploads are read from the raw description, not your bank's category, because bank categories are often wrong. Add your own phrases here and every future upload reads them your way."
      >
        {rules.length > 0 && (
          <ul className="mt-4 space-y-2">
            {rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
                <p className="text-sm text-ink">
                  “{r.pattern}” means {CLASS_META[r.classify_as as PatternClass]?.label ?? r.classify_as}
                </p>
                <Button size="icon" variant="ghost" aria-label="Remove rule" onClick={() => remove.mutate({ table: "mm_pattern_rules", id: r.id })}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rule-pattern">Words to look for</Label>
            <Input id="rule-pattern" value={rule.pattern} onChange={(e) => setRule({ ...rule, pattern: e.target.value })} placeholder="e.g. the shop name on your rent payment" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rule-class">Treat it as</Label>
            <select
              id="rule-class"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={rule.klass}
              onChange={(e) => setRule({ ...rule, klass: e.target.value as PatternClass })}
            >
              {(Object.keys(CLASS_META) as PatternClass[]).map((k) => <option key={k} value={k}>{CLASS_META[k].label}</option>)}
            </select>
          </div>
        </div>
        <Button className="mt-3" size="sm" onClick={() => addRule.mutate()} disabled={addRule.isPending}>Add rule</Button>
      </Section>

      {overrides.length > 0 && (
        <Section title="What you said matters most" blurb="These move an item up the order when money is short, and the reason you gave is shown wherever the order appears.">
          <ul className="mt-4 space-y-2">
            {overrides.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink">{o.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Moved to {FUNDING_TIERS[o.tier - 1]?.label}{o.reason ? ` — ${o.reason}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate({ table: "mm_priority_overrides", id: o.id })}>Remove</Button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
