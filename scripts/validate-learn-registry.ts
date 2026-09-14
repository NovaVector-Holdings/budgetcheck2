// Governance validator for Learn Money content.
//
// Run via `npm run validate:learn-registry` (also wired as a `prebuild`
// hook, so `npm run build` runs this automatically -- see package.json).
// Exits non-zero on any drift between src/lib/learn-registry.ts and the
// actual shipped content in src/lib/lessons.ts / src/lib/resources.ts, so
// the registry GOVERNS the content instead of merely describing it.
//
// Deliberately local and deterministic: no network requests. This checks
// internal consistency (registry vs. shipped code), not whether a URL is
// currently live -- that's the separate, human-in-the-loop link-health
// audit, not something a build step should block on.

import { lessons } from "../src/lib/lessons";
import { learnResources, readResources, earnResources, helpResources } from "../src/lib/resources";
import { learnRegistry, type LearnCategory, type ReviewStatus } from "../src/lib/learn-registry";

type ShippedSource = { sourceOrg: string; sourceUrl: string };

type Shipped = {
  contentId: string;
  category: LearnCategory;
  sourceOrg: string;
  sourceUrl: string;
  additionalSources: ShippedSource[];
};

const shipped: Shipped[] = [
  ...lessons.map((l) => ({
    contentId: l.id,
    category: "listen" as const,
    sourceOrg: l.source,
    sourceUrl: l.sourceUrl,
    additionalSources: (l.additionalSources ?? []).map((s) => ({
      sourceOrg: s.source,
      sourceUrl: s.sourceUrl,
    })),
  })),
  ...learnResources.map((r) => ({
    contentId: r.title,
    category: "listen" as const,
    sourceOrg: r.source,
    sourceUrl: r.url,
    additionalSources: [] as ShippedSource[],
  })),
  ...readResources.map((r) => ({
    contentId: r.title,
    category: "read" as const,
    sourceOrg: r.source,
    sourceUrl: r.url,
    additionalSources: [] as ShippedSource[],
  })),
  ...earnResources.map((r) => ({
    contentId: r.title,
    category: "earn" as const,
    sourceOrg: r.source,
    sourceUrl: r.url,
    additionalSources: [] as ShippedSource[],
  })),
  ...helpResources.map((r) => ({
    contentId: r.title,
    category: "help" as const,
    sourceOrg: r.source,
    sourceUrl: r.url,
    additionalSources: [] as ShippedSource[],
  })),
];

const errors: string[] = [];
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const VALID_STATUSES: ReviewStatus[] = ["active", "needs_review", "retired"];

/** Real calendar-date check, not just "does `new Date()` fail to throw" --
 *  JS's Date normalizes overflow (e.g. 2026-02-31 silently becomes
 *  2026-03-03), so a naive `!isNaN(new Date(x))` check would pass invalid
 *  dates. This round-trips the parsed y/m/d back through Date.UTC and
 *  requires an exact match, which correctly rejects invalid days-in-month
 *  (including non-leap-year Feb 29) without needing a date library. */
function isRealCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  return (
    asUtc.getUTCFullYear() === year &&
    asUtc.getUTCMonth() === month - 1 &&
    asUtc.getUTCDate() === day
  );
}

// 1. Every shipped item has exactly one registry entry -- no orphaned
//    content the registry never learned about.
for (const item of shipped) {
  const matches = learnRegistry.filter((e) => e.contentId === item.contentId);
  if (matches.length === 0) {
    errors.push(`Missing registry entry for shipped ${item.category} content "${item.contentId}".`);
  } else if (matches.length > 1) {
    errors.push(
      `Shipped content "${item.contentId}" has ${matches.length} registry entries (expected exactly 1).`,
    );
  }
}

// 2. No duplicate content IDs in the registry itself -- catches dupes even
//    for content that isn't currently shipping.
const idCounts = new Map<string, number>();
for (const e of learnRegistry) idCounts.set(e.contentId, (idCounts.get(e.contentId) ?? 0) + 1);
for (const [id, count] of idCounts) {
  if (count > 1)
    errors.push(`Registry has ${count} entries for contentId "${id}" (expected exactly 1).`);
}

