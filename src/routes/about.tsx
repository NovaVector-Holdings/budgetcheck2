import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About the BudgetChek team — BudgetChek" },
      {
        name: "description",
        content:
          "How the BudgetChek team builds financial-literacy content you can trust: sourcing rules, audio production, and our no-fabrication promise.",
      },
      { property: "og:title", content: "About · BudgetChek" },
      {
        property: "og:description",
        content:
          "Our sourcing rules and how we build trustworthy financial-literacy content.",
      },
    ],
  }),
  component: AboutPage,
});

const principles = [
  {
    title: "We cite, or we don't publish.",
    body: "Every figure and claim on this site traces to a named source we link directly. If we can't source it, it doesn't go up.",
  },
  {
    title: "We summarize. We don't invent.",
    body: "Audio lessons are written as plain-language summaries of material published by federal agencies or major nonprofits. The original is one tap away on every lesson card.",
  },
  {
    title: "No affiliates. No paid placements.",
    body: "We do not earn referral fees from any link on this site. There is nothing to upsell.",
  },
  {
    title: "Free or it's out.",
    body: "Resources we list must be free to access. Paid courses and paywalled tools don't appear, even good ones.",
  },
];

function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <span className="eyebrow">About</span>
      <h1 className="heading-display mt-3 text-4xl text-ink sm:text-5xl">
        Built by the BudgetChek team — for people who are tired of money advice they can&rsquo;t verify.
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
        BudgetChek is a small cross-functional team of designers, educators,
        and engineers building a financial-literacy feature that respects your
        time and your trust. The goal is acumen — the everyday judgment around
        money that most of us were never taught — without the noise of
        influencer content.
      </p>

      <h2 className="heading-display mt-12 text-2xl text-ink">Our four rules</h2>
      <div className="mt-6 space-y-5">
        {principles.map((p) => (
          <div key={p.title} className="paper-card p-5">
            <h3 className="font-serif text-lg text-ink">{p.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {p.body}
            </p>
          </div>
        ))}
      </div>

      <h2 className="heading-display mt-12 text-2xl text-ink">
        How the audio lessons are made
      </h2>
      <p className="mt-3 text-base leading-relaxed text-foreground">
        For each lesson we pick a single, public, named source — usually a
        federal-agency guide. A human writes the script as a faithful summary,
        keeping the original&rsquo;s language and qualifications. The narration
        is then produced through a neutral text-to-speech voice. Source link,
        publisher, and run-time appear on every player so you can verify what
        you heard.
      </p>

      <h2 className="heading-display mt-12 text-2xl text-ink">A note on advice</h2>
      <p className="mt-3 text-base leading-relaxed text-foreground">
        Nothing on this site is personalized investment, tax, or legal advice.
        For your specific situation, talk to a licensed professional — or start
        with a nonprofit credit counselor (NFCC) or a free IRS VITA tax prep
        site, both linked on the Local Help page.
      </p>
    </div>
  );
}
