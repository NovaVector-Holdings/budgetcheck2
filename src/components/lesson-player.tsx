import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Loader2, Play, Pause, ExternalLink, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { generateLessonAudio } from "@/lib/tts.functions";
import type { Lesson } from "@/lib/lessons";

export function LessonPlayer({ lesson }: { lesson: Lesson }) {
  const ttsFn = useServerFn(generateLessonAudio);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const mut = useMutation({
    mutationFn: () => ttsFn({ data: { lessonId: lesson.id } }),
    onSuccess: (res) => {
      const url = `data:${res.mime};base64,${res.audioBase64}`;
      setSrc(url);
    },
  });

  useEffect(() => {
    if (!src || !audioRef.current) return;
    audioRef.current
      .play()
      .then(() => setPlaying(true))
      .catch(() => {});
  }, [src]);

  const toggle = () => {
    if (!src) {
      mut.mutate();
      return;
    }
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play();
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  return (
    <article id={lesson.id} className="paper-card flex flex-col gap-5 p-6 scroll-mt-28">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="eyebrow">{lesson.minutes} min · Audio lesson</span>
          <h3 className="mt-2 font-serif text-2xl text-ink">{lesson.title}</h3>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={mut.isPending}
          aria-label={playing ? "Pause lesson" : "Play lesson"}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 disabled:opacity-60"
        >
          {mut.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : playing ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="ml-0.5 h-5 w-5" />
          )}
        </button>
      </div>

      <ul className="space-y-2 text-sm text-foreground">
        {lesson.takeaways.map((t) => (
          <li key={t} className="flex gap-2">
            <span
              aria-hidden
              className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gold"
            />
            <span>{t}</span>
          </li>
        ))}
      </ul>

      {mut.isError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {(mut.error as Error)?.message ?? "Could not generate audio."}
        </p>
      )}

      {src && (
        <audio
          ref={audioRef}
          src={src}
          controls
          className="w-full"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <a
          href={lesson.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Source: {lesson.source}
        </a>
        <Link
          to="/money-meeting"
          search={{ tab: lesson.applyTo.tab }}
          className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-accent"
        >
          {lesson.applyTo.label}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </article>
  );
}
