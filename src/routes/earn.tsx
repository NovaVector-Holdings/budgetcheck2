import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { ResourceCard } from "@/components/resource-card";
import { earnResources } from "@/lib/resources";

export const Route = createFileRoute("/earn")({
  head: () => ({
    meta: [
      { title: "Earn · Legit ways to grow income — BudgetChek" },
      {
        name: "description",
        content:
          "Trusted U.S. job portals, apprenticeship programs, and FTC guidance on spotting work-from-home scams.",
      },
      { property: "og:title", content: "Earn · BudgetChek" },
      {
        property: "og:description",
        content: "Public job portals, paid apprenticeships, and scam warnings.",
      },
    ],
  }),
  component: EarnPage,
});

function EarnPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <header className="max-w-2xl">
        <span className="eyebrow">Earn</span>
        <h1 className="heading-display mt-3 text-4xl text-ink sm:text-5xl">
          Legit ways to grow income.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          We do not recommend specific gig-economy apps or &ldquo;side
          hustles&rdquo; — those change fast and many are riskier than they
          look. Instead, here are public, accountable starting points used by
          career counselors and American Job Centers.
        </p>
      </header>

      <div className="mt-8 flex items-start gap-3 rounded-lg border border-gold/40 bg-gold/10 p-4 text-sm">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-gold-foreground" />
        <div>
          <strong className="font-semibold text-ink">
            Read the FTC scam guide first.
          </strong>{" "}
          The most common money loss in this category isn&rsquo;t from a bad
          job — it&rsquo;s from a fake one.
        </div>
      </div>

      <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {earnResources.map((r) => (
          <ResourceCard key={r.url} r={r} />
        ))}
      </section>
    </div>
  );
}
