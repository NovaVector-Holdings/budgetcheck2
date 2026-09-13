import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Reads a screenshot of a card or account summary and pulls out the four
// numbers that matter. Every field is nullable on purpose: a field that isn't
// legible in the image comes back null so the person is asked, never filled in
// with a plausible-looking guess.

const Input = z.object({
  /** Data URL of the screenshot, e.g. data:image/png;base64,... */
  imageDataUrl: z.string().startsWith("data:image/").max(9_000_000),
});

const SYSTEM = `You read one screenshot of a bank or credit-card screen and return JSON only.

Return exactly this shape:
{"accountName": string|null, "currentBalance": number|null, "creditLimit": number|null, "minimumPayment": number|null, "dueDate": "YYYY-MM-DD"|null, "confidence": "high"|"medium"|"low", "notes": string}

Rules:
- Read only what is visibly printed. If a value is cropped, blurred, ambiguous, or absent, return null for it. Never infer, never compute a missing value from the others, never guess a year.
- Amounts are plain numbers without currency symbols or thousands separators.
- A balance owed on a card is a positive number.
- If the year isn't shown next to a due date, return null for dueDate and say so in notes.
- notes is one short sentence naming anything you could not read.
- Output the JSON object and nothing else.`;

export const readBalanceScreenshot = createServerFn({ method: "POST" })
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
          {
            role: "user",
            content: [
              { type: "text", text: "Read this screen." },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 402) throw new Error("The workspace is out of AI credits. Add credits in Settings, then try again.");
      if (res.status === 429) throw new Error("Too many requests just now. Try again in a moment.");
      throw new Error(`Couldn't read that image (${res.status}): ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Couldn't find any readable numbers in that image.");

    const parsed = z
      .object({
        accountName: z.string().nullable().catch(null),
        currentBalance: z.number().nullable().catch(null),
        creditLimit: z.number().nullable().catch(null),
        minimumPayment: z.number().nullable().catch(null),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
        confidence: z.enum(["high", "medium", "low"]).catch("low"),
        notes: z.string().catch(""),
      })
      .parse(JSON.parse(match[0]));

    return parsed;
  });