// 3-5. Org, URL, category, and additional sources must match the live
//      record EXACTLY for every entry that's still shipping, and retired
//      entries must not ship.
for (const item of shipped) {
  const entry = learnRegistry.find((e) => e.contentId === item.contentId);
  if (!entry) continue; // already reported above

  if (entry.status === "retired") {
    errors.push(
      `"${item.contentId}" is marked retired in the registry but is still present in the shipped content -- retired content must not silently continue shipping.`,
    );
  }
  if (entry.category !== item.category) {
    errors.push(
      `"${item.contentId}": registry category "${entry.category}" does not match its actual Learn surface "${item.category}".`,
    );
  }
  if (entry.sourceOrg !== item.sourceOrg) {
    errors.push(
      `"${item.contentId}": registry sourceOrg "${entry.sourceOrg}" does not match the live source "${item.sourceOrg}".`,
    );
  }
  if (entry.sourceUrl !== item.sourceUrl) {
    errors.push(
      `"${item.contentId}": registry sourceUrl "${entry.sourceUrl}" does not match the live sourceUrl "${item.sourceUrl}".`,
    );
  }

  // Additional sources: same count, and every one matched by sourceUrl in
  // both directions (order-independent -- what matters is that neither
  // side has a secondary source the other doesn't know about, and that
  // matched pairs agree on org).
  const registryAdditional = entry.additionalSources ?? [];
  const shippedAdditional = item.additionalSources;
  if (registryAdditional.length !== shippedAdditional.length) {
    errors.push(
      `"${item.contentId}": additionalSources count mismatch -- shipped has ${shippedAdditional.length}, registry has ${registryAdditional.length}.`,
    );
  }
  for (const s of shippedAdditional) {
    const match = registryAdditional.find((r) => r.sourceUrl === s.sourceUrl);
    if (!match) {
      errors.push(
        `"${item.contentId}": shipped additionalSource "${s.sourceUrl}" has no matching registry entry (registry-missing secondary source).`,
      );
    } else if (match.sourceOrg !== s.sourceOrg) {
      errors.push(
        `"${item.contentId}": additionalSource "${s.sourceUrl}" sourceOrg mismatch -- shipped "${s.sourceOrg}", registry "${match.sourceOrg}".`,
      );
    }
  }
  for (const r of registryAdditional) {
    const match = shippedAdditional.find((s) => s.sourceUrl === r.sourceUrl);
    if (!match) {
      errors.push(
        `"${item.contentId}": registry additionalSource "${r.sourceUrl}" has no matching shipped source (registry-only secondary source).`,
      );
    }
  }
}

// 6. needs_review items must be explicitly identifiable (a reason is
//    required), and the reason field may not silently apply to anything
//    else -- one clear invariant, not a documented-but-violated one.
for (const e of learnRegistry) {
  if (e.status === "needs_review" && !e.reviewRequiredReason) {
    errors.push(`"${e.contentId}" is needs_review but has no reviewRequiredReason.`);
  }
  if (e.status !== "needs_review" && e.reviewRequiredReason) {
    errors.push(
      `"${e.contentId}" has a reviewRequiredReason set but status is "${e.status}", not needs_review.`,
    );
  }
}

// 7. Malformed lastVerifiedOn/status values fail validation outright --
//    including calendar-impossible dates like 2026-02-31.
for (const e of learnRegistry) {
  if (!isRealCalendarDate(e.lastVerifiedOn)) {
    errors.push(
      `"${e.contentId}": lastVerifiedOn "${e.lastVerifiedOn}" is not a real YYYY-MM-DD calendar date.`,
    );
  }
  if (!VALID_STATUSES.includes(e.status)) {
    errors.push(
      `"${e.contentId}": status "${e.status}" is not one of ${VALID_STATUSES.join(", ")}.`,
    );
  }
}

if (errors.length > 0) {
  console.error(
    `Learn Money registry validation FAILED (${errors.length} problem${errors.length === 1 ? "" : "s"}):\n`,
  );
  for (const err of errors) console.error(`  - ${err}`);
  process.exit(1);
}

console.log(
  `Learn Money registry validation passed: ${learnRegistry.length} registry entries, ${shipped.length} shipped content items, fully consistent.`,
);
