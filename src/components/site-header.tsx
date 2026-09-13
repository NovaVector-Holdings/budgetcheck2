import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/learn", label: "Listen" },
  { to: "/read", label: "Read" },
  { to: "/earn", label: "Earn" },
  { to: "/help", label: "Local Help" },
  { to: "/about", label: "About" },
] as const;

export function SiteHeader() {
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2 group" onClick={() => setMenuOpen(false)}>
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

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
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
          {user ? (
            <>
              <Link
                to="/overview"
                className="ml-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                My money
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              to="/auth"
              className="ml-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Sign in
            </Link>
          )}
        </nav>

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

      {menuOpen && (
        <nav className="border-t border-border/70 bg-background px-6 py-3 md:hidden" aria-label="Mobile">
          <div className="flex flex-col">
            {nav.map((item) => (
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
            {user ? (
              <>
                <Link
                  to="/overview"
                  onClick={() => setMenuOpen(false)}
                  className="mt-1 rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground"
                >
                  My money
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="mt-1 rounded-md px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                to="/auth"
                onClick={() => setMenuOpen(false)}
                className="mt-1 rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground"
              >
                Sign in
              </Link>
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
