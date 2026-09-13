import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const memberNav = [
  { to: "/overview", label: "Overview" },
  { to: "/savings", label: "Savings" },
  { to: "/debt", label: "Debt Strategy" },
  { to: "/future-expenses", label: "Future Expenses" },
  { to: "/calendar", label: "Calendar" },
  { to: "/money-meeting", label: "Money Meeting" },
  { to: "/analytics", label: "Analytics" },
  { to: "/import", label: "Import & Analyze" },
  { to: "/alerts", label: "Alerts" },
  { to: "/archives", label: "Archives" },
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
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
      <nav
        aria-label="Member tools"
        className="-mx-4 mb-8 flex gap-1 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {memberNav.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="whitespace-nowrap rounded-full border border-transparent px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
            activeProps={{ className: "bg-primary text-primary-foreground" }}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
