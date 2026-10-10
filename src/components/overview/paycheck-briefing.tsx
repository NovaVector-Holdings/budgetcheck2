import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { fmt } from "@/lib/money";
import { formatDay, formatShort } from "@/lib/decision-engine";
import type { FootingRow, KeepItem, PlanStatus, PlanView } from "@/lib/plan-status";
import { Button } from "@/components/ui/button";
import { BalanceForm, BalanceLine } from "@/components/overview/balance-update";
import type { useMoneyState } from "@/hooks/use-money-state";

// Gate 1 — BudgetChek 2.0 Overview Human-Evidence Remediation, then
// Gate 2 remediation (CEO ruling "GATE 2 RESULT + FINAL REMEDIATION PATH",
// 2026-10-09).
//
// This is the paycheck-first decision hero: the ONE thing a person should
// be able to answer without interpreting an analytics dashboard --
//   1. What do I have now?
//   2. What does this paycheck need to cover?
//   3. What may remain, based on what I entered?
//   4. What should I focus on next?
//
// Every figure here is read off state.snapshot -- the SAME computeSnapshot()
// result Money Meeting/Weekly Check-in/Ask a Question all use (one governed
// engine, not two) -- through derivePlanStatus(), a pure, proven derivation
// (scripts/prove-plan-status.ts) that adds no money math of its own.
//
// What Gate 2's evidence changed: a large positive "Estimated remaining" was
// read as spendable money even with disclaimer language beside it. So when a
// REQUIRED obligation can't be placed in the paycheck window (a debt minimum
// with no due date), the plan is INCOMPLETE and says so as the dominant
// message; any dollar figure from the known items is demoted to a labeled,
// visually subordinate PARTIAL calculation. The normal "Estimated remaining"
// is shown only for a complete plan.

type MoneyState = ReturnType<typeof useMoneyState>;

/** Real, computed setup gaps only -- never a hand-rolled checklist. A
 *  paycheck briefing genuinely cannot be computed without a balance, a
 *  next pay date, and a pay cadence; everything else (bills, debts,
 *  goals) is optional richness, not a blocker, so it's never listed
 *  here. This is why the CTA below disappears the moment it's actually
 *  true, rather than needing a separate "mark as dismissed" state. */
