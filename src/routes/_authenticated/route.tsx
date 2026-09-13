import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Five everyday tools stay in reach; the rest live behind "More" so the
// page doesn't open with eleven choices.
const primaryNav = [
  { to: "/overview", label: "Overview" },
  { to: "/future-expenses", label: "Bills" },
  { to: "/savings", label: "Savings" },
  { to: "/debt", label: "Debt" },
  { to: "/analytics", label: "Reports" },
] as const;

const moreNav = [
  { to: "/calendar", label: "Calendar" },
  { to: "/money-meeting", label: "Money meeting" },
  { to: "/import", label: "Import spending" },
  { to: "/alerts", label: "Reminders" },
  { to: "/archives", label: "Archive" },
  { to: "/settings", label: "Settings" },
] as const;


export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/auth",
        search: { redirect: location.pathname },
      });
    }
    // Onboarding gate: finished onboarding required for all member pages
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", data.user.id)
      .maybeSingle();
    const done = profile?.onboarding_completed ?? false;
    if (!done && location.pathname !== "/onboarding") {
      throw redirect({ to: "/onboarding" });
    }
    if (done && location.pathname === "/onboarding") {
      throw redirect({ to: "/overview" });
    }
    return { user: data.user };
  },
  component: MemberLayout,
});

function MemberLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const inMore = moreNav.some((m) => pathname.startsWith(m.to));
  // null = follow the current page; true/false = the user opened or closed it.
  const [manual, setManual] = useState<boolean | null>(null);
  const showMore = manual ?? inMore;

  const pill =
    "whitespace-nowrap rounded-full border border-transparent px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-ink";

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
      <nav
        aria-label="Member tools"
        className="-mx-4 mb-3 flex gap-1 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {primaryNav.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={pill}
            activeProps={{ className: "bg-primary text-primary-foreground" }}
          >
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setManual(!showMore)}
          className={`${pill} ${showMore ? "bg-secondary text-ink" : ""}`}
          aria-expanded={showMore}
          aria-controls="more-tools"
        >
          More
        </button>
      </nav>

      {showMore && (
        <nav
          id="more-tools"
          aria-label="More tools"
          className="-mx-4 mb-8 flex gap-1 overflow-x-auto border-b border-border px-4 pb-3 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {moreNav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="whitespace-nowrap rounded-full px-3 py-1 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
              activeProps={{ className: "bg-secondary font-medium text-ink" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
      {!showMore && <div className="mb-8" />}
      <Outlet />
    </div>
  );

}
