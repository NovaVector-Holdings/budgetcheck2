import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { fmt } from "@/lib/money";
import { BUDGET_METHODS, computeMethod, type BudgetMethod, type MethodInput } from "@/lib/budget-methods";

/**
 * Shows exactly one budget method — the one the person chose in Settings.
 * Never all of them at once; comparing frameworks is the thing that confuses people.
 */
export function BudgetMethodView({ method, input }: { method: BudgetMethod; input: MethodInput }) {
  const meta = BUDGET_METHODS.find((m) => m.value === method) ?? BUDGET_METHODS[0];
  const result = computeMethod(method, input);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className="paper-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="eyebrow">Your budget method</p>
          <h2 className="mt-1 font-serif text-xl text-ink">{meta.label}</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{meta.tagline}</p>
        </div>
        <Link to="/settings" className="text-sm font-medium text-primary hover:underline">
          Change method
        </Link>
      </div>

      {!input.income ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Add your monthly income in{" "}
          <Link to="/settings" className="text-primary hover:underline">
            Settings
          </Link>{" "}
          and this fills in.
        </p>
      ) : (
        <>
          <p className="mt-4 text-sm text-muted-foreground">
            Based on {fmt(result.income)} a month coming in, and what you've entered for this month.
          </p>

          <div className="mt-4 space-y-3">
            {result.buckets.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing to show yet — add your{" "}
                <Link to="/future-expenses" className="text-primary hover:underline">
                  bills and expenses
                </Link>
                .
              </p>
            )}
            {result.buckets.map((b) => {
              const pct = b.target ? Math.min((b.actual / b.target) * 100, 100) : Math.min((b.actual / Math.max(result.income, 1)) * 100, 100);
              const over = b.target != null && b.actual > b.target;
              const problem = over && !b.goalBucket;
              const under = b.target != null && b.goalBucket && b.actual < b.target;
              return (
                <div key={b.key} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-ink">{b.label}</p>
                    <p className="text-sm text-ink">
                      {fmt(b.actual)}
                      {b.target != null && <span className="text-muted-foreground"> of {fmt(b.target)}</span>}
                    </p>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-secondary">
                    <div
                      className={`h-1.5 rounded-full transition-all ${problem ? "bg-destructive" : "bg-primary"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {problem
                      ? `${fmt(b.actual - (b.target ?? 0))} over the target.`
                      : under
                        ? `${fmt((b.target ?? 0) - b.actual)} below your goal.`
                        : b.explain}
                  </p>
                  {b.lines.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setOpen(open === b.key ? null : b.key)}
                        className="mt-2 text-xs font-medium text-primary hover:underline"
                        aria-expanded={open === b.key}
                      >
                        {open === b.key ? "Hide" : `Show the ${b.lines.length} item${b.lines.length === 1 ? "" : "s"}`}
                      </button>
                      {open === b.key && (
                        <ul className="mt-2 space-y-1">
                          {b.lines.map((l, i) => (
                            <li key={`${l.label}-${i}`} className="flex justify-between text-xs text-muted-foreground">
                              <span>{l.label}</span>
                              <span>{fmt(l.amount)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 border-t border-border pt-4">
            <p className="text-sm text-ink">
              {result.status === "balanced"
                ? "Every dollar of your income is accounted for."
                : result.status === "unassigned"
                  ? `${fmt(result.unassigned)} of your income isn't assigned to anything yet.`
                  : `You've planned ${fmt(Math.abs(result.unassigned))} more than comes in.`}
            </p>
            {result.warnings.map((w) => (
              <p key={w} className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {w}
              </p>
            ))}
          </div>

          <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
            {meta.source} Educational analysis based on the information you entered. Not licensed financial, tax, or
            legal advice.
          </p>
        </>
      )}
    </section>
  );
}