function SetupNeeded({
  status,
  state,
  userId,
  balance,
}: {
  status: Extract<PlanStatus, { kind: "setup" }>;
  state: MoneyState;
  userId: string;
  /** Present when a balance IS on file, so it (and the buffer) stay editable
   *  even while payday / cadence are still missing. */
  balance: { source: "accounts" | "profile"; amount: number; asOf: string | null } | null;
}) {
  return (
    <section className="paper-card p-6 sm:p-8">
      <p className="eyebrow">Paycheck briefing</p>
      <h2 className="mt-2 font-serif text-2xl text-ink">A few numbers, and this fills in</h2>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
        BudgetChek won't guess your balance, your next payday, or how often you're paid — add those
        and your paycheck briefing appears here automatically.
      </p>
      {status.needsBalance && (
        <div className="mt-5">
          <BalanceForm
            userId={userId}
            source="none"
            profileBalance={null}
            buffer={Number(state.profile?.spending_buffer ?? 0)}
            heading="Start with your balance"
            onDone={() => {}}
          />
        </div>
      )}
      {balance && (
        <div className="mt-5">
          <BalanceLine
            userId={userId}
            source={balance.source}
            balance={balance.amount}
            asOf={balance.asOf}
            profileBalance={state.profile?.cash_on_hand ?? null}
            buffer={Number(state.profile?.spending_buffer ?? 0)}
          />
        </div>
      )}
      {status.missing.length > 0 && (
        <ul className="mt-5 space-y-2">
          {status.missing.map((m) => (
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
      )}
    </section>
  );
}

function CalcRow({
  label,
  value,
  emphasize,
  muted,
  noRule,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  muted?: boolean;
  /** The row's items follow directly beneath it, so no divider between them. */
  noRule?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-2.5 ${
        emphasize || noRule ? "" : "border-b border-border/70 last:border-0"
      }`}
    >
      <span
        className={
          emphasize
            ? muted
              ? "text-sm font-medium text-muted-foreground"
              : "text-sm font-medium text-ink"
            : "text-sm text-muted-foreground"
        }
      >
        {label}
      </span>
      <span
        className={`whitespace-nowrap ${
          emphasize
            ? muted
              ? "font-serif text-xl text-muted-foreground"
              : "font-serif text-3xl text-ink"
            : "text-sm text-ink"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function signed(n: number) {
  return `${n < 0 ? "−" : "+"}${fmt(Math.abs(n))}`;
}

/** What "Keep available" is made of, itemized so it never reads as a bare
 *  number. Survey evidence: people could not say what the items were. */
function KeepList({ items }: { items: KeepItem[] }) {
  return (
    <ul className="-mt-1 mb-1 space-y-1 border-b border-border/70 pb-2.5 pl-3">
      {items.map((i) => (
        <li
          key={i.id}
          className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground"
        >
          <span>
            {i.label}
            {i.dueDate ? ` · due ${formatShort(i.dueDate)}` : ""}
          </span>
          <span className="whitespace-nowrap">{fmt(i.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

/** The visible calculation: Balance, minus what's due, minus what's set
 *  aside. The rows come from derivePlanStatus and provably sum to the
 *  remainder printed under them. */
function Footing({
  status,
  state,
  userId,
}: {
  status: Exclude<PlanStatus, { kind: "setup" }>;
  state: MoneyState;
  userId: string;
}) {
  return (
    <div>
      {status.footing.map((row: FootingRow) => {
        if (row.key === "balance") {
          return (
            <BalanceLine
              key="balance"
              userId={userId}
              source={status.balanceSource}
              balance={status.balance}
              asOf={status.balanceAsOf}
              profileBalance={state.profile?.cash_on_hand ?? null}
              buffer={Number(state.profile?.spending_buffer ?? 0)}
            />
          );
        }
        if (row.key === "keep") {
          return (
            <div key="keep">
              <CalcRow label={row.label} value={signed(row.amount)} noRule />
              <KeepList items={status.keepItems} />
            </div>
          );
        }
        return <CalcRow key={row.key} label={row.label} value={signed(row.amount)} />;
      })}
    </div>
  );
}

/** One next focus -- never a list of competing priorities. */
function NextFocus({
  heading,
  children,
  tone = "neutral",
}: {
  heading: string;
  children: ReactNode;
  tone?: "neutral" | "alert";
}) {
  return (
    <div
      className={`mt-5 rounded-lg p-4 ${tone === "alert" ? "bg-destructive/10" : "bg-secondary/60"}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{heading}</p>
      {children}
    </div>
  );
}

/** PLAN INCOMPLETE -- the dominant state. The incomplete message leads; the
 *  known-item arithmetic follows as a labeled, visually subordinate partial. */
function IncompleteBriefing({
  status,
  state,
  userId,
}: {
  status: Extract<PlanStatus, { kind: "incomplete" }>;
  state: MoneyState;
  userId: string;
}) {
  const many = status.unplaced.length > 1;
  const short = status.remainder < 0;
  return (
    <section className="paper-card p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="eyebrow">Paycheck briefing</p>
        <span className="text-xs text-muted-foreground">Through {formatDay(status.windowEnd)}</span>
      </div>

      <div className="mt-4 rounded-lg border-l-4 border-gold bg-gold/15 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-ink">Plan incomplete</p>
        <h2 className="mt-1 font-serif text-2xl leading-snug text-ink">{status.headline}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink">{status.lead}</p>
        <ul className="mt-3 space-y-2">
          {status.unplaced.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm text-ink"
            >
              <span>
                {d.name}
                {d.reason === "timing" ? " minimum" : ""}
                <Link
                  to="/debt"
                  search={{ edit: d.id }}
                  aria-label={`${d.reason === "timing" ? "Add due date" : "Add minimum payment"} for ${d.name}`}
                  className="ml-2 text-xs font-medium text-ink underline underline-offset-2"
                >
                  {d.reason === "timing" ? "Add due date" : "Add minimum payment"}
                </Link>
              </span>
              <span className="font-medium">
                {d.reason === "timing" ? fmt(d.minPayment) : "minimum not entered"}
              </span>
            </li>
          ))}
          {many && status.unplacedTotal > 0 && (
            <li className="flex items-baseline justify-between gap-3 border-t border-gold/50 pt-1.5 text-sm text-ink">
              <span>{status.totalLabel}</span>
              <span className="font-medium">{fmt(status.unplacedTotal)}</span>
            </li>
          )}
        </ul>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gold/50 pt-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink">Next focus</p>
            <p className="mt-1 text-sm text-ink">{status.nextFocus}</p>
          </div>
          <Button asChild>
            <Link to="/debt" search={{ edit: status.unplaced[0]?.id }}>
              {status.ctaLabel}
            </Link>
          </Button>
        </div>
      </div>

      {/* The partial calculation: kept visible (the ruling allows it) but
          deliberately NOT the oversized figure and NOT labeled as the normal
          remainder. */}
      <div className="mt-5 rounded-lg border border-dashed border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Partial calculation · known items only
          </p>
        </div>
        <div className="mt-2">
          <Footing status={status} state={state} userId={userId} />
          <div className="mt-1 border-t border-border pt-2.5">
            <CalcRow
              label={short ? "Known-item shortfall (partial)" : "Known-item remainder (partial)"}
              value={fmt(Math.abs(status.remainder))}
              emphasize
              muted
            />
          </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Required debt minimums
          {status.hasUnknownAmount ? "" : ` (${fmt(status.unplacedTotal)})`} are not included yet,
          so this is {short ? "not the full gap — it could be larger." : "not the final remainder."}
        </p>
      </div>
    </section>
  );
}

/** A COMPLETE plan: every required obligation is either placed in this
 *  window or has a known date outside it. This is the only state that shows
 *  the normal "Estimated remaining". */
function CompleteBriefing({
  status,
  state,
  userId,
}: {
  status: Extract<PlanStatus, { kind: "healthy" | "shortfall" | "empty" }>;
  state: MoneyState;
  userId: string;
}) {
  const shortfall = status.kind === "shortfall";
  const hasItems = status.keepItems.length > 0;
  const hasBuffer = status.footing.some((r) => r.key === "buffer");

  return (
    <section className="paper-card p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="eyebrow">Paycheck briefing</p>
        <span className="text-xs text-muted-foreground">Through {formatDay(status.windowEnd)}</span>
      </div>

      {/* The ONE decision amount. Deliberately the only oversized figure
          on this page. The balance it starts from is the first line of THIS
          calculation (with its own Update control) -- there is no second,
          competing balance card. */}
      <div className="mt-4">
        <Footing status={status} state={state} userId={userId} />
        <div className="mt-1 border-t border-border pt-2.5">
          <CalcRow
            label={shortfall ? "Short by" : "Estimated remaining"}
            value={fmt(Math.abs(status.remainder))}
            emphasize
          />
        </div>
      </div>

      {(hasItems || hasBuffer) && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {hasItems && "Keep available is for the items listed before payday."}
          {hasItems && hasBuffer && " "}
          {hasBuffer && "Buffer is the extra amount you chose to leave untouched."}
        </p>
      )}

      {/* Trust boundary: never "safe to spend," never implied as a live
          balance. Stated in the same breath as the number itself. */}
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

      {shortfall ? (
        <NextFocus heading="Next money move" tone="alert">
          <p className="mt-1 text-sm leading-relaxed text-ink">{status.nextFocus}</p>
        </NextFocus>
      ) : (
        <NextFocus heading="Next focus">
          <p className="mt-1 text-sm font-medium leading-relaxed text-ink">{status.nextFocus}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{status.status}</p>
        </NextFocus>
      )}
    </section>
  );
}

/** Rendered only inside the data gate (Overview wraps it in MoneyDataGate),
 *  so every figure here comes from fully loaded engine data. The `view` is
 *  computed once by the Overview and shared with the Debt-free card. */
export function PaycheckBriefing({
  state,
  userId,
  view,
}: {
  state: MoneyState;
  userId: string;
  view: PlanView;
}) {
  const { status, ctx } = view;

  if (status.kind === "setup") {
    return (
      <SetupNeeded
        status={status}
        state={state}
        userId={userId}
        balance={
          ctx.balanceSource === "none"
            ? null
            : {
                source: ctx.balanceSource,
                amount: state.engineInput.account.currentBalance,
                asOf: ctx.balanceAsOf,
              }
        }
      />
    );
  }
  if (status.kind === "incomplete") {
    return <IncompleteBriefing status={status} state={state} userId={userId} />;
  }
  return <CompleteBriefing status={status} state={state} userId={userId} />;
}
