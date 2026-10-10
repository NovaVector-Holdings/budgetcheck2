import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { fmt, today } from "@/lib/money";
import { formatDay } from "@/lib/decision-engine";
import { MM_KEYS } from "@/hooks/use-money-state";
import type { BalanceSource } from "@/lib/mm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Gate 2 remediation -- the Update control now lives WITH the calculation.
//
// The Round-1 survey showed a standalone "Current balance $640" card beside
// "Estimated remaining $335" made people ask what the two were supposed to
// mean together (CEO ruling, item 4). The balance is the first line of the
// calculation, so its Update control is on that line; there is no second
// $640 competing for attention.
//
// This replaces CashOnHandEditor for the Overview. It fixes two things the old
// editor did while it was a separate card:
//   - it invalidated query keys the money state doesn't read, so a saved
//     balance didn't refresh the briefing until a reload;
//   - it let people "update" profile.cash_on_hand even when spendable accounts
//     exist -- in which case the engine IGNORES that field (accounts win), so
//     the number on screen never changed. When accounts supply the balance this
//     control now says so and links to them instead of pretending to edit it.
// The buffer lives only on the profile, so it stays editable in both cases.

function useSaveBalance(userId: string, onSaved: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { balance: number | null; buffer: number }) => {
      const patch: TablesUpdate<"profiles"> = {
        spending_buffer: Math.max(0, Number.isFinite(v.buffer) ? v.buffer : 0),
        updated_at: new Date().toISOString(),
      };
      if (v.balance != null) {
        patch.cash_on_hand = v.balance;
        patch.balance_as_of = today();
      }
      const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Saved");
      // Wait for the refetch so the form closes onto the NEW figures, never
      // the old balance flashing back for a moment.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["profile", userId] }),
        ...MM_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k, userId] })),
        qc.invalidateQueries({ queryKey: ["settings", userId] }),
      ]);
      onSaved();
    },
    onError: () => toast.error("Could not save that. Try again."),
  });
}

interface FormProps {
  userId: string;
  /** Where the engine's balance comes from. "none" = first-time entry. */
  source: BalanceSource;
  /** profile.cash_on_hand, pre-filled when editing. */
  profileBalance: number | null;
  buffer: number;
  heading: string;
  autoFocus?: boolean;
  onDone: () => void;
  /** Cancel is only offered when there is something to go back to. */
  onCancel?: () => void;
}

export function BalanceForm({
  userId,
  source,
  profileBalance,
  buffer,
  heading,
  autoFocus,
  onDone,
  onCancel,
}: FormProps) {
  const [balance, setBalance] = useState(profileBalance != null ? String(profileBalance) : "");
  const [buf, setBuf] = useState(buffer ? String(buffer) : "");
  const first = useRef<HTMLInputElement>(null);
  const save = useSaveBalance(userId, onDone);
  const usesAccounts = source === "accounts";

  useEffect(() => {
    if (autoFocus) first.current?.focus();
  }, [autoFocus]);

  const canSave = usesAccounts || (balance.trim() !== "" && Number.isFinite(Number(balance)));

  return (
    <form
      className="space-y-4 rounded-lg border border-border bg-secondary/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave) return;
        save.mutate({ balance: usesAccounts ? null : Number(balance), buffer: Number(buf) || 0 });
      }}
    >
      <div>
        <h3 className="font-serif text-lg text-ink">{heading}</h3>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
          Manual entry only. No bank connection required.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {usesAccounts ? (
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-ink">Balance</p>
            <p className="text-sm text-muted-foreground">
              Your balance is the total of your everyday accounts.{" "}
              <Link
                to="/money-meeting"
                search={{ tab: "data" }}
                className="text-primary underline-offset-4 hover:underline"
              >
                Update your accounts →
              </Link>
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="coh-balance">What's in your spending account right now</Label>
            <Input
              id="coh-balance"
              ref={first}
              type="number"
              step="0.01"
              inputMode="decimal"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="e.g. 420.50"
            />
            <p className="text-xs text-muted-foreground">It's fine if it's negative (overdrawn).</p>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="coh-buffer">Buffer to keep aside (optional)</Label>
          <Input
            id="coh-buffer"
            ref={usesAccounts ? first : undefined}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={buf}
            onChange={(e) => setBuf(e.target.value)}
            placeholder="e.g. 100"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={save.isPending || !canSave}>
          {save.isPending ? "Saving…" : usesAccounts ? "Save buffer" : "Save"}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/** The calculation's first line: the balance, where it came from, and its
 *  Update control -- swapped in place for the form when editing. */
export function BalanceLine({
  userId,
  source,
  balance,
  asOf,
  profileBalance,
  buffer,
}: {
  userId: string;
  source: Exclude<BalanceSource, "none">;
  balance: number;
  asOf: string | null;
  profileBalance: number | null;
  buffer: number;
}) {
  const [editing, setEditing] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  // Return focus to the control that opened the form once it closes.
  useEffect(() => {
    if (wasEditing.current && !editing) trigger.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  if (editing) {
    return (
      <div className="py-2.5">
        <BalanceForm
          userId={userId}
          source={source}
          profileBalance={profileBalance}
          buffer={buffer}
          heading="Update your balance"
          autoFocus
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="border-b border-border/70 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted-foreground">Balance</span>
        <span className="text-sm text-ink">{fmt(balance).replace("-", "−")}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {source === "accounts" ? "From your accounts" : "Entered by you"}
          {asOf ? ` · as of ${formatDay(asOf)}` : ""}
        </span>
        <Button
          ref={trigger}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setEditing(true)}
          aria-label="Update your balance"
        >
          Update
        </Button>
      </div>
    </div>
  );
}
