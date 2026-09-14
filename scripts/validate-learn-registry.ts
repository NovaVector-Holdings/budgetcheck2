// Governance validator for Learn Money content.
//
// Run via `npm run validate:learn-registry`. Exits non-zero on any drift
// between src/lib/learn-registry.ts and the actual shipped content in
// src/lib/lessons.ts / src/lib/resources.ts, so the registry GOVERNS the
// content instead of merely describing it.

import { lessons } from "../src/lib/lessons";
import { learnResources, readResources, earnResources, helpResources } from "../src/lib/resources";
import { learnRegistry, type LearnCategory, type ReviewStatus } from "../src/lib/learn-registry";

type Shipped = { contentId: string; category: LearnCategory; sourceOrg: string; sourceUrl: string };

const shipped: Shipped[] = [
  ...lessons.map((l) => ({
    contentId: l.id,
    category: "listen" as const,
    sourceOrg: l.source,
    sourceUrl: l.sourceUrl,
  })),
  ...learnResources.map((r) => ({
    contentId: r.title,
    category: "listen" as const,
    sourceOrg: r.source,
    sourceUrl: r.url,
  })),
  ...readResources.map((r) => ({
    contentId: r.title,
    category: "read" as const,
    sourceOrg: r.source,
    sourceUrl: r.url,
  })),
  ...earnResources.map((r) => ({
    contentId: r.title,
    category: "earn" as const,
    sourceOrg: r.source,
    sourceUrl: r.url,
  })),
  ...helpResources.map((r) => ({
    contentId: r.title,
    category: "help" as const,
    sourceOrg: r.source,
    sourceUrl: r.url,
  })),
];

const errors: string[] = [];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUSES: ReviewStatus[] = ["active", "needs_review", "retired"];

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

// 3-5. Org, URL, and category must match the live record EXACTLY for every
//      entry that's still shipping, and retired entries must not ship.
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

// 7. Malformed lastVerifiedOn/status values fail validation outright.
for (const e of learnRegistry) {
  if (!ISO_DATE.test(e.lastVerifiedOn)) {
    errors.push(
      `"${e.contentId}": lastVerifiedOn "${e.lastVerifiedOn}" is not in YYYY-MM-DD form.`,
    );
  } else if (Number.isNaN(new Date(`${e.lastVerifiedOn}T00:00:00Z`).getTime())) {
    errors.push(
      `"${e.contentId}": lastVerifiedOn "${e.lastVerifiedOn}" does not parse as a real calendar date.`,
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
