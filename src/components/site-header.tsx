import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const learnNav = [
  { to: "/learn", label: "Listen" },
  { to: "/read", label: "Read" },
  { to: "/earn", label: "Earn" },
  { to: "/help", label: "Local Help" },
  { to: "/about", label: "About" },
] as const;

const LEARN_PATHS = ["/learn", "/read", "/earn", "/help", "/about"];

export function SiteHeader() {
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const inLearn = LEARN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const inMoney = pathname.startsWith("/overview")
    || ["/savings", "/debt", "/analytics", "/money-meeting", "/future-expenses", "/import", "/calendar", "/archives", "/alerts", "/settings", "/onboarding"]
      .some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    setMenuOpen(false);
    navigate({ to: "/", replace: true });
  }

  const pillBase =
    "flex-1 rounded-full px-4 py-2 text-center transition-colors sm:flex-none sm:px-5";
  const pillOn = "bg-primary text-primary-foreground";
  const pillOff = "text-muted-foreground hover:bg-background hover:text-ink";

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link to="/" className="flex shrink-0 items-center gap-2" onClick={() => setMenuOpen(false)}>
          <span
            aria-hidden
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-serif text-base"
          >
            i
          </span>
          <span className="font-serif text-lg font-semibold tracking-tight text-ink">
            BudgetChek
          </span>
        </Link>

        {/* Two primary destinations: learn the money skills, or work your own numbers. */}
        <nav
          className="hidden rounded-full border border-border bg-secondary/60 p-1 md:flex md:items-center md:gap-1"
          aria-label="Main sections"
        >
          <Link
            to="/learn"
            className={`${pillBase} ${inLearn ? pillOn : pillOff}`}
            aria-current={inLearn ? "page" : undefined}
          >
            <span className="block text-sm font-medium leading-tight">Learn money</span>
            <span className="block text-[11px] leading-tight opacity-80">Lessons, guides, help</span>
          </Link>
          <Link
            to={user ? "/overview" : "/auth"}
            {...(user ? {} : { search: { redirect: "/overview" } })}
            className={`${pillBase} ${inMoney ? pillOn : pillOff}`}
            aria-current={inMoney ? "page" : undefined}
          >
            <span className="block text-sm font-medium leading-tight">My money</span>
            <span className="block text-[11px] leading-tight opacity-80">
              {user ? "Your plan & numbers" : "Sign in to start"}
            </span>
          </Link>
        </nav>

        <div className="hidden shrink-0 items-center md:flex">
          {user ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
            >
              Sign out
            </button>
          ) : (
            <Link
              to="/auth"
              search={{ redirect: undefined }}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
            >
              Sign in
            </Link>
          )}
        </div>

        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-ink md:hidden"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span aria-hidden className="text-lg leading-none">{menuOpen ? "✕" : "☰"}</span>
        </button>
      </div>

      {/* Secondary bar: only the pages inside the learning section. */}
      {inLearn && (
        <div className="hidden border-t border-border/60 bg-secondary/30 md:block">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-6 py-2" aria-label="Learning pages">
            {learnNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-background hover:text-ink"
                activeProps={{ className: "text-ink bg-background" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}

      {menuOpen && (
        <nav className="border-t border-border/70 bg-background px-6 py-3 md:hidden" aria-label="Mobile">
          <div className="flex flex-col">
            <Link
              to={user ? "/overview" : "/auth"}
              {...(user ? {} : { search: { redirect: "/overview" } })}
              onClick={() => setMenuOpen(false)}
              className="rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground"
            >
              My money — {user ? "your plan & numbers" : "sign in to start"}
            </Link>
            <p className="mt-4 px-3 text-xs uppercase tracking-wide text-muted-foreground">Learn money</p>
            {learnNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
                activeProps={{ className: "text-ink bg-secondary" }}
              >
                {item.label}
              </Link>
            ))}
            {user && (
              <button
                type="button"
                onClick={handleSignOut}
                className="mt-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
              >
                Sign out
              </button>
            )}
          </div>
        </nav>
      )}
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
