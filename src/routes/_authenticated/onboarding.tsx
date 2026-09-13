import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Welcome — let's set you up — BudgetChek" },
      { name: "description", content: "Three quick steps to personalize your BudgetChek money tools." },
      { property: "og:title", content: "Welcome — let's set you up — BudgetChek" },
      { property: "og:description", content: "Three quick steps to personalize your BudgetChek money tools." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OnboardingPage,
});

const GOALS = [
  "Build an emergency fund",
  "Pay down debt",
  "Save for something big",
  "Stop living paycheck to paycheck",
  "Just understand where my money goes",
];

function OnboardingPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [income, setIncome] = useState("");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);

  async function finish() {
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: name.trim() || null,
        monthly_income: income ? Number(income) : null,
        money_goal: goal || null,
        onboarding_completed: true,
      })
      .eq("id", user.id);
    setBusy(false);
    if (error) {
      toast.error("Couldn't save. Try again.");
      return;
    }
    toast.success("You're all set!");
    navigate({ to: "/overview" });
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="paper-card p-8">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Welcome</p>
          <p className="text-xs text-muted-foreground">Step {step} of 3</p>
        </div>
        <div className="mt-3 h-1.5 w-full rounded-full bg-secondary">
          <div
            className="h-1.5 rounded-full bg-primary transition-all"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        {step === 1 && (
          <div className="mt-6">
            <h1 className="font-serif text-2xl text-ink">What should we call you?</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Just a first name or nickname is fine. It's only for you.
            </p>
            <div className="mt-5 space-y-1.5">
              <Label htmlFor="ob-name">Your name</Label>
              <Input
                id="ob-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex"
                autoFocus
              />
            </div>
            <Button className="mt-6 w-full" onClick={() => setStep(2)}>
              Continue
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="mt-6">
            <h1 className="font-serif text-2xl text-ink">
              Roughly how much comes in each month{name ? `, ${name}` : ""}?
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              A ballpark is perfect — take-home pay, side gigs, benefits. You can change it anytime.
            </p>
            <div className="mt-5 space-y-1.5">
              <Label htmlFor="ob-income">Monthly income (optional)</Label>
              <Input
                id="ob-income"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={income}
                onChange={(e) => setIncome(e.target.value)}
                placeholder="e.g. 2400"
              />
            </div>
            <div className="mt-6 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button className="flex-1" onClick={() => setStep(3)}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="mt-6">
            <h1 className="font-serif text-2xl text-ink">What's your top money goal right now?</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Pick one. This keeps your tools focused on what matters most to you.
            </p>
            <div className="mt-5 space-y-2" role="radiogroup" aria-label="Money goal">
              {GOALS.map((g) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={goal === g}
                  onClick={() => setGoal(g)}
                  className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                    goal === g
                      ? "border-primary bg-primary/10 text-ink font-medium"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-ink"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
            <div className="mt-6 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button className="flex-1" onClick={finish} disabled={busy || !goal}>
                {busy ? "Saving…" : "Start using BudgetChek"}
              </Button>
            </div>
          </div>
        )}
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Everything you enter is private to your account. Edit or delete it anytime in Settings.
      </p>
    </div>
  );
}
