import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmt, today, type MoneyMeeting, type PlannedExpense } from "@/lib/money";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Money calendar — BudgetChek" },
      { name: "description", content: "See your planned expenses and money meetings on a monthly calendar." },
      { property: "og:title", content: "Money calendar — BudgetChek" },
      { property: "og:description", content: "See your planned expenses and money meetings on a monthly calendar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalendarPage,
});

function expandRecurring(e: PlannedExpense, monthStart: Date, monthEnd: Date): string[] {
  const dates: string[] = [];
  const due = new Date(e.due_date + "T00:00:00");
  if (e.recurring === "none") {
    if (due >= monthStart && due <= monthEnd) dates.push(e.due_date);
    return dates;
  }
  const d = new Date(due);
  while (d < monthStart) {
    if (e.recurring === "weekly") d.setDate(d.getDate() + 7);
    else if (e.recurring === "monthly") d.setMonth(d.getMonth() + 1);
    else d.setFullYear(d.getFullYear() + 1);
  }
  while (d <= monthEnd) {
    dates.push(d.toISOString().slice(0, 10));
    if (e.recurring === "weekly") d.setDate(d.getDate() + 7);
    else if (e.recurring === "monthly") d.setMonth(d.getMonth() + 1);
    else d.setFullYear(d.getFullYear() + 1);
    if (dates.length > 60) break;
  }
  return dates;
}

function CalendarPage() {
  const { user } = Route.useRouteContext();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const { data } = useQuery({
    queryKey: ["calendar", user.id],
    queryFn: async () => {
      const [expenses, meetings] = await Promise.all([
        supabase.from("planned_expenses").select("*").eq("archived", false),
        supabase.from("money_meetings").select("*").eq("archived", false),
      ]);
      return {
        expenses: (expenses.data ?? []) as PlannedExpense[],
        meetings: (meetings.data ?? []) as unknown as MoneyMeeting[],
      };
    },
  });

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const firstWeekday = monthStart.getDay();
  const daysInMonth = monthEnd.getDate();
  const t = today();

  const eventsByDate = new Map<string, { label: string; kind: "expense" | "meeting"; amount?: number }[]>();
  const add = (date: string, ev: { label: string; kind: "expense" | "meeting"; amount?: number }) => {
    const list = eventsByDate.get(date) ?? [];
    list.push(ev);
    eventsByDate.set(date, list);
  };
  for (const e of data?.expenses ?? []) {
    for (const d of expandRecurring(e, monthStart, monthEnd)) add(d, { label: e.name, kind: "expense", amount: Number(e.amount) });
  }
  for (const m of data?.meetings ?? []) {
    const d = new Date(m.held_on + "T00:00:00");
    if (d >= monthStart && d <= monthEnd) add(m.held_on, { label: "Money meeting", kind: "meeting" });
  }

  const prev = () => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); };
  const next = () => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); };
  const monthName = monthStart.toLocaleString("en-US", { month: "long", year: "numeric" });

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Calendar</p>
          <h1 className="mt-2 font-serif text-3xl text-ink">{monthName}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={prev} aria-label="Previous month">←</Button>
          <Button variant="outline" size="sm" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }}>Today</Button>
          <Button variant="outline" size="sm" onClick={next} aria-label="Next month">→</Button>
        </div>
      </div>

      <div className="paper-card mt-6 overflow-hidden p-2 sm:p-4">
        <div className="grid grid-cols-7 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={`blank-${i}`} className="min-h-16 sm:min-h-24" />;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const events = eventsByDate.get(dateStr) ?? [];
            const isToday = dateStr === t;
            return (
              <div key={dateStr} className={`min-h-16 rounded-md border p-1.5 sm:min-h-24 sm:p-2 ${isToday ? "border-primary bg-primary/5" : "border-border/60"}`}>
                <span className={`text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>{day}</span>
                <div className="mt-1 space-y-1">
                  {events.slice(0, 3).map((ev, j) => (
                    <p key={j} className={`truncate rounded px-1 py-0.5 text-[10px] sm:text-xs ${ev.kind === "expense" ? "bg-secondary text-ink" : "bg-primary/15 text-primary"}`}>
                      {ev.label}{ev.amount != null ? ` · ${fmt(ev.amount)}` : ""}
                    </p>
                  ))}
                  {events.length > 3 && <p className="text-[10px] text-muted-foreground">+{events.length - 3} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-secondary" /> Expense due</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-primary/15" /> Money meeting</span>
      </div>
    </div>
  );
}
