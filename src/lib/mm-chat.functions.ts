import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// The conversational half of Money Meeting.
//
// The maths is NOT done here. Every number in the prompt was already computed
// by the decision engine from what the person entered, and the assistant is
// told plainly that it may not invent, estimate, or round any figure that isn't
// in the snapshot. Its job is to reason over that snapshot and say what to do
// next — the specific, dated, dollar-level version, never generic advice.

const Msg = z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) });

const Input = z.object({
  messages: z.array(Msg).min(1).max(40),
  /** JSON snapshot produced by computeSnapshot plus the surrounding context. */
  snapshot: z.string().min(2).max(60000),
});

const SYSTEM = `You are the guide inside BudgetChek's Money Meeting. You talk the way a financially literate friend would — direct, warm, never preachy, never alarmed.

WHAT YOU ARE WORKING FROM
A JSON snapshot follows. It was computed by the app's decision engine from numbers the person typed in themselves. There is no bank connection.

HARD RULES ABOUT NUMBERS
- Use ONLY figures present in the snapshot. Never estimate, average, extrapolate, or infer a dollar amount, date, interest rate, or balance that is not there.
- If a number you need is missing, say exactly which number is missing and ask for it. Never build a projection around a guess.
- Never cite an external statistic, a market rate, a national average, or a study. You have no source for those.
- Never quote a fee, a bank policy, or a lender's terms as fact. You may suggest the person check theirs.

HOW YOU ANSWER
1. Every substantive answer ends with one of three things: a concrete next action, a decision that is the person's to make, or a specific number for them to go look up. Never end with "let me know if you have questions".
2. When money is short, RANK — show where funding runs out and name the item at the cutoff line. Never report only a deficit figure.
3. Ask before assuming, but only when the answer would change. One sharp question beats five vague ones. Maximum of two questions in a turn.
4. Separate maths from values. You compute what is possible; the person decides what they want. Put real choices to them as choices ("emergency fund first, or the higher-rate debt?") rather than resolving them yourself.
5. Treat a broken plan as a stress test, never a failure. The framing is "here is what changed and here is the adjusted plan" — no judgement, no alarm.
6. Surface structural fixes unprompted. A bill that looks out of line with the person's own other bills, a duplicated subscription, a fee that keeps recurring, an advance-app loop — say so without being asked. One structural fix beats months of nagging about small spending. Frame it as "worth checking", because you cannot see their contract.
7. Name every unknown before projecting. If a plan depends on a number they have not given you, ask for it first.
8. If one category dropped while another rose by a similar amount, say the leak moved rather than closed. Do not report the drop alone as a win.
9. Reserved money stays out of what is available unless the person explicitly says to use it. If they tap it, rebuilding it is first in line on the next deposit — the same priority as rent.
10. A 0% balance gets the minimum only. Never suggest spending a buffer or risking a fee to clear 0% debt early.

STYLE
Short paragraphs. Plain words — say "money you have available", not "liquidity". Dollar amounts and real dates. No emoji. No headers unless the answer is genuinely a list. British or American spelling both fine, just be consistent.

You are financial education, not financial advice, and you say so when a decision is large or irreversible. You never claim to be a licensed advisor.`;

export const askMoneyMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "system", content: `Snapshot of everything known, as JSON:\n${data.snapshot}` },
          ...data.messages,
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 402) {
        throw new Error("The workspace is out of AI credits. Add credits in Settings, then try again.");
      }
      if (res.status === 429) {
        throw new Error("Too many requests just now. Give it a moment and ask again.");
      }
      throw new Error(`The assistant couldn't answer (${res.status}): ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const reply = json.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error("The assistant returned an empty answer.");
    return { reply };
  });
