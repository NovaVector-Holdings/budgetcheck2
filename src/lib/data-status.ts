// Pure data-loading status for everything the paycheck plan is computed from.
//
// Why this exists (CEO/SME ruling, 2026-10-09): a failed required financial-data
// query used to be swallowed into `[]` / `0` / "complete" -- a failed debts query
// produced a snapshot with no debt minimums that read as a healthy plan, and the
// assistant then grounded its "the plan is complete" claim against that same
// payload. A failed required query is now an explicit UNAVAILABLE state, and no
// figure may render before EVERY engine dependency has loaded.
//
// This file is deliberately React-free so scripts/prove-data-status.ts can prove
// the rules (and the exact user-facing copy) without a DOM.

export type DataStatus = "loading" | "unavailable" | "ready";
export type SourceState = "loading" | "unavailable" | "ready";
/** Mirrors TanStack Query's `fetchStatus`. */
export type SourceFetchStatus = "fetching" | "paused" | "idle";

/** The nine queries computeSnapshot reads -- ALL must resolve before any figure renders. */
export const ENGINE_SOURCES = [
  { key: "profile", label: "your balance and pay schedule" },
  { key: "accounts", label: "your accounts" },
  { key: "reserved", label: "your set-aside money" },
  { key: "caps", label: "your spending caps" },
  { key: "expenses", label: "your bills" },
  { key: "debts", label: "your debts" },
  { key: "goals", label: "your savings goals" },
  { key: "deposits", label: "your savings deposits" },
  { key: "overrides", label: "your priorities" },
] as const;

/** UI extras that are NOT engine inputs; only the surfaces that save from them wait on these. */
export const EXTRA_SOURCES = [
  { key: "rules", label: "your statement rules" },
  { key: "imports", label: "your imported statements" },
  { key: "artifacts", label: "your saved plans" },
] as const;

export type EngineSourceKey = (typeof ENGINE_SOURCES)[number]["key"];
export type ExtraSourceKey = (typeof EXTRA_SOURCES)[number]["key"];

export interface DataSourceProbe {
  key: string;
  /** Plain-words name, shown to the person ("your bills"). */
  label: string;
  isPending: boolean;
  isError: boolean;
  fetchStatus: SourceFetchStatus;
}

export interface DerivedDataStatus {
  status: DataStatus;
  /** User-facing labels of the sources that failed, in source order. */
  unavailable: string[];
  unavailableKeys: string[];
  /**
   * True only when a paused (no network) source is what is blocking the result,
   * so `offline` implies `status !== "ready"`. A paused background refetch that
   * still holds good data does not make the page "offline".
   */
  offline: boolean;
  /** A failure is being retried right now (drives the disabled "Trying again..." button). */
  retrying: boolean;
  /** Per-source state, for surfaces (the repair panel) that show each list on its own. */
  sources: Record<string, SourceState>;
}

/**
 * unavailable > loading > ready.
 *
 *  - loading is `isPending` (no data has EVER arrived), never `isLoading`
 *    (isPending && isFetching): an offline first load is pending but paused, so
 *    isLoading is false and the engine would run on empty defaults.
 *  - an errored query counts as unavailable EVEN IF it still holds old data, so a
 *    failed post-save refetch can never show a pre-save figure.
 */
export function deriveDataStatus(probes: readonly DataSourceProbe[]): DerivedDataStatus {
  const sources: Record<string, SourceState> = {};
  const unavailable: string[] = [];
  const unavailableKeys: string[] = [];
  let anyPending = false;
  let offline = false;
  let fetching = false;

  for (const p of probes) {
    if (p.isError) {
      sources[p.key] = "unavailable";
      unavailable.push(p.label);
      unavailableKeys.push(p.key);
    } else if (p.isPending) {
      sources[p.key] = "loading";
      anyPending = true;
    } else {
      sources[p.key] = "ready";
    }
    if (p.fetchStatus === "paused" && (p.isPending || p.isError)) offline = true;
    if (p.fetchStatus === "fetching") fetching = true;
  }

  const status: DataStatus =
    unavailable.length > 0 ? "unavailable" : anyPending ? "loading" : "ready";
  return {
    status,
    unavailable,
    unavailableKeys,
    offline,
    retrying: unavailable.length > 0 && fetching,
    sources,
  };
}

/** "a", "a and b", "a, b, and c". */
export function joinLabels(labels: readonly string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

/** What MoneyDataGate needs from a status source (the hook's own fields, or `extras`). */
export interface GateSourceState {
  status: DataStatus;
  unavailable: string[];
  offline: boolean;
}

/** The hook's gate-facing surface: a source state plus the retry controls. */
export interface GateState extends GateSourceState {
  retrying: boolean;
  retry: () => Promise<unknown>;
}

export type GateView =
  | { kind: "ready" }
  | { kind: "loading" }
  | {
      kind: "unavailable";
      offline: boolean;
      eyebrow: string;
      headline: string;
      body: string;
      /** Labels of what failed; empty when the page is simply offline. */
      labels: string[];
    };

export const GATE_COPY = {
  loadingEyebrow: "Paycheck briefing",
  loadingLine: "Working it out…",
  eyebrow: "Can't calculate right now",
  offlineHeadline: "You appear to be offline.",
  body: "Nothing you entered has changed. It won't show a figure it can't stand behind.",
  offlineBody:
    "Nothing you entered has changed. It won't show a figure it can't stand behind, and it will pick up again once you're back online.",
  retry: "Try again",
  retrying: "Trying again…",
} as const;

/**
 * Decides what the gate shows. `extras` is passed only by surfaces that save from
 * rules / imports / artifacts. A non-ready state NEVER resolves to "ready", and an
 * offline-paused load resolves to the offline card rather than an endless spinner.
 */
export function resolveGateView(state: GateSourceState, extras?: GateSourceState): GateView {
  const parts = extras ? [state, extras] : [state];
  const anyUnavailable = parts.some((s) => s.status === "unavailable");
  const anyLoading = parts.some((s) => s.status === "loading");
  if (!anyUnavailable && !anyLoading) return { kind: "ready" };

  const offline = parts.some((s) => s.offline);
  if (!anyUnavailable && !offline) return { kind: "loading" };

  const engineLabels = state.unavailable;
  const labels = [...engineLabels, ...(extras?.unavailable ?? [])];
  if (offline) {
    return {
      kind: "unavailable",
      offline: true,
      eyebrow: GATE_COPY.eyebrow,
      headline: GATE_COPY.offlineHeadline,
      body: GATE_COPY.offlineBody,
      labels: [],
    };
  }
  const what = joinLabels(labels) || "some of your information";
  return {
    kind: "unavailable",
    offline: false,
    eyebrow: GATE_COPY.eyebrow,
    // Extras-only failures do not touch the paycheck math, so say what is really blocked.
    headline:
      engineLabels.length > 0
        ? `BudgetChek couldn't load ${what}, so it can't work out this paycheck plan.`
        : `BudgetChek couldn't load ${what}, so it can't safely show this page.`,
    body: GATE_COPY.body,
    labels,
  };
}
