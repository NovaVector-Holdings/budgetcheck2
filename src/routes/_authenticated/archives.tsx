import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmt, type Debt, type MoneyMeeting, type PlannedExpense, type SavingsGoal } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/archives")({
  head: () => ({
    meta: [
      { title: "Archive — BudgetChek" },
      { name: "description", content: "Archived goals, debts, expenses, and meetings. Restore them anytime." },
      { property: "og:title", content: "Archives — BudgetChek" },
      { property: "og:description", content: "Archived goals, debts, expenses, and meetings. Restore them anytime." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ArchivesPage,
});

const TABLES = [
  { key: "savings_goals", label: "Savings goals" },
  { key: "debts", label: "Debts" },
  { key: "planned_expenses", label: "Planned expenses" },
  { key: "money_meetings", label: "Money meetings" },
] as const;

type TableKey = (typeof TABLES)[number]["key"];

function ArchivesPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["archives", user.id],
    queryFn: async () => {
      const [goals, debts, expenses, meetings] = await Promise.all([
        supabase.from("savings_goals").select("*").eq("archived", true),
        supabase.from("debts").select("*").eq("archived", true),
        supabase.from("planned_expenses").select("*").eq("archived", true),
        supabase.from("money_meetings").select("*").eq("archived", true),
      ]);
      return {
        savings_goals: (goals.data ?? []) as SavingsGoal[],
        debts: (debts.data ?? []) as Debt[],
        planned_expenses: (expenses.data ?? []) as PlannedExpense[],
        money_meetings: (meetings.data ?? []) as unknown as MoneyMeeting[],
      };
    },
  });

  const restore = useMutation({
    mutationFn: async ({ table, id }: { table: TableKey; id: string }) => {
      const { error } = await supabase.from(table).update({ archived: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Restored.");
      qc.invalidateQueries({ queryKey: ["archives", user.id] });
    },
    onError: () => toast.error("Couldn't restore."),
  });

  const totalArchived = TABLES.reduce((s, t) => s + (data?.[t.key].length ?? 0), 0);

  return (
    <div>
      <p className="eyebrow">Archive</p>
      <h1 className="mt-2 font-serif text-3xl text-ink">Out of sight, not gone</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Finished goals, paid-off debts, old expenses — restore any of them with one tap.
      </p>

      {totalArchived === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Nothing archived yet. When you archive items from the other tools, they'll wait for you here.</p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {TABLES.map((t) => {
            const items = data?.[t.key] ?? [];
            if (!items.length) return null;
            return (
              <section key={t.key} className="paper-card p-6">
                <h2 className="font-serif text-lg text-ink">{t.label}</h2>
                <ul className="mt-3 space-y-2">
                  {items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-ink">
                        {"name" in item ? item.name : `Meeting on ${(item as MoneyMeeting).held_on}`}
                        {"balance" in item && <span className="ml-2 text-muted-foreground">{fmt((item as Debt).balance)}</span>}
                        {"amount" in item && <span className="ml-2 text-muted-foreground">{fmt((item as PlannedExpense).amount)}</span>}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => restore.mutate({ table: t.key, id: item.id })}>
                        Restore
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
