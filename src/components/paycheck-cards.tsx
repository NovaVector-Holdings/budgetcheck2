import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmt, today, type Profile } from "@/lib/money";
import { formatDay, RISK_LABEL, type PaycheckPlan } from "@/lib/paycheck";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

/** Required on every screen that makes a recommendation. Do not remove. */
export function AdviceDisclaimer() {
  return (
    <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
      Educational analysis based on the information you entered. Not licensed financial, tax, or legal advice.
    </p>
  );
}

function RiskBadge({ level }: { level: PaycheckPlan["riskLevel"] }) {
  const tone =
    level === "high"
      ? "bg-destructive/10 text-destructive"
      : level === "medium"
        ? "bg-gold/15 text-ink"
        : "bg-primary/10 text-primary";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>{RISK_LABEL[level]}</span>;
}

function MissingInfo({ plan }: { plan: PaycheckPlan }) {
  return (
    <div className="mt-3">
      <p className="text-sm leading-relaxed text-muted-foreground">
        We won't guess this one. To work it out we still need:
      </p>
      <ul className="mt-3 space-y-2">
        {plan.missing.map((m) => (
          <li key={m.field} className="flex items-start gap-2 text-sm">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden="true" />
            <Link to={m.to} className="text-ink underline decoration-primary/40 hover:decoration-primary">
              {m.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ label, amount, tone }: { label: string; amount: number; tone?: "good" | "bad" }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={`font-medium ${tone === "bad" ? "text-destructive" : tone === "good" ? "text-primary" : "text-ink"}`}
      >
        {fmt(Math.abs(amount))}
      </span>
    </div>
  );
}

/** "Am I okay until my next paycheck?" */
export function PaycheckPlanCard({ plan, loading }: { plan: PaycheckPlan; loading?: boolean }) {
  const shortfall = plan.estimatedRemaining < 0;
  return (
    <section className="paper-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-serif text-lg text-ink">Am I okay until my next paycheck?</h2>
        {plan.status === "ok" && <RiskBadge level={plan.riskLevel} />}
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-muted-foreground">Working out your plan…</p>
      ) : plan.status === "needs_more_info" ? (
        <MissingInfo plan={plan} />
      ) : (
        <>
          <p className="mt-3 text-sm leading-relaxed text-ink">
            {shortfall
              ? `Your plan shows a possible shortfall before your next paycheck on ${formatDay(plan.nextPayDate!)}.`
              : plan.recommendedHoldback === 0
                ? `Nothing's due before your next paycheck on ${formatDay(plan.nextPayDate!)}.`
                : `Your plan shows your listed obligations are covered through ${formatDay(plan.nextPayDate!)}.`}
          </p>

          <div className="mt-4">
            <Row label="Current balance" amount={plan.onHand} />
            <Row
              label={
                plan.obligations.length > 0
                  ? `Due before ${formatDay(plan.nextPayDate!)} (${plan.obligations.length})`
                  : `Due before ${formatDay(plan.nextPayDate!)}`
              }
              amount={plan.recommendedHoldback}
            />
            {plan.buffer > 0 && <Row label="Buffer you keep aside" amount={plan.buffer} />}
            {shortfall ? (
              <Row label="Short by" amount={plan.estimatedRemaining} tone="bad" />
            ) : (
              <div className="border-t border-border pt-2">
                <div className="flex items-baseline justify-between py-2">
                  <span className="text-sm font-medium text-ink">Estimated remaining</span>
                  <span className="font-serif text-lg font-semibold text-ink">
                    {fmt(Math.abs(plan.estimatedRemaining))}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Based on what you entered. Not a live bank balance. Your actual available cash may differ.
                </p>
              </div>
            )}
          </div>

          {plan.obligations.length > 0 && (
            <ul className="mt-3 space-y-1">
              {plan.obligations.map((o) => (
                <li key={o.id} className="flex justify-between text-xs text-muted-foreground">
                  <span>{o.name}</span>
                  <span>
                    {formatDay(o.dueDate)} · {fmt(o.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {plan.undatedDebtMinimums > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Your debt minimums add up to {fmt(plan.undatedDebtMinimums)} a month, but they don't have due dates,
              so they're left out of the number above rather than guessed at.{" "}
              <Link to="/future-expenses" className="text-primary hover:underline">
                Add one as a bill with its due date
              </Link>{" "}
              to have it counted.
            </p>
          )}

          <p className="mt-3 text-xs text-muted-foreground">Based on what you entered.</p>
        </>
      )}
      <AdviceDisclaimer />
    </section>
  );
}

/** "Your next money move" */
export function NextMoneyMoveCard({ plan, loading }: { plan: PaycheckPlan; loading?: boolean }) {
  const headline =
    plan.recommendationType === "shortfall_warning"
      ? `Heads up — your plan shows a possible shortfall of ${fmt(Math.abs(plan.estimatedRemaining))}`
      : plan.recommendationType === "holdback"
        ? `Recommended move: hold back ${fmt(plan.recommendedHoldback)}`
        : "No required payments found before your next paycheck";

  return (
    <section className="paper-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-serif text-lg text-ink">Your next money move</h2>
        {plan.status === "ok" && <RiskBadge level={plan.riskLevel} />}
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-muted-foreground">Working out your plan…</p>
      ) : plan.status === "needs_more_info" ? (
        <MissingInfo plan={plan} />
      ) : (
        <>
          <p className="mt-3 font-serif text-xl leading-snug text-ink">{headline}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{plan.reason}</p>
          <p className="mt-3 text-xs text-muted-foreground">Based on what you entered.</p>
        </>
      )}
      <AdviceDisclaimer />
    </section>
  );
}
