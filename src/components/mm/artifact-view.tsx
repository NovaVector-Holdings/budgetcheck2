import { fmt } from "@/lib/money";
import { formatDay, formatShort, FUNDING_TIERS } from "@/lib/decision-engine";
import type {
  BudgetActualPayload,
  CashFlowPayload,
  ChecklistPayload,
  PayoffPayload,
  SavingsPhasesPayload,
} from "@/lib/artifacts";
import type { MmArtifact } from "@/lib/mm";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, Printer, RefreshCw } from "lucide-react";

interface Props {
  artifact: MmArtifact;
  onToggle?: (key: string, value: boolean) => void;
  onRecompute?: () => void;
  recomputing?: boolean;
}

/** Every artifact leads with its plain-language takeaway, never a bare table. */
function Header({ artifact, onRecompute, recomputing }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="eyebrow">{new Date(artifact.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
        <h3 className="mt-1 font-serif text-xl text-ink">{artifact.title}</h3>
        {artifact.takeaway && <p className="mt-2 max-w-2xl text-sm text-ink">{artifact.takeaway}</p>}
      </div>
      <div className="flex shrink-0 gap-2 print:hidden">
        {onRecompute && (
          <Button size="sm" variant="outline" onClick={onRecompute} disabled={recomputing}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${recomputing ? "animate-spin" : ""}`} aria-hidden />
            Redo with today's numbers
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => window.print()}>
          <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Print
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-serif text-2xl text-ink">{value}</p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

function CashFlow({ p }: { p: CashFlowPayload }) {
  return (
    <div className="mt-5 space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Available now" value={fmt(p.balanceToday - p.reservedHeld)} note={p.reservedHeld ? `${fmt(p.reservedHeld)} held back as reserved` : "Nothing reserved yet"} />
        <Stat
          label={`Low point by ${formatShort(p.windowEnd)}`}
          value={fmt(p.projectedMinBalance)}
          note="Counted over your pay cycle, not the calendar month — that's where timing risk shows"
        />
        <Stat label="Reserved money" value={fmt(p.reservedHeld)} note="Out of the maths until you say otherwise" />
      </div>

      {p.missing.length > 0 && (
        <div className="rounded-lg border border-border bg-secondary/50 p-4">
          <p className="text-sm font-medium text-ink">To finish this picture, add:</p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {p.missing.map((m) => <li key={m.field}>• {m.label}</li>)}
          </ul>
        </div>
      )}

      <div>
        <p className="eyebrow">What your money covers, in order</p>
        <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
          {p.items.map((it, i) => (
            <li key={it.id}>
              {i === p.cutoffIndex && (
                <div className="flex items-center gap-2 border-b border-dashed border-primary bg-primary/5 px-4 py-1.5 text-xs font-medium text-ink">
                  <AlertTriangle className="h-3.5 w-3.5 text-primary" aria-hidden />
                  Funding runs out here
                </div>
              )}
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink">{it.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {it.tierLabel}
                    {it.dueDate ? ` · due ${formatDay(it.dueDate)}` : ""}
                    {it.reasonMoved ? ` · ${it.reasonMoved}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-ink">{fmt(it.amount)}</p>
                  <p className="text-xs text-muted-foreground">
                    {it.status === "funded" ? "covered" : it.status === "partial" ? `${fmt(it.funded)} covered` : "not covered"}
                  </p>
                </div>
              </div>
            </li>
          ))}
          {!p.items.length && <li className="px-4 py-3 text-sm text-muted-foreground">Nothing due in this window.</li>}
        </ul>
      </div>

      {p.debts.length > 0 && (
        <div>
          <p className="eyebrow">Debts, most expensive first</p>
          <ul className="mt-2 space-y-1.5">
            {p.debts.map((d) => (
              <li key={d.creditor} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-ink">{d.creditor}{d.apr != null ? ` · ${d.apr}%` : ""}</span>
                <span className="font-medium text-ink">{fmt(d.balance)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {p.goals.length > 0 && (
        <div>
          <p className="eyebrow">Savings goals</p>
          <ul className="mt-2 space-y-2">
            {p.goals.map((g) => (
              <li key={g.label}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-ink">{g.label}</span>
                  <span className="text-muted-foreground">{fmt(g.current)} of {fmt(g.target)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-secondary">
                  <div className="h-1.5 rounded-full bg-primary" style={{ width: `${g.pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Payoff({ p, checked, onToggle }: { p: PayoffPayload; checked: Record<string, boolean>; onToggle?: Props["onToggle"] }) {
  if (p.impossibleReason && !p.rows.length) return null;
  return (
    <div className="mt-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Clear by" value={p.freeDate ? formatShort(p.freeDate) : "—"} />
        <Stat label="Each cycle" value={fmt(p.minPerCycle + p.perCycleExtra)} note={p.perCycleExtra ? `${fmt(p.perCycleExtra)} of that is extra` : "Minimum only"} />
        <Stat label="Interest along the way" value={fmt(p.totalInterest)} />
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3">Done</th>
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3 text-right">Payment</th>
              <th className="py-2 pr-3 text-right">Interest</th>
              <th className="py-2 text-right">Balance after</th>
            </tr>
          </thead>
          <tbody>
            {p.rows.map((r) => {
              const key = `row-${r.n}`;
              const on = !!checked[key];
              return (
                <tr key={key} className={`border-b border-border/50 ${on ? "text-muted-foreground" : "text-ink"}`}>
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={on}
                      onChange={() => onToggle?.(key, !on)}
                      aria-label={`Payment ${r.n} done`}
                    />
                  </td>
                  <td className="py-2 pr-3">{formatShort(r.date)}</td>
                  <td className="py-2 pr-3 text-right">{fmt(p.minPerCycle + r.extraPayment)}</td>
                  <td className="py-2 pr-3 text-right">{fmt(r.interest)}</td>
                  <td className="py-2 text-right font-medium">{fmt(r.resultingBalance)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Ticks are saved to your account and stay ticked when you print this page.
      </p>
    </div>
  );
}

function Checklist({ p, checked, onToggle }: { p: ChecklistPayload; checked: Record<string, boolean>; onToggle?: Props["onToggle"] }) {
  const done = p.items.filter((i) => checked[i.key]).length;
  return (
    <div className="mt-5">
      <p className="text-sm text-muted-foreground">{done} of {p.items.length} ticked</p>
      <ul className="mt-3 space-y-2">
        {p.items.map((it) => {
          const on = !!checked[it.key];
          return (
            <li key={it.key}>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-secondary/50">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-primary"
                  checked={on}
                  onChange={() => onToggle?.(it.key, !on)}
                />
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${on ? "text-muted-foreground line-through" : "text-ink"}`}>{it.label}</span>
                  <span className="block text-xs text-muted-foreground">{it.detail}</span>
                </span>
                {it.amount != null && <span className="shrink-0 text-sm font-medium text-ink">{fmt(it.amount)}</span>}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BudgetActual({ p }: { p: BudgetActualPayload }) {
  return (
    <div className="mt-5 space-y-5">
      {p.anomalies.length > 0 && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
          <p className="text-sm font-medium text-ink">Called out on purpose</p>
          <ul className="mt-2 space-y-1.5 text-sm text-ink">
            {p.anomalies.map((a, i) => <li key={i}>• {a}</li>)}
          </ul>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3">Category</th>
              <th className="py-2 pr-3 text-right">Planned</th>
              <th className="py-2 pr-3 text-right">Actual</th>
              <th className="py-2 text-right">Difference</th>
            </tr>
          </thead>
          <tbody>
            {p.rows.map((r) => (
              <tr key={r.category} className="border-b border-border/50">
                <td className="py-2 pr-3 text-ink">
                  {r.label}
                  {r.note && <span className="block text-xs text-muted-foreground">{r.note}</span>}
                </td>
                <td className="py-2 pr-3 text-right text-muted-foreground">{r.planned == null ? "—" : fmt(r.planned)}</td>
                <td className="py-2 pr-3 text-right text-ink">{fmt(r.actual)}</td>
                <td className={`py-2 text-right font-medium ${r.diff != null && r.diff > 0 ? "text-ink" : "text-muted-foreground"}`}>
                  {r.diff == null ? "—" : `${r.diff > 0 ? "+" : ""}${fmt(r.diff)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SavingsPhases({ p }: { p: SavingsPhasesPayload }) {
  return (
    <ol className="mt-5 space-y-3">
      {p.phases.map((ph) => (
        <li key={ph.n} className={`rounded-lg border p-4 ${ph.status === "active" ? "border-primary bg-primary/5" : "border-border"}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-serif text-lg text-ink">
              Phase {ph.n} · {ph.percentOfCheck}% of each deposit
            </p>
            <p className="text-sm font-medium text-ink">
              {ph.amountPerCheck != null ? `${fmt(ph.amountPerCheck)} per deposit` : "amount unknown"}
            </p>
          </div>
          <p className="mt-1 text-sm text-ink">Goes to {ph.destination}</p>
          <p className="mt-1 text-xs text-muted-foreground">{ph.trigger}</p>
          {ph.status === "active" && (
            <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-ink">
              <Check className="h-3.5 w-3.5 text-primary" aria-hidden /> Running now
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

export function ArtifactView({ artifact, onToggle, onRecompute, recomputing }: Props) {
  const checked = artifact.check_state ?? {};
  const p = artifact.payload as unknown;

  return (
    <section className="paper-card p-6">
      <Header artifact={artifact} onRecompute={onRecompute} recomputing={recomputing} />
      {artifact.kind === "cash_flow" && <CashFlow p={p as CashFlowPayload} />}
      {artifact.kind === "payoff_schedule" && <Payoff p={p as PayoffPayload} checked={checked} onToggle={onToggle} />}
      {artifact.kind === "checklist" && <Checklist p={p as ChecklistPayload} checked={checked} onToggle={onToggle} />}
      {artifact.kind === "budget_actual" && <BudgetActual p={p as BudgetActualPayload} />}
      {artifact.kind === "savings_phases" && <SavingsPhases p={p as SavingsPhasesPayload} />}
      <p className="mt-5 text-xs text-muted-foreground">
        Built from the numbers you entered. Educational, not financial advice — and no bank connection is used.
      </p>
    </section>
  );
}

export const TIER_LEGEND = FUNDING_TIERS;
