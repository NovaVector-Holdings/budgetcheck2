import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Headphones, BookOpen, Briefcase, LifeBuoy, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BudgetChek — Trustworthy financial literacy, no fluff" },
      {
        name: "description",
        content:
          "Free audio lessons, guides, and local help — sourced only from federal agencies and major nonprofits. Built by the BudgetChek team.",
      },
      { property: "og:title", content: "BudgetChek — Trustworthy financial literacy" },
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
    title: "Your own plan, private to you",
    body: "A free account turns what you learn into a plan: savings goals, a debt payoff strategy, a bill calendar, and a weekly money meeting with yourself.",
    bullets: ["Savings & debt trackers", "Bill calendar & alerts", "Charts that show progress"],
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
            <span className="eyebrow">Financial literacy · No paywall · No fluff</span>
            <h1 className="heading-display mt-4 text-5xl text-ink sm:text-6xl">
              Money is a skill.
              <br />
              <span className="text-primary">Learn it,</span>{" "}
              <span className="italic text-gold">then work it.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              BudgetChek pairs trustworthy money education with simple private
              tools — so you can understand your money and actually do something
              about it, in the same place.
            </p>
          </div>

          {/* Two sides of the product */}
          <div className="mt-12 grid gap-4 md:grid-cols-2 md:gap-6">
            {twoSides.map((side) => (
              <Link
                key={side.eyebrow}
                to={side.to}
                {...(side.to === "/auth" ? { search: { redirect: undefined } } : {})}
                className="paper-card group relative flex flex-col gap-5 p-8 transition-transform hover:-translate-y-1"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-primary">
                    <side.icon className="h-5 w-5" />
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
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Every fact links back to its public source.
            </span>
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Your numbers stay private to your account.
            </span>
            <Link to="/auth" search={{ redirect: undefined }} className="font-semibold text-primary hover:underline">
              Just looking? Try the demo account
            </Link>
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
              Everything on BudgetChek traces back to a named, publicly-published
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
