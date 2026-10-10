import { Link } from "@tanstack/react-router";
import { fmt } from "@/lib/money";
import { humanMonths } from "@/lib/payoff";
import type { DebtFreeCardState } from "@/lib/debt-free-card";

// The Debt-free goal card, honest about what the paycheck plan knows.
// The decision of WHAT to claim lives in src/lib/debt-free-card.ts (pure and
// proven); this file only renders it. SME/CEO return: no unqualified payoff
// date beside a PLAN INCOMPLETE banner.
//
// Reading order matters: in the qualified state the qualifier comes BEFORE the
// date in the DOM, so a screen reader never announces an unqualified date.
// Meaning is carried by words, not by the gold tint (its border is decoration),
// and only text-ink sits on the tint (muted / primary text fail AA there in
// dark mode).

const CARD =
  "paper-card group flex flex-col justify-between p-5 transition-shadow hover:shadow-md sm:col-span-2 lg:col-span-1";

function Eyebrow() {
  return (
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      Debt-free goal
    </p>
  );
}

export function DebtFreeCard({ card }: { card: DebtFreeCardState }) {
  switch (card.kind) {
    case "no-debts":
      return (
        <Link to="/debt" className={CARD}>
          <Eyebrow />
          <p className="mt-2 text-sm text-muted-foreground">
            {card.hadRows
              ? "Every debt you've entered is at $0."
              : "No debts tracked. That's the goal — add one here if anything changes."}
          </p>
        </Link>
      );

    case "blocked":
      return (
        <Link to="/debt" search={{ edit: card.firstId }} className={CARD}>
          <Eyebrow />
          <div className="mt-2 min-w-0">
            <p className="break-words text-sm font-medium leading-relaxed text-ink">
              No payoff date yet — {card.names} {card.count === 1 ? "has" : "have"} no minimum
              payment on file.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Without {card.count === 1 ? "it" : "them"}, any date would be a guess.
            </p>
            <p className="mt-3 text-sm font-medium text-primary group-hover:underline">
              {card.count === 1 ? "Add the minimum payment →" : "Add minimum payments →"}
            </p>
          </div>
        </Link>
      );

    case "cannot-estimate":
      return (
        <Link to="/debt" className={CARD}>
          <Eyebrow />
          <p className="mt-2 text-sm text-muted-foreground">{card.copy}</p>
        </Link>
      );

    case "estimate": {
      const { plan } = card;
      if (card.dueDatesIncomplete) {
        return (
          <Link
            to="/debt"
            search={card.firstTimingId ? { edit: card.firstTimingId } : undefined}
            className={CARD}
          >
            <Eyebrow />
            <div className="mt-2 min-w-0">
              <p className="text-xs text-muted-foreground">
                Long-term estimate based on {fmt(plan.monthlyPayment)}/mo
              </p>
              <p className="font-serif text-xl text-ink">{plan.freeLabel}</p>
              <p className="mt-1 text-xs text-muted-foreground">{humanMonths(plan.months)} away</p>
              <p className="mt-3 rounded-r-md border-l-4 border-gold bg-gold/15 px-3 py-2 text-xs leading-relaxed text-ink">
                This paycheck's debt timing is still incomplete.
              </p>
              <p className="mt-2 text-sm font-medium text-primary group-hover:underline">
                {card.timingCount === 1 ? "Add the due date →" : "Add due dates →"}
              </p>
            </div>
          </Link>
        );
      }
      return (
        <Link to="/debt" className={CARD}>
          <Eyebrow />
          <div className="mt-2">
            <p className="font-serif text-xl text-ink">{plan.freeLabel}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {humanMonths(plan.months)} away at {fmt(plan.monthlyPayment)}/mo · see the plan →
            </p>
          </div>
        </Link>
      );
    }
  }
}
