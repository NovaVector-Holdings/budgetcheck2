import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Headphones,
  BookOpen,
  Briefcase,
  LifeBuoy,
  ShieldCheck,
  Compass,
  GraduationCap,
  RotateCcw,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BudgetChek — Know what your next paycheck needs to do" },
      {
        name: "description",
        content:
          "Plan the bills due before payday, protect the buffer you choose, and get one clear next money move — manual-first, no bank connection required.",
      },
      { property: "og:title", content: "BudgetChek — Paycheck-first money planning" },
      {
        property: "og:description",
        content:
          "See what your next paycheck needs to cover, what's estimated to remain, and what to do next — using the numbers you enter.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

const architecture = [
  {
    icon: Compass,
    eyebrow: "Decide",
    title: "Know what needs to happen with your money now.",
    items: [
      "Plan the next paycheck",
      "Stay ahead of bills",
      "Build savings",
      "Work a debt payoff plan",
    ],
  },
  {
    icon: GraduationCap,
    eyebrow: "Learn",
    title: "Understand the financial concepts behind the decision.",
    items: [
      "Short audio lessons",
      "Free guides from federal agencies",
      "Legit ways to earn",
      "Local help near you",
    ],
  },
  {
    icon: RotateCcw,
    eyebrow: "Review",
    title: "Use Money Meeting to see what changed and adjust the next move.",
    items: [
      "A weekly check-in",
      "A monthly review",
      "What matters most, in your own words",
      "Review progress in Money Meeting",
    ],
  },
] as const;

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

const twoSides = [
  {
    to: "/learn",
    icon: Headphones,
    eyebrow: "Learn money",
    title: "Understand money, in minutes a week",
    body: "Short audio lessons, free guides from federal agencies, legit ways to earn, and local help near you. No account needed — every fact links to its source.",
    bullets: ["3-minute audio lessons", "CFPB, SEC & FTC guides", "211 and local assistance"],
    cta: "Start learning",
  },
  {
    to: "/auth",
    icon: ShieldCheck,
    eyebrow: "My money",
    title: "Your paycheck, your plan, private to you",
    body: "A free account turns what you learn into a plan: what your next paycheck needs to cover, a savings and debt payoff strategy, and a weekly money meeting with yourself.",
    bullets: [
      "Paycheck-first planning",
      "Bills, savings & debt trackers",
      "Weekly check-ins in Money Meeting",
    ],
    cta: "Create a free account",
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
        <div className="mx-auto max-w-6xl px-6 pb-16 pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <span className="eyebrow">Paycheck-first money planning</span>
            <h1 className="heading-display mt-4 text-5xl text-ink sm:text-6xl">
              Know what your <span className="text-primary">next paycheck</span> needs to do.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              BudgetChek helps you understand what your money needs to cover, what may remain
              afterward, and what to focus on next — using the information you enter.
            </p>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
              Manual-first. No bank connection required.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/auth"
                search={{ redirect: undefined }}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Work my numbers
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                to="/learn"
                className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-secondary"
              >
                Learn money
              </Link>
            </div>
          </div>

          {/* The core mechanic, shown plainly: this is the actual arithmetic
              BudgetChek runs, not a chart standing in for a promise. */}
          <div className="paper-card mx-auto mt-12 max-w-3xl p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="eyebrow">The math, in the open</p>
              <span className="text-xs text-muted-foreground">Example numbers</span>
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex items-baseline justify-between border-b border-border py-2 text-sm">
                <span className="text-muted-foreground">Current balance</span>
                <span className="font-medium text-ink">$640.00</span>
              </div>
              <div className="flex items-baseline justify-between border-b border-border py-2 text-sm">
                <span className="text-muted-foreground">Items due before payday (2)</span>
                <span className="font-medium text-ink">−$205.00</span>
              </div>
              <div className="flex items-baseline justify-between border-b border-border py-2 text-sm">
                <span className="text-muted-foreground">Buffer you choose to keep aside</span>
                <span className="font-medium text-ink">−$100.00</span>
              </div>
              <div className="flex items-baseline justify-between pt-2">
                <span className="font-serif text-lg text-ink">Estimated remaining</span>
                <span className="font-serif text-xl font-semibold text-ink">$335.00</span>
              </div>
            </div>
            <div className="mt-5 rounded-lg border border-border bg-secondary/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Next money move
              </p>
              <p className="mt-1 text-sm text-ink">
                Hold back $205.00 for the 2 items due before payday — the rest is what's estimated
                to remain.
              </p>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Example numbers, not your data. Based on what you entered. Not a live bank balance.
              Your actual available cash may differ.
            </p>
          </div>

          {/* The three-part architecture -- Decide / Learn / Review -- with
              Money Meeting named and visible, not a buried bullet. */}
          <div className="mt-16">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="heading-display text-3xl text-ink sm:text-4xl">
                How BudgetChek works
              </h2>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {architecture.map((a) => (
                <div key={a.eyebrow} className="paper-card flex flex-col gap-4 p-6">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-primary">
                    <a.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <span className="eyebrow">{a.eyebrow}</span>
                    <p className="mt-2 font-serif text-lg leading-snug text-ink">{a.title}</p>
                  </div>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {a.items.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <span
                          aria-hidden
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold"
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Two sides of the product, and how they connect. */}
          <div className="mt-16">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow">How the two sides connect</p>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                Learn something in Learn Money → apply it to your numbers in My Money → review what
                changed in Money Meeting → improve the next decision.
              </p>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-2 md:gap-6">
              {twoSides.map((side) => (
                <Link
                  key={side.eyebrow}
                  to={side.to}
                  {...(side.to === "/auth" ? { search: { redirect: undefined } } : {})}
                  className="paper-card group relative flex flex-col gap-5 p-8 transition-transform hover:-translate-y-1"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-primary">
                      <side.icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="eyebrow">{side.eyebrow}</span>
                  </div>
                  <div>
                    <h2 className="font-serif text-2xl text-ink">{side.title}</h2>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      {side.body}
                    </p>
                  </div>
                  <ul className="space-y-2 text-sm text-foreground">
                    {side.bullets.map((b) => (
                      <li key={b} className="flex items-center gap-2">
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold" />
                        {b}
                      </li>
                    ))}
                  </ul>
                  <span className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-primary">
                    {side.cta}
                    <ArrowRight
                      className="h-4 w-4 transition-transform group-hover:translate-x-1"
                      aria-hidden
                    />
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
              Every Learn Money resource links back to its public source.
            </span>
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
              Your numbers stay private to your account.
            </span>
            <Link
              to="/auth"
              search={{ redirect: undefined }}
              className="font-semibold text-primary hover:underline"
            >
              Just looking? Try the demo account
            </Link>
          </div>
        </div>
      </section>

      {/* Learn Money pillars */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <span className="eyebrow">Learn money</span>
            <h2 className="heading-display mt-2 text-3xl text-ink sm:text-4xl">Four ways in.</h2>
          </div>
          <p className="hidden max-w-sm text-sm text-muted-foreground sm:block">
            Pick what fits your week. Each section opens onto vetted, no-cost material — and
            connects back to your own plan.
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
                <p.icon className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <span className="eyebrow">{p.eyebrow}</span>
                <h3 className="mt-1 font-serif text-xl text-ink">{p.title}</h3>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                Open <ArrowRight className="h-4 w-4" aria-hidden />
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
              Every Learn Money resource points back to a named source.
            </h2>
          </div>
          <div className="space-y-4 text-base leading-relaxed text-foreground">
            <p>
              Every lesson and resource in Learn Money is tracked to a named source — federal,
              state, or local government agencies, established nonprofits, or other approved
              public-service sources — and the source link appears with the content, not buried in a
              footnote.
            </p>
            <p>
              Our audio lessons are plain-language summaries checked against that material, not
              written from memory. Where we add our own explanation beyond what a source directly
              states, that's how we treat it — an explanation, not a claim we're putting in a
              regulator's mouth.
            </p>
            <p>
              Learn Money does not use paid placements or affiliate links. If a resource isn&rsquo;t
              free or doesn&rsquo;t come from a source we can identify and review, it doesn&rsquo;t
              go in Learn Money.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
