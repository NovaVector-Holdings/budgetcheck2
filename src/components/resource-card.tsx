import { ArrowUpRight, ShieldCheck } from "lucide-react";
import type { Resource } from "@/lib/resources";

export function ResourceCard({ r }: { r: Resource }) {
  return (
    <a
      href={r.url}
      target="_blank"
      rel="noopener noreferrer"
      className="paper-card group flex flex-col gap-3 p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="eyebrow">{r.format} · Free</span>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
      <h3 className="font-serif text-xl leading-snug text-ink">{r.title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{r.why}</p>
      <div className="mt-auto flex items-center gap-1.5 pt-2 text-xs text-primary">
        <ShieldCheck className="h-3.5 w-3.5" />
        <span className="font-medium">{r.source}</span>
      </div>
    </a>
  );
}
