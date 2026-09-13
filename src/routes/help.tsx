import { createFileRoute } from "@tanstack/react-router";
import { Phone } from "lucide-react";
import { ResourceCard } from "@/components/resource-card";
import { helpResources } from "@/lib/resources";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Local Help · Real assistance near you — BudgetChek" },
      {
        name: "description",
        content:
          "211, Benefits.gov, LIHEAP, free tax prep, and nonprofit credit counseling — find help you qualify for in your area.",
      },
      { property: "og:title", content: "Local Help · BudgetChek" },
      {
        property: "og:description",
        content: "Find local food, rent, utility, tax, and credit-counseling help.",
      },
    ],
  }),
  component: HelpPage,
});

function HelpPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <header className="max-w-2xl">
        <span className="eyebrow">Local help · U.S. only</span>
        <h1 className="heading-display mt-3 text-4xl text-ink sm:text-5xl">
          When things are tight, start here.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Asking for help is a money skill, not a failure of one. These
          directories will route you to real local services — food, rent,
          utilities, tax prep, and credit counseling — based on where you live.
        </p>
      </header>

      <a
        href="https://www.211.org/"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-primary p-6 text-primary-foreground shadow-md transition-transform hover:-translate-y-0.5"
      >
        <div className="flex items-center gap-4">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary-foreground/15">
            <Phone className="h-6 w-6" />
          </span>
          <div>
            <p className="font-serif text-2xl">Dial 2-1-1</p>
            <p className="text-sm text-primary-foreground/80">
              Free, confidential help with food, housing, utilities, childcare, and crisis support — anywhere in the U.S.
            </p>
          </div>
        </div>
        <span className="text-sm font-semibold underline-offset-4 hover:underline">
          Open 211.org →
        </span>
      </a>

      <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {helpResources.map((r) => (
          <ResourceCard key={r.url} r={r} />
        ))}
      </section>

      <p className="mt-12 text-xs text-muted-foreground">
        If you are in immediate danger or experiencing a mental-health crisis, call or text 988 (Suicide &amp; Crisis Lifeline) or 911.
      </p>
    </div>
  );
}
