import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_MEETING_CHECKLIST, type MeetingChecklistItem, type MoneyMeeting } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/money-meeting")({
  head: () => ({
    meta: [
      { title: "Money meeting — BudgetChek" },
      { name: "description", content: "A short, guided weekly check-in with your money." },
      { property: "og:title", content: "Money meeting — BudgetChek" },
      { property: "og:description", content: "A short, guided weekly check-in with your money." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MoneyMeetingPage,
});

function MoneyMeetingPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [active, setActive] = useState(false);
  const [checklist, setChecklist] = useState<MeetingChecklistItem[]>(DEFAULT_MEETING_CHECKLIST);
  const [notes, setNotes] = useState("");

  const { data: meetings = [] } = useQuery({
    queryKey: ["meetings", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("money_meetings")
        .select("*")
        .eq("archived", false)
        .order("held_on", { ascending: false });
      return (data ?? []) as MoneyMeeting[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("money_meetings").insert({
        user_id: user.id,
        checklist,
        notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Meeting saved. See you next week.");
      setActive(false);
      setChecklist(DEFAULT_MEETING_CHECKLIST.map((c) => ({ ...c })));
      setNotes("");
      qc.invalidateQueries({ queryKey: ["meetings", user.id] });
    },
    onError: () => toast.error("Couldn't save the meeting."),
  });

  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div>
      <p className="eyebrow">Money Meeting</p>
      <h1 className="mt-2 font-serif text-3xl text-ink">Ten minutes with your money</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        A money meeting is a short weekly check-in — alone, with a partner, or with a friend.
        Same time each week works best. Run through the checklist, jot a note, done.
      </p>

      {!active ? (
        <div className="paper-card mt-6 p-6 text-center">
          <Button size="lg" onClick={() => setActive(true)}>Start this week's meeting</Button>
        </div>
      ) : (
        <div className="paper-card mt-6 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg text-ink">This meeting</h2>
            <span className="text-sm text-muted-foreground">{doneCount} of {checklist.length} done</span>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-secondary">
            <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${(doneCount / checklist.length) * 100}%` }} />
          </div>
          <ul className="mt-4 space-y-2">
            {checklist.map((item, i) => (
              <li key={i}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-secondary/50">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => setChecklist((prev) => prev.map((c, j) => (j === i ? { ...c, done: !c.done } : c)))}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className={`text-sm ${item.done ? "text-muted-foreground line-through" : "text-ink"}`}>{item.label}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-1.5">
            <Label htmlFor="mm-notes">Notes (optional)</Label>
            <Textarea id="mm-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Wins, worries, things to check next week…" rows={3} />
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Save meeting</Button>
            <Button variant="outline" onClick={() => setActive(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {meetings.length > 0 && (
        <section className="mt-8">
          <h2 className="font-serif text-lg text-ink">Past meetings</h2>
          <ul className="mt-3 space-y-3">
            {meetings.slice(0, 8).map((m) => {
              const done = (m.checklist ?? []).filter((c) => c.done).length;
              return (
                <li key={m.id} className="paper-card p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink">{m.held_on}</span>
                    <span className="text-xs text-muted-foreground">{done}/{(m.checklist ?? []).length} done</span>
                  </div>
                  {m.notes && <p className="mt-2 text-sm text-muted-foreground">{m.notes}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
