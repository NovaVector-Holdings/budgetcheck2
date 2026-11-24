// Deterministic proof of the public TTS endpoint's denial-of-wallet bound (AI-governance finding,
// 2026-11-24): N requests for a lesson cost ONE upstream call, and upstream bodies never reach callers.
// Run with: npm run validate:tts-bound
// Proves the TTS endpoint's denial-of-wallet bound: N concurrent + repeated calls = ONE upstream call,
// and upstream bodies/operational details never reach the caller.
import { lessons as LESSONS } from "../src/lib/lessons";
process.env.LOVABLE_API_KEY = "test-key";
let upstream = 0;
let mode: "ok" | "402" = "ok";
globalThis.fetch = (async () => {
  upstream++;
  await new Promise((r) => setTimeout(r, 20));
  if (mode === "402")
    return new Response("SECRET-UPSTREAM-BODY credits exhausted workspace xyz", { status: 402 });
  return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
}) as typeof fetch;
(async () => {
  const { getLessonAudio } = await import("../src/lib/tts.functions");
  const id = LESSONS[0].id;
  const call = (lessonId: string) => getLessonAudio(lessonId);
  let pass = 0,
    fail = 0;
  const rec = (n: string, ok: boolean, d = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : " -- " + d}`);
    if (ok) pass++;
    else fail++;
  };
  const burst = await Promise.all(Array.from({ length: 50 }, () => call(id)));
  rec(
    "50 concurrent calls for one lesson -> exactly 1 upstream request",
    upstream === 1,
    `upstream=${upstream}`,
  );
  rec(
    "every caller gets the same audio",
    burst.every((b) => b.audioBase64 === burst[0].audioBase64 && b.mime === "audio/mpeg"),
  );
  await Promise.all(Array.from({ length: 50 }, () => call(id)));
  rec(
    "50 MORE calls later -> still 1 upstream request (served from cache)",
    upstream === 1,
    `upstream=${upstream}`,
  );
  rec(
    "unknown lesson is rejected without any upstream call",
    (await call("nope").then(
      () => false,
      (e: Error) => /Lesson not found/.test(e.message),
    )) && upstream === 1,
  );
  mode = "402";
  const other = LESSONS[1].id;
  const err = await call(other).then(
    () => null,
    (e: Error) => e.message,
  );
  rec(
    "upstream 402 -> caller sees a generic message, never the body or credit/workspace detail",
    !!err && !/SECRET|credit|workspace|402/i.test(err),
    String(err),
  );
  console.log(`\n${pass}/${pass + fail} tts proof cases passed`);
  process.exit(fail ? 1 : 0);
})();
