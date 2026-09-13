import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const validateSearch = (search: Record<string, unknown>) => ({
  redirect: typeof search.redirect === "string" ? search.redirect : undefined,
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch,
  head: () => ({
    meta: [
      { title: "Sign in or create your account — BudgetChek" },
      { name: "description", content: "Create a free BudgetChek account to track savings, plan debt payoff, and build money confidence." },
      { property: "og:title", content: "Sign in or create your account — BudgetChek" },
      { property: "og:description", content: "Create a free BudgetChek account to track savings, plan debt payoff, and build money confidence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  const safeRedirect = redirect && redirect.startsWith("/") ? redirect : "/overview";

  async function handleDemo() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: "demo@budgetchek.app",
        password: "BudgetChek-Demo-2026!",
      });
      if (error) throw error;
      navigate({ to: "/overview" });
    } catch {
      toast.error("The demo account isn't available right now. Try creating a free account instead.");
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    try {
      if (safeRedirect !== "/overview") sessionStorage.setItem("bc_redirect", safeRedirect);
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("Google sign-in didn't work. Try email instead.");
        setBusy(false);
      }
      // redirected: browser navigates away; otherwise session is set
      if (!result.redirected) navigate({ to: safeRedirect });
    } catch {
      toast.error("Google sign-in didn't work. Try email instead.");
      setBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Check your email for a reset link.");
        setMode("signin");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setCheckEmail(true);
        } else {
          navigate({ to: safeRedirect });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: safeRedirect });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (checkEmail) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <div className="paper-card p-8">
          <h1 className="font-serif text-2xl text-ink">Check your email</h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            We sent a confirmation link to <strong className="text-ink">{email}</strong>.
            Click it to finish creating your account, then come back to sign in.
          </p>
          <Button className="mt-6" variant="outline" onClick={() => setCheckEmail(false)}>
            Back to sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <div className="paper-card p-8">
        <p className="eyebrow">Members</p>
        <h1 className="mt-2 font-serif text-3xl text-ink">
          {mode === "forgot" ? "Reset your password" : mode === "signup" ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "forgot"
            ? "Enter your email and we'll send a reset link."
            : "Free forever. Your numbers stay private to you."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          {mode !== "forgot" && (
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "One moment…" : mode === "forgot" ? "Send reset link" : mode === "signup" ? "Create account" : "Sign in"}
          </Button>
        </form>

        {mode !== "forgot" && (
          <>
            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={handleGoogle} disabled={busy}>
              Continue with Google
            </Button>
            <Button type="button" variant="secondary" className="mt-2 w-full" onClick={handleDemo} disabled={busy}>
              Just looking? Explore the demo account
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              A shared sample account pre-filled with example data — no sign-up needed.
            </p>
          </>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-sm">
          {mode === "signin" && (
            <>
              <button type="button" className="text-primary hover:underline" onClick={() => setMode("signup")}>
                New here? Create an account
              </button>
              <button type="button" className="text-muted-foreground hover:underline" onClick={() => setMode("forgot")}>
                Forgot password?
              </button>
            </>
          )}
          {mode === "signup" && (
            <button type="button" className="text-primary hover:underline" onClick={() => setMode("signin")}>
              Already have an account? Sign in
            </button>
          )}
          {mode === "forgot" && (
            <button type="button" className="text-primary hover:underline" onClick={() => setMode("signin")}>
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
