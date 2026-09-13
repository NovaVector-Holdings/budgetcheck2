import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { askMoneyMeeting } from "@/lib/mm-chat.functions";
import type { EngineSnapshot } from "@/lib/decision-engine";
import type { MmMessage, MmSession } from "@/lib/mm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Plus, Send } from "lucide-react";

interface Props {
  userId: string;
  snapshot: EngineSnapshot;
  /** Everything the assistant is allowed to reason over, already computed. */
  context: Record<string, unknown>;
}

const OPENERS = [
  "Am I okay until my next payday?",
  "What should I pay first this week?",
  "Should I pay off a debt now or wait?",
  "Where is my money actually going?",
];

export function Assistant({ userId, snapshot, context }: Props) {
  const qc = useQueryClient();
  const ask = useServerFn(askMoneyMeeting);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const { data: sessions = [] } = useQuery({
    queryKey: ["mm_sessions", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mm_sessions")
        .select("*")
        .eq("archived", false)
        .order("updated_at", { ascending: false });
      return (data ?? []) as unknown as MmSession[];
    },
  });

  const active = sessionId ?? sessions[0]?.id ?? null;

  const { data: messages = [] } = useQuery({
    queryKey: ["mm_messages", active],
    enabled: !!active,
    queryFn: async () => {
      const { data } = await supabase
        .from("mm_messages")
        .select("*")
        .eq("session_id", active!)
        .order("created_at");
      return (data ?? []) as unknown as MmMessage[];
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  async function ensureSession(firstLine: string): Promise<string> {
    if (active) return active;
    const { data, error } = await supabase
      .from("mm_sessions")
      .insert({ user_id: userId, title: firstLine.slice(0, 60) })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("Couldn't start a session");
    setSessionId(data.id);
    qc.invalidateQueries({ queryKey: ["mm_sessions", userId] });
    return data.id;
  }

  const send = useMutation({
    mutationFn: async (text: string) => {
      const sid = await ensureSession(text);
      await supabase.from("mm_messages").insert({ session_id: sid, user_id: userId, role: "user", content: text });
      qc.invalidateQueries({ queryKey: ["mm_messages", sid] });

      const history = [...messages.map((m) => ({ role: m.role, content: m.content })), { role: "user" as const, content: text }];
      const { reply } = await ask({
        data: { messages: history.slice(-20), snapshot: JSON.stringify({ snapshot, ...context }) },
      });

      await supabase.from("mm_messages").insert({ session_id: sid, user_id: userId, role: "assistant", content: reply });
      await supabase.from("mm_sessions").update({ updated_at: new Date().toISOString() }).eq("id", sid);
      return sid;
    },
    onSuccess: (sid) => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["mm_messages", sid] });
      qc.invalidateQueries({ queryKey: ["mm_sessions", userId] });
    },
    onError: (e: Error) => toast.error(e.message || "The assistant couldn't answer just now."),
  });

  function submit(text: string) {
    const t = text.trim();
    if (!t || send.isPending) return;
    send.mutate(t);
  }

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[220px_1fr]">
      <aside className="print:hidden">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setSessionId(null)}
          disabled={!active}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          New conversation
        </Button>
        {sessions.length > 0 && (
          <ul className="mt-3 space-y-1">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSessionId(s.id)}
                  className={`w-full truncate rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    s.id === active ? "bg-secondary text-ink" : "text-muted-foreground hover:text-ink"
                  }`}
                >
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Conversations are saved to your account, so you can leave and pick this back up.
        </p>
      </aside>

      <div className="paper-card flex min-h-[26rem] flex-col p-5">
        <div className="flex-1 space-y-4">
          {!messages.length && (
            <div>
              <p className="font-serif text-lg text-ink">What's on your mind?</p>
              <p className="mt-1 text-sm text-muted-foreground">{snapshot.headline}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {OPENERS.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => submit(o)}
                    className="rounded-full border border-border px-3 py-1.5 text-sm text-ink transition-colors hover:bg-secondary"
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
              <div
                className={`max-w-[42rem] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm ${
                  m.role === "user" ? "bg-primary text-primary-foreground" : "border border-border bg-background text-ink"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {send.isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
              Working through your dates and amounts…
            </p>
          )}
          <div ref={endRef} />
        </div>

        <div className="mt-4 print:hidden">
          <Textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(draft);
              }
            }}
            placeholder="Ask about a bill, a payoff, a date, or a decision you're weighing…"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Answers use only the numbers you entered. Educational, not financial advice.
            </p>
            <Button size="sm" onClick={() => submit(draft)} disabled={send.isPending || !draft.trim()}>
              <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Ask
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
