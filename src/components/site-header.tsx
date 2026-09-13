import { Link } from "@tanstack/react-router";

const nav = [
  { to: "/learn", label: "Listen" },
  { to: "/read", label: "Read" },
  { to: "/earn", label: "Earn" },
  { to: "/help", label: "Local Help" },
  { to: "/about", label: "About" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2 group">
          <span
            aria-hidden
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-serif text-base"
          >
            i
          </span>
          <span className="font-serif text-lg font-semibold tracking-tight text-ink">
            BudgetChek<span className="text-gold">·</span>Money
          </span>
        </Link>
        <nav className="hidden gap-1 md:flex">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
              activeProps={{ className: "text-ink bg-secondary" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border/70 bg-secondary/40">
      <div className="mx-auto max-w-6xl px-6 py-10 text-sm text-muted-foreground">
        <p className="font-serif text-base text-ink">
          Built by the BudgetChek team — financial literacy you can verify.
        </p>
        <p className="mt-2 max-w-2xl leading-relaxed">
          Every guide, dollar figure, and link on this site points to a public,
          named source — federal agencies, established nonprofits, or major
          public-service projects. Nothing here is a paid placement. We never
          ask for your bank credentials.
        </p>
        <p className="mt-4 text-xs">
          Educational use only. Not investment, tax, or legal advice. © {new Date().getFullYear()} BudgetChek.
        </p>
      </div>
    </footer>
  );
}
