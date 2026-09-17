import { Link } from "@tanstack/react-router";
import { fmt } from "@/lib/money";
import { formatDay } from "@/lib/decision-engine";
import type { useMoneyState } from "@/hooks/use-money-state";

// Gate 1 — BudgetChek 2.0 Overview Human-Evidence Remediation.
//
// This is the paycheck-first decision hero: the ONE thing a person should
// be able to answer without interpreting an analytics dashboard --
//   1. What do I have now?
//   2. What does this paycheck need to cover?
//   3. What may remain, based on what I entered?
//   4. What should I focus on next?
//
// Every figure here is read straight off state.snapshot -- the SAME
// computeSnapshot() result Money Meeting/Weekly Check-in/Ask a Question
// all use. This intentionally replaces the old Overview's separate
// buildPaycheckPlan() calculation (src/lib/paycheck.ts): one governed
// engine, not two. See docs/gate1-overview-2.0-remediation.md for the
// Round-2 survey finding -> design response mapping this implements.

type MoneyState = ReturnType<typeof useMoneyState>;

/** Real, computed setup gaps only -- never a hand-rolled checklist. A
 *  paycheck briefing genuinely cannot be computed without a balance, a
 *  next pay date, and a pay cadence; everything else (bills, debts,
 *  goals) is optional richness, not a blocker, so it's never listed
 *  here. This is why the CTA below disappears the moment it's actually
 *  true, rather than needing a separate "mark as dismissed" state. */
function SetupNeeded({ missing }: { missing: MoneyState["snapshot"]["missing"] }) {
  return (
    <section className="paper-card p-6 sm:p-8">
      <p className="eyebrow">Paycheck briefing</p>
      <h2 className="mt-2 font-serif text-2xl text-ink">A few numbers, and this fills in</h2>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
        BudgetChek won't guess your balance, your next payday, or how often you're paid — add those
        and your paycheck briefing appears here automatically.
      </p>
      <ul className="mt-5 space-y-2">
        {missing.map((m) => (
          <li key={m.field}>
            <Link
              to={m.to}
              className="flex items-center justify-between rounded-lg border border-border p-3 text-sm text-ink transition-colors hover:bg-secondary/50"
            >
              <span>{m.label}</span>
              <span className="text-primary">Add it →</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CalcRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between py-2.5 ${
        emphasize ? "" : "border-b border-border/70 last:border-0"
      }`}
    >
      <span
        className={emphasize ? "text-sm font-medium text-ink" : "text-sm text-muted-foreground"}
      >
        {label}
      </span>
      <span className={emphasize ? "font-serif text-3xl text-ink" : "text-sm text-ink"}>
        {value}
      </span>
    </div>
  );
}

/** The full paycheck briefing -- shown once setup is complete (real
 *  balance/payday/cadence on file, snap.missing is empty). computeSnapshot
 *  only ever returns a null funding/window when next_pay_date couldn't be
 *  projected at all -- which requires next_pay_date itself to be absent,
 *  and that's one of the three fields snap.missing checks. So an empty
 *  missing list here structurally guarantees funding/window are real,
 *  computed values, never null; the two `!` below encode that guarantee
 *  rather than working around it. */
function Briefing({ state }: { state: MoneyState }) {
  const snap = state.snapshot;
  const funding = snap.funding!;
  const window = snap.window!;

  // No funding plan items at all (nothing due, nothing tracked) is a
  // real, distinct state from "funding plan exists and is fully
  // covered" -- both are healthy, but the wording must not claim to
  // cover items that were never evaluated because none exist.
  const hasItems = funding.items.length > 0;
  const remaining = funding.available - funding.totalRequested;
  const shortfall = remaining < 0;
  const buffer = snap.reservedTotal + state.engineInput.safeBuffer;
  const itemCount = funding.items.length;

  return (
    <section className="paper-card p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="eyebrow">Paycheck briefing</p>
        <span className="text-xs text-muted-foreground">Through {formatDay(window.end)}</span>
      </div>

      {/* The ONE decision amount. Deliberately the only oversized figure
          on this page -- current balance, income, debt-free countdown,
          and every other metric render smaller, below, and never in
          this card. */}
      <div className="mt-4">
        <CalcRow label="Balance" value={fmt(state.engineInput.account.currentBalance)} />
        {hasItems && (
          <CalcRow
            label={`Keep available for ${itemCount} item${itemCount === 1 ? "" : "s"}`}
            value={`−${fmt(funding.totalRequested)}`}
          />
        )}
        {buffer > 0 && <CalcRow label="Buffer" value={`−${fmt(buffer)}`} />}
        <div className="mt-1 border-t border-border pt-2.5">
          <CalcRow
            label={shortfall ? "Short by" : "Estimated remaining"}
            value={fmt(Math.abs(remaining))}
            emphasize
          />
        </div>
      </div>

      {/* Trust boundary: never "safe to spend," never implied as a live
          balance. Stated in the same breath as the number itself, not a
          disclaimer buried below it. */}
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {shortfall ? (
          <>Based on what you've entered — not a live bank balance.</>
        ) : (
          <>
            Based on what you've entered, minus what's listed above — not a live bank balance, not
            permission to spend, and not aware of anything you haven't entered yet.
          </>
        )}
      </p>

      {/* What should I focus on next -- the engine's own honest sentence,
          already carrying the unknown-debt-timing caveat when one
          applies (see decision-engine.ts's buildFundingPlan). */}
      <div className={`mt-5 rounded-lg p-4 ${shortfall ? "bg-destructive/10" : "bg-secondary/60"}`}>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Next money move
        </p>
        <p
          className={`mt-1 text-sm leading-relaxed ${shortfall ? "text-destructive" : "text-ink"}`}
        >
          {snap.headline}
        </p>
      </div>

      {snap.reservedTotal > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {fmt(snap.reservedTotal)} held in reserved funds, kept out of the balance above.
        </p>
      )}
    </section>
  );
}

export function PaycheckBriefing({ state }: { state: MoneyState }) {
  if (state.loading) {
    return (
      <section className="paper-card p-6 sm:p-8">
        <p className="eyebrow">Paycheck briefing</p>
        <p className="mt-3 text-sm text-muted-foreground">Working it out…</p>
      </section>
    );
  }
  if (state.snapshot.missing.length > 0) {
    return <SetupNeeded missing={state.snapshot.missing} />;
  }
  return <Briefing state={state} />;
}
