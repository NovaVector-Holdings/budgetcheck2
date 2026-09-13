import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { fmt, type Debt } from "@/lib/money";
import { buildPayoffPlan, humanMonths, type PayoffPlan } from "@/lib/payoff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Chart({ plan }: { plan: PayoffPlan }) {
  const pts = plan.series;
  const max = Math.max(...pts.map((p) => p.balance), 1);
  const w = 100;
  const h = 40;
  const path = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${(i / (pts.length - 1)) * w} ${h - (p.balance / max) * h}`)
    .join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-32 w-full" preserveAspectRatio="none" role="img"
        aria-label={`Your total balance falling from ${fmt(pts[0].balance)} today to zero in ${plan.freeLabel}`}>
        <path d={`${path} L ${w} ${h} L 0 ${h} Z`} fill="var(--color-primary)" opacity="0.14" />
        <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{pts[0].label} · {fmt(pts[0].balance)}</span>
        <span>{plan.freeLabel} · $0</span>
      </div>
    </div>
  );
}

function Missing({ reason }: { reason?: string }) {
  const copy =
    reason === "no-debts"
      ? "No debts listed, so there's nothing to pay off — that's the goal, reached."
      : reason === "no-payment"
        ? "Add a minimum monthly payment to each debt (or an extra amount below) and your date appears."
        : reason === "payment-too-small"
          ? "Right now the payments don't quite cover the monthly interest, so the balance wouldn't fall. Adding a little extra changes that."
          : "These numbers stretch past 50 years, so no date is shown. Try adding an extra monthly amount.";
  return <p className="mt-3 text-sm text-muted-foreground">{copy}</p>;
}

/** The headline promise: a real date, built only from the debts you entered. */
export function DebtFreeDate({
  debts,
  method,
  compact = false,
}: {
  debts: Debt[];
  method: "snowball" | "avalanche";
  compact?: boolean;
}) {
  const [extra, setExtra] = useState("");
  const extraNum = Number(extra) || 0;

  const base = useMemo(() => buildPayoffPlan(debts, method, 0), [debts, method]);
  const boosted = useMemo(() => buildPayoffPlan(debts, method, extraNum), [debts, method, extraNum]);
  // The headline date always reflects your current payments; the extra box shows what changes.
  const plan = base;
  const saved = base.possible && boosted.possible ? base.months - boosted.months : 0;
  const interestSaved = base.possible && boosted.possible ? base.totalInterest - boosted.totalInterest : 0;

  if (compact) {
    return (
      <div className="paper-card p-6">
        <p className="eyebrow">Your debt-free date</p>
        {plan.possible ? (
          <>
            <p className="mt-2 font-serif text-3xl text-ink">{plan.freeLabel}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {humanMonths(plan.months)} away at {fmt(plan.monthlyPayment)} a month, based on the debts you entered.
            </p>
            <div className="mt-4">
              <Chart plan={plan} />
            </div>
            <Link to="/debt" className="mt-4 inline-block text-sm text-ink underline">
              See the payoff plan and speed it up
            </Link>
          </>
        ) : (
          <>
            <Missing reason={plan.reason} />
            <Link to="/debt" className="mt-3 inline-block text-sm text-ink underline">Open Debt</Link>
          </>
        )}
      </div>
    );
  }

  return (
    <section className="paper-card p-6">
      <p className="eyebrow">Your debt-free date</p>
      {plan.possible ? (
        <>
          <h2 className="mt-2 font-serif text-4xl text-ink">{plan.freeLabel}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            That's {humanMonths(plan.months)} from now, paying {fmt(plan.monthlyPayment)} a month with the{" "}
            {method === "snowball" ? "smallest balance" : "highest rate"} first, and about {fmt(plan.totalInterest)} in
            interest along the way.
          </p>
          <div className="mt-5">
            <Chart plan={plan} />
            <p className="mt-2 text-xs text-muted-foreground">
              The line is everything you owe, added together, falling month by month until it hits zero.
            </p>
          </div>

          <div className="mt-6 rounded-lg border border-border bg-secondary/40 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="extra-pay">Pay extra each month</Label>
                <Input
                  id="extra-pay"
                  inputMode="decimal"
                  className="w-32"
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                  placeholder="50"
                />
              </div>
              {[25, 50, 100].map((n) => (
                <Button key={n} size="sm" variant="outline" onClick={() => setExtra(String(n))}>
                  +${n}
                </Button>
              ))}
              {extra && (
                <Button size="sm" variant="ghost" onClick={() => setExtra("")}>
                  Reset
                </Button>
              )}
            </div>
            <p className="mt-3 text-sm text-ink">
              {extraNum > 0 && saved > 0
                ? `Adding ${fmt(extraNum)} a month moves your date to ${boosted.freeLabel} — ${humanMonths(saved)} sooner, and about ${fmt(interestSaved)} less interest.`
                : extraNum > 0
                  ? `Adding ${fmt(extraNum)} a month keeps the date at ${boosted.freeLabel} but cuts interest by about ${fmt(Math.max(0, interestSaved))}.`
                  : "Try an extra amount to see how much sooner you'd finish."}
            </p>
          </div>

          {plan.perDebt.length > 1 && (
            <div className="mt-6">
              <h3 className="font-serif text-lg text-ink">Order you'd clear them</h3>
              <ol className="mt-2 space-y-1.5">
                {plan.perDebt.map((d, i) => (
                  <li key={d.id} className="flex items-center justify-between text-sm">
                    <span className="text-ink">{i + 1}. {d.name}</span>
                    <span className="text-muted-foreground">{d.label}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <p className="mt-5 text-xs text-muted-foreground">
            An estimate from the balances, rates, and payments you entered — no fees, promotions, or new charges are
            assumed. Not financial advice.
          </p>
        </>
      ) : (
        <Missing reason={plan.reason} />
      )}
    </section>
  );
}
