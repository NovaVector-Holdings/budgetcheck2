import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getLesson } from "./lessons";

const Input = z.object({ lessonId: z.string().min(1).max(100) });

// Generate narration for a lesson via the Lovable AI Gateway TTS endpoint.
// Returns base64-encoded MP3 audio. Kept server-side so LOVABLE_API_KEY stays
// off the client.
//
// SECURITY (AI-governance finding, 2026-11-24): the Learn pages are PUBLIC, so
// this endpoint deliberately has no login requirement -- but it also spends
// paid AI credits on every call, and when credits run out (HTTP 402) chat and
// screenshot reading stop for EVERY user. The script text is fixed per lesson
// (a caller cannot choose what is spoken), so the abuse is only "call it again
// and again". Each lesson is therefore generated at most once per cache window:
// results are held in an in-flight/isolate map and in the edge cache, so a
// flood of requests costs the same as one. Upstream response bodies and
// operational details (credits, workspace settings) are never echoed to callers.

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;
const GENERIC_UNAVAILABLE = "Audio isn't available right now. Please try again later.";

const settled = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

type EdgeCache = {
  match(req: Request): Promise<Response | undefined>;
  put(req: Request, res: Response): Promise<void>;
};

/** The Workers edge cache when the runtime has one (undefined in dev/Node). */
function edgeCache(): EdgeCache | undefined {
  return (globalThis as { caches?: { default?: EdgeCache } }).caches?.default;
}

const cacheKey = (lessonId: string) =>
  new Request(`https://tts-cache.budgetchek.invalid/${encodeURIComponent(lessonId)}`);

async function synthesize(lessonId: string, script: string): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    console.error("[generateLessonAudio] LOVABLE_API_KEY is not configured.");
    throw new Error(GENERIC_UNAVAILABLE);
  }

  const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini-tts",
      input: script,
      voice: "sage",
      response_format: "mp3",
      instructions:
        "Warm, calm, and clear. Pace it like a trusted teacher explaining money to a friend — unhurried, never condescending.",
    }),
  });

  if (!res.ok) {
    // Status only: the body can echo request content, and 402/429 detail is operational.
    console.error(`[generateLessonAudio] gateway returned ${res.status} for lesson ${lessonId}`);
    throw new Error(
      res.status === 429
        ? "Too many requests right now. Please try again in a moment."
        : GENERIC_UNAVAILABLE,
    );
  }

  return Buffer.from(await res.arrayBuffer()).toString("base64");
}

/** The endpoint's whole behavior as a plain function, so it can be proven without a server. */
export async function getLessonAudio(
  lessonId: string,
): Promise<{ audioBase64: string; mime: string }> {
  const lesson = getLesson(lessonId);
  if (!lesson) throw new Error("Lesson not found");
  const id = lessonId;

  const done = settled.get(id);
  if (done) return { audioBase64: done, mime: "audio/mpeg" };

  const cache = edgeCache();
  const hit = await cache?.match(cacheKey(id)).catch(() => undefined);
  if (hit) {
    const cached = await hit.text();
    settled.set(id, cached);
    return { audioBase64: cached, mime: "audio/mpeg" };
  }

  let pending = inFlight.get(id);
  if (!pending) {
    pending = synthesize(id, lesson.script)
      .then(async (b64) => {
        settled.set(id, b64);
        await cache
          ?.put(
            cacheKey(id),
            new Response(b64, {
              headers: { "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}` },
            }),
          )
          .catch(() => undefined);
        return b64;
      })
      .finally(() => inFlight.delete(id));
    inFlight.set(id, pending);
  }
  return { audioBase64: await pending, mime: "audio/mpeg" };
}

export const generateLessonAudio = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => getLessonAudio(data.lessonId));
