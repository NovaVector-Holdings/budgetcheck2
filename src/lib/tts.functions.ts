import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getLesson } from "./lessons";

const Input = z.object({ lessonId: z.string().min(1) });

// Generate narration for a lesson via the Lovable AI Gateway TTS endpoint.
// Returns base64-encoded MP3 audio. Kept server-side so LOVABLE_API_KEY stays
// off the client.
export const generateLessonAudio = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const lesson = getLesson(data.lessonId);
    if (!lesson) throw new Error("Lesson not found");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input: lesson.script,
        voice: "sage",
        response_format: "mp3",
        instructions:
          "Warm, calm, and clear. Pace it like a trusted teacher explaining money to a friend — unhurried, never condescending.",
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 402) {
        throw new Error(
          "Audio credits are exhausted on this workspace. Please add credits in Settings → Plans & credits, then try again.",
        );
      }
      if (res.status === 429) {
        throw new Error("Too many requests right now. Please try again in a moment.");
      }
      throw new Error(`Audio generation failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const buf = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return { audioBase64: base64, mime: "audio/mpeg" };
  });
