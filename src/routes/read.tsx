import { createFileRoute } from "@tanstack/react-router";
import { ResourceCard } from "@/components/resource-card";
import { readResources } from "@/lib/resources";

export const Route = createFileRoute("/read")({
  head: () => ({
    meta: [
      { title: "Read · Free guides & workbooks — IDEOU Money" },
      {
        name: "description",
        content:
          "Vetted, free PDFs and guides from CFPB, the SEC, the FTC, FDIC, and other trusted publishers.",
      },
      { property: "og:title", content: "Read · IDEOU Money" },
      {
        property: "og:description",
        content: "Free, publisher-named guides on budgeting, credit, debt, and investing.",
      },
    ],
  }),
  component: ReadPage,
});

function ReadPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <header className="max-w-2xl">
        <span className="eyebrow">Read</span>
        <h1 className="heading-display mt-3 text-4xl text-ink sm:text-5xl">
          Free guides & workbooks.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          These are downloadable PDFs and long-form guides — the kind of
          material a financial counselor would actually hand you. All are free
          to read and published by a named, accountable organization.
        </p>
      </header>

      <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {readResources.map((r) => (
          <ResourceCard key={r.url} r={r} />
        ))}
      </section>
    </div>
  );
}
