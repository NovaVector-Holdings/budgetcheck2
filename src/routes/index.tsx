import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Headphones, BookOpen, Briefcase, LifeBuoy, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IDEOU Money — Trustworthy financial literacy, no fluff" },
      {
        name: "description",
        content:
          "Free audio lessons, guides, and local help — sourced only from federal agencies and major nonprofits. Built by the IDEOU team.",
      },
      { property: "og:title", content: "IDEOU Money — Trustworthy financial literacy" },
      {
        property: "og:description",
        content:
          "Free audio lessons, vetted guides, and local help. Every claim links to its source.",
      },
    ],
  }),
  component: Home,
});

const pillars = [
  {
    to: "/learn",
    icon: Headphones,
    eyebrow: "Listen",
    title: "Short audio lessons",
    body: "Calm, plain-language lessons built strictly from federal-agency material — each one cites its source.",
  },
  {
    to: "/read",
    icon: BookOpen,
    eyebrow: "Read",
    title: "Free guides & workbooks",
    body: "Hand-picked PDFs and articles from CFPB, the SEC, the FTC, FDIC, and others.",
  },
  {
    to: "/earn",
    icon: Briefcase,
    eyebrow: "Earn",
    title: "Legit ways to grow income",
    body: "Public job portals, apprenticeships, and FTC guidance on spotting work-from-home scams.",
  },
  {
    to: "/help",
    icon: LifeBuoy,
    eyebrow: "Local help",
    title: "Real assistance nearby",
    body: "211, Benefits.gov, LIHEAP, free tax prep, and nonprofit credit counseling — find what you qualify for.",
  },
] as const;

function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-60"
          style={{
            background:
              "radial-gradient(60% 80% at 80% 0%, oklch(0.91 0.04 75 / 0.6), transparent 60%), radial-gradient(50% 60% at 0% 100%, oklch(0.34 0.055 165 / 0.15), transparent 60%)",
          }}
        />
        <div className="mx-auto grid max-w-6xl gap-10 px-6 pb-16 pt-20 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
          <div>
            <span className="eyebrow">Financial literacy · No paywall · No fluff</span>
            <h1 className="heading-display mt-4 text-5xl text-ink sm:text-6xl">
              Money is a skill.
              <br />
              <span className="text-primary">We help you build it</span>{" "}
              <span className="italic text-gold">— honestly.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              IDEOU Money is a small team of designers and educators building
              budgeting acumen the way it should be taught: in short audio lessons,
              free guides, and pointers to real help — all sourced from agencies
              you can verify.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/learn"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
              >
                Start a 3-minute lesson <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/read"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-3 text-sm font-semibold text-ink hover:bg-secondary"
              >
                Browse free guides
              </Link>
            </div>

            <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Every fact links back to its public source.
            </div>
          </div>

          <div className="relative">
            <div className="paper-card relative p-8">
              <span className="eyebrow">Today&rsquo;s lesson</span>
              <h3 className="mt-3 font-serif text-2xl text-ink">
                Building your first budget
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                A budget is a plan for the money coming in and going out. In three
                minutes we&rsquo;ll walk through the framework CFPB publishes in
                its Your Money, Your Goals toolkit.
              </p>
              <Link
                to="/learn"
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
              >
                Open in the player <ArrowRight className="h-4 w-4" />
              </Link>
              <div className="mt-6 flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                Source: Consumer Financial Protection Bureau
              </div>
            </div>
            <div
              aria-hidden
              className="absolute -right-6 -top-6 -z-10 h-28 w-28 rounded-full bg-gold/40 blur-2xl"
            />
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-10 flex items-end justify-between gap-4">
          <h2 className="heading-display text-3xl text-ink sm:text-4xl">
            Four ways in.
          </h2>
          <p className="hidden max-w-sm text-sm text-muted-foreground sm:block">
            Pick what fits your week. Each section opens onto vetted, no-cost material.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p) => (
            <Link
              key={p.to}
              to={p.to}
              className="paper-card group flex flex-col gap-4 p-6 transition-transform hover:-translate-y-1"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-primary">
                <p.icon className="h-5 w-5" />
              </span>
              <div>
                <span className="eyebrow">{p.eyebrow}</span>
                <h3 className="mt-1 font-serif text-xl text-ink">{p.title}</h3>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                Open <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Trust */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="paper-card grid gap-8 p-10 lg:grid-cols-[1fr_2fr]">
          <div>
            <span className="eyebrow">Our rule</span>
            <h2 className="heading-display mt-3 text-3xl text-ink">
              No invented facts. Ever.
            </h2>
          </div>
          <div className="space-y-4 text-base leading-relaxed text-foreground">
            <p>
              Everything on IDEOU Money traces back to a named, publicly-published
              source — federal agencies like CFPB, the SEC, FDIC, FTC, IRS and HHS,
              or long-established nonprofits like United Way (211) and NFCC.
            </p>
            <p>
              Our audio lessons are written as plain-language summaries of those
              sources, and the original is linked on every lesson card so you can
              confirm what you heard.
            </p>
            <p>
              We do not sell anything. We do not take affiliate fees. If a tool
              isn&rsquo;t free or doesn&rsquo;t come from a trustworthy publisher,
              it doesn&rsquo;t go on the page.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
