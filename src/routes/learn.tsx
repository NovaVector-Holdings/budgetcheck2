import { createFileRoute } from "@tanstack/react-router";
import { LessonPlayer } from "@/components/lesson-player";
import { ResourceCard } from "@/components/resource-card";
import { lessons } from "@/lib/lessons";
import { learnResources } from "@/lib/resources";

export const Route = createFileRoute("/learn")({
  head: () => ({
    meta: [
      { title: "Listen · Short audio lessons on money — BudgetChek" },
      {
        name: "description",
        content:
          "3-minute audio lessons summarizing CFPB, FDIC, SEC, and FTC consumer-finance material. Each lesson links back to its source.",
      },
      { property: "og:title", content: "Listen · BudgetChek" },
      {
        property: "og:description",
        content:
          "Calm audio lessons on budgeting, credit, investing basics, and avoiding scams — every claim cited.",
      },
    ],
  }),
  component: LearnPage,
});

function LearnPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <header className="max-w-2xl">
        <span className="eyebrow">Listen</span>
        <h1 className="heading-display mt-3 text-4xl text-ink sm:text-5xl">
          Short audio lessons.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Press play and learn while you walk or commute. Each lesson is a
          plain-language summary of material published by a named U.S. agency or
          major nonprofit. Audio is generated on demand — your first play may
          take a few seconds.
        </p>
      </header>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        {lessons.map((l) => (
          <LessonPlayer key={l.id} lesson={l} />
        ))}
      </section>

      <section className="mt-20">
        <h2 className="heading-display text-2xl text-ink">Want full courses?</h2>
        <p className="mt-2 text-muted-foreground">
          These free curricula go deeper than any 3-minute lesson can.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {learnResources.map((r) => (
            <ResourceCard key={r.url} r={r} />
          ))}
        </div>
      </section>
    </div>
  );
}
