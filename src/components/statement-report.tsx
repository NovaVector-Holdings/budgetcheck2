import { fmt } from "@/lib/money";
import type { StatementReview } from "@/lib/statement-review";
import { CheckCircle2, HelpCircle, TrendingDown } from "lucide-react";

const toneStyles = {
  win: { border: "border-l-primary", icon: CheckCircle2, iconClass: "text-primary" },
  watch: { border: "border-l-gold", icon: TrendingDown, iconClass: "text-gold" },
  check: { border: "border-l-muted-foreground", icon: HelpCircle, iconClass: "text-muted-foreground" },
} as const;

function Bar({ pct, className }: { pct: number; className: string }) {
  return (
    <div className="h-2 flex-1 rounded-full bg-secondary">
      <div className={`h-2 rounded-full ${className}`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
    </div>
  );
}

export function StatementReport({ review }: { review: StatementReview }) {
  const { months, categories, flags } = review;
  const maxMonth = Math.max(1, ...months.map((m) => Math.max(m.income, m.spend)));
  const maxCat = categories[0]?.total ?? 1;

  return (
    <div className="space-y-6">
      <section className="paper-card p-6">
        <p className="eyebrow">Your review</p>
        <h2 className="mt-2 font-serif text-2xl text-ink">
          {review.start && review.end ? `${review.start} to ${review.end}` : "This file"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {review.txnCount} rows read from your file. Every number below is added up from those rows only.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Money in</p>
            <p className="mt-1 font-serif text-2xl text-ink">{fmt(review.income)}</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Money out</p>
            <p className="mt-1 font-serif text-2xl text-ink">{fmt(review.spend)}</p>
          </div>
          <div className="rounded-lg border border-border bg-secondary/40 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Left over</p>
            <p className={`mt-1 font-serif text-2xl ${review.net < 0 ? "text-gold" : "text-ink"}`}>{fmt(review.net)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Money in minus money out</p>
          </div>
        </div>
      </section>

      {months.length > 1 && (
        <section className="paper-card p-6">
          <h3 className="font-serif text-lg text-ink">Month by month</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Top bar is money in, bottom bar is money out. Longer bottom bar means that month ran short.
          </p>
          <ul className="mt-4 space-y-3">
            {months.map((m) => (
              <li key={m.month} className="grid grid-cols-[68px_1fr_92px] items-center gap-3">
                <span className="text-xs text-muted-foreground">{m.label}</span>
                <div className="space-y-1">
                  <Bar pct={(m.income / maxMonth) * 100} className="bg-primary/40" />
                  <Bar pct={(m.spend / maxMonth) * 100} className={m.net < 0 ? "bg-gold" : "bg-primary"} />
                </div>
                <span className={`text-right text-xs font-medium ${m.net < 0 ? "text-gold" : "text-ink"}`}>
                  {m.net < 0 ? "−" : "+"}{fmt(Math.abs(m.net)).replace("$", "$")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {categories.length > 0 && (
        <section className="paper-card p-6">
          <h3 className="font-serif text-lg text-ink">Where the money went</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Biggest first. Bar length compares one category to your largest one.
          </p>
          <ul className="mt-4 space-y-2">
            {categories.map((c) => (
              <li key={c.category} className="grid grid-cols-[110px_1fr_110px] items-center gap-3">
                <span className="text-sm capitalize text-ink">{c.category}</span>
                <Bar pct={(c.total / maxCat) * 100} className="bg-primary/70" />
                <span className="text-right text-xs text-muted-foreground">
                  {fmt(c.total)} · {Math.round(c.share * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {review.biggest.length > 0 && (
        <section className="paper-card p-6">
          <h3 className="font-serif text-lg text-ink">Your five largest charges</h3>
          <ul className="mt-3 space-y-1.5">
            {review.biggest.map((t, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-xs text-muted-foreground">{t.date}</span>
                <span className="flex-1 truncate text-ink">{t.description}</span>
                <span className="font-medium text-ink">{fmt(Math.abs(t.amount))}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="font-serif text-lg text-ink">Wins and gaps</h3>
        <p className="mt-1 text-xs text-muted-foreground">Both, together — that's the honest picture.</p>
        <ul className="mt-3 space-y-3">
          {flags.map((f, i) => {
            const s = toneStyles[f.tone];
            const Icon = s.icon;
            return (
              <li key={i} className={`paper-card border-l-4 p-4 ${s.border}`}>
                <div className="flex items-start gap-3">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.iconClass}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{f.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
                  </div>
                  {f.amount !== undefined && (
                    <span className="shrink-0 font-serif text-base text-ink">{fmt(f.amount)}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="text-xs text-muted-foreground">
        This review only knows what was in the file you gave it. It isn't financial advice, and cash spending or other
        accounts won't appear here.
      </p>
    </div>
  );
}
