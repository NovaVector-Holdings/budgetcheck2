import { Link } from "@tanstack/react-router";
import { ArrowRight, Lightbulb } from "lucide-react";
import type { Lesson } from "@/lib/lessons";

/**
 * "One thing worth understanding this week" -- a single deterministic Learn
 * Money suggestion at the close of a check-in/review. See
 * src/lib/learn-recommend.ts for the matching rule. Never more than one.
 */
export function LearnRecommendation({ lesson, because }: { lesson: Lesson; because: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/40 p-4">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
      <div className="min-w-0">
        <p className="eyebrow">One thing worth understanding this week</p>
        <p className="mt-1 text-sm text-ink">{because}</p>
        <Link
          to="/learn"
          hash={lesson.id}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Listen: {lesson.title} ({lesson.minutes} min)
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
