// Deterministic, network-free proof of the data-loading gate: a failed required
// financial-data query is an explicit UNAVAILABLE state, and no figure renders
// before EVERY engine dependency has loaded (SME/CEO ruling, 2026-10-09).
//
// What this proves:
//   1. deriveDataStatus: all-ready, any-pending -> loading, one error ->
//      unavailable naming only that source, an error that still holds old data
//      is still unavailable, unavailable beats loading, and a paused (offline)
//      first load is offline and NOT ready.
//   2. REGRESSION: the old hook gated only profile/accounts/expenses/debts/goals.
//      reserved, caps, overrides and deposits pending must now block the figure.
//   3. The nine engine sources are exactly the nine queries computeSnapshot reads.
//   4. resolveGateView (what MoneyDataGate renders): "ready" only when every
//      required source is ready; the non-ready copy never contains a figure or an
//      empty-state phrase; extras only block the surfaces that ask for them.
//   5. MoneyDataGate itself, server-rendered without a DOM: children (a sentinel
//      carrying a dollar figure) never appear in any non-ready state.
//   6. Source guard: every query in the hook throws on { error }.
//
// Run with: npx tsx scripts/prove-data-status.ts

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import {
  deriveDataStatus,
  ENGINE_SOURCES,
  EXTRA_SOURCES,
  GATE_COPY,
  joinLabels,
  resolveGateView,
  type DataSourceProbe,
  type GateSourceState,
  type GateState,
  type SourceFetchStatus,
} from "../src/lib/data-status";
import { MoneyDataGate } from "../src/components/money-data-gate";

let pass = 0;
let fail = 0;

function record(name: string, ok: boolean, detail?: string) {
  console.log(ok ? `PASS  ${name}` : `FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  if (ok) pass++;
  else fail++;
}

type Over = Partial<Pick<DataSourceProbe, "isPending" | "isError" | "fetchStatus">>;

/** Nine engine probes, all settled and idle, with per-key overrides. */
function engine(over: Record<string, Over> = {}): DataSourceProbe[] {
  return ENGINE_SOURCES.map((s) => ({
    key: s.key,
    label: s.label,
    isPending: false,
    isError: false,
    fetchStatus: "idle" as SourceFetchStatus,
    ...(over[s.key] ?? {}),
  }));
}

const label = (key: string) => ENGINE_SOURCES.find((s) => s.key === key)!.label;

// ---- 1. deriveDataStatus ----------------------------------------------------

{
  const d = deriveDataStatus(engine());
  record(
    "STATUS 1: all nine settled -> ready, nothing unavailable, not offline, not retrying",
    d.status === "ready" && d.unavailable.length === 0 && !d.offline && !d.retrying,
  );
}
{
  const bad: string[] = [];
  for (const s of ENGINE_SOURCES) {
    const d = deriveDataStatus(engine({ [s.key]: { isPending: true, fetchStatus: "fetching" } }));
    if (d.status !== "loading") bad.push(s.key);
  }
  record(
    "STATUS 2: any single engine source pending -> loading (all nine checked)",
    bad.length === 0,
    bad.join(","),
  );
}
{
  const d = deriveDataStatus(engine({ debts: { isError: true } }));
  record(
    "STATUS 3: one errored source -> unavailable, naming only that source",
    d.status === "unavailable" &&
      d.unavailable.length === 1 &&
      d.unavailable[0] === label("debts") &&
      d.unavailableKeys[0] === "debts" &&
      d.sources.debts === "unavailable" &&
      d.sources.bills === undefined &&
      d.sources.expenses === "ready",
  );
}
{
  // isError with isPending false is exactly what a failed background refetch of
  // a query that still holds old data looks like (TanStack v5 keeps `data`).
  const d = deriveDataStatus(engine({ accounts: { isError: true, isPending: false } }));
  record(
    "STATUS 4: an error that still holds old data is STILL unavailable (no pre-save figure after a failed refetch)",
    d.status === "unavailable" && d.unavailable[0] === label("accounts"),
  );
}
{
  const d = deriveDataStatus(
    engine({
      profile: { isPending: true, fetchStatus: "paused" },
      debts: { isPending: true, fetchStatus: "paused" },
    }),
  );
  record(
    "STATUS 5: offline first load (pending + paused) -> offline, NOT ready",
    d.offline && d.status !== "ready" && d.status === "loading",
  );
}
{
  // The old hook used isLoading (= isPending && isFetching). A paused first load
  // has isFetching false, so isLoading was false and the engine ran on defaults.
  const legacyIsLoading = (p: DataSourceProbe) => p.isPending && p.fetchStatus === "fetching";
  const probes = engine({ debts: { isPending: true, fetchStatus: "paused" } });
  const legacyWouldBlock = probes.some(legacyIsLoading);
  const d = deriveDataStatus(probes);
  record(
    "STATUS 6: isPending, not isLoading -- a paused first load blocks (isLoading would have let it through)",
    legacyWouldBlock === false && d.status !== "ready",
  );
}
{
  const d = deriveDataStatus(
    engine({ debts: { isError: true }, goals: { isPending: true, fetchStatus: "fetching" } }),
  );
  record(
    "STATUS 7: unavailable takes precedence over loading",
    d.status === "unavailable" && d.unavailable.length === 1,
  );
}
{
  const d = deriveDataStatus(engine({ goals: { fetchStatus: "paused" } }));
  record(
    "STATUS 8: a paused background refetch that holds good data is ready and not 'offline' (offline implies not ready)",
    d.status === "ready" && d.offline === false,
  );
}
{
  const failing = deriveDataStatus(engine({ debts: { isError: true, fetchStatus: "fetching" } }));
  const idle = deriveDataStatus(engine({ debts: { isError: true, fetchStatus: "idle" } }));
  const none = deriveDataStatus(engine({ goals: { isPending: true, fetchStatus: "fetching" } }));
  record(
    "STATUS 9: retrying is true only while a failure is being re-fetched",
    failing.retrying === true && idle.retrying === false && none.retrying === false,
  );
}
{
  const d = deriveDataStatus(
    engine({
      debts: { isError: true },
      expenses: { isError: true },
      accounts: { isError: true },
    }),
  );
  record(
    "STATUS 10: several failures are all named, in source order",
    JSON.stringify(d.unavailable) ===
      JSON.stringify([label("accounts"), label("expenses"), label("debts")]),
    JSON.stringify(d.unavailable),
  );
}

// ---- 2. regression: the 5-of-9 bug -------------------------------------------

{
  // What the pre-fix hook gated on.
  const OLD_GATED = new Set(["profile", "accounts", "expenses", "debts", "goals"]);
  const oldLoading = (probes: DataSourceProbe[]) =>
    probes.some((p) => OLD_GATED.has(p.key) && p.isPending && p.fetchStatus === "fetching");
  const bad: string[] = [];
  const stillHidden: string[] = [];
  for (const key of ["reserved", "caps", "overrides", "deposits"]) {
    const probes = engine({ [key]: { isPending: true, fetchStatus: "fetching" } });
    if (deriveDataStatus(probes).status === "ready") bad.push(key);
    if (!oldLoading(probes)) stillHidden.push(key); // proves the old gate really had the hole
  }
  record(
    "REGRESSION 1: reserved / caps / overrides / deposits pending => NOT ready (the old gate let each of them through)",
    bad.length === 0 && stillHidden.length === 4,
    `new gate let through: [${bad}] ; old gate blocked on: ${4 - stillHidden.length}`,
  );
}
{
  const all4 = deriveDataStatus(
    engine({
      reserved: { isPending: true, fetchStatus: "paused" },
      caps: { isPending: true, fetchStatus: "paused" },
      overrides: { isPending: true, fetchStatus: "paused" },
      deposits: { isPending: true, fetchStatus: "paused" },
    }),
  );
  record(
    "REGRESSION 2: the same four paused (offline) => offline and NOT ready",
    all4.offline && all4.status !== "ready",
  );
}
{
  const keys = ENGINE_SOURCES.map((s) => s.key as string).sort();
  const want = [
    "accounts",
    "caps",
    "debts",
    "deposits",
    "expenses",
    "goals",
    "overrides",
    "profile",
    "reserved",
  ];
  const extraKeys = EXTRA_SOURCES.map((s) => s.key as string).sort();
  record(
    "SOURCES 1: the nine engine sources are exactly profile/accounts/reserved/caps/expenses/debts/goals/deposits/overrides; extras are rules/imports/artifacts",
    JSON.stringify(keys) === JSON.stringify(want) &&
      JSON.stringify(extraKeys) === JSON.stringify(["artifacts", "imports", "rules"]),
    keys.join(","),
  );
  const labels = [...ENGINE_SOURCES, ...EXTRA_SOURCES].map((s) => s.label);
  record(
    "SOURCES 2: every label is unique plain words (no keys or digits leak to the person)",
    new Set(labels).size === labels.length && labels.every((l) => /^[a-z' -]+$/.test(l)),
  );
}

// ---- 3. joinLabels ----------------------------------------------------------

record(
  "COPY 1: joinLabels reads as plain English for 0, 1, 2 and 3+ items",
  joinLabels([]) === "" &&
    joinLabels(["your bills"]) === "your bills" &&
    joinLabels(["your bills", "your debts"]) === "your bills and your debts" &&
    joinLabels(["a", "b", "c"]) === "a, b, and c",
);

// ---- 4. resolveGateView -----------------------------------------------------

const src = (
  status: GateSourceState["status"],
  offline = false,
  unavailable: string[] = status === "unavailable" ? ["your bills"] : [],
): GateSourceState => ({ status, offline, unavailable });

{
  const STATUSES = ["ready", "loading", "unavailable"] as const;
  const bad: string[] = [];
  for (const a of STATUSES)
    for (const aOff of [false, true])
      for (const b of STATUSES)
        for (const bOff of [false, true]) {
          // offline implies not ready (the derivation's invariant), so skip impossible inputs.
          if ((aOff && a === "ready") || (bOff && b === "ready")) continue;
          const view = resolveGateView(src(a, aOff), src(b, bOff));
          const ready = a === "ready" && b === "ready";
          if ((view.kind === "ready") !== ready)
            bad.push(`${a}/${aOff} + ${b}/${bOff} -> ${view.kind}`);
        }
  record(
    "GATE 1: with extras, the gate is 'ready' if and only if BOTH engine and extras are ready (exhaustive)",
    bad.length === 0,
    bad.join(" ; "),
  );
}
{
  const bad: string[] = [];
  for (const a of ["loading", "unavailable"] as const)
    for (const off of [false, true]) {
      if (resolveGateView(src(a, off)).kind === "ready") bad.push(`${a}/${off}`);
    }
  record(
    "GATE 2: any non-ready engine state never resolves to 'ready'",
    bad.length === 0,
    bad.join(","),
  );
}
{
  const engineOnly = resolveGateView(src("ready"));
  const withExtrasDown = resolveGateView(
    src("ready"),
    src("unavailable", false, ["your saved plans"]),
  );
  const withExtrasLoading = resolveGateView(src("ready"), src("loading"));
  record(
    "GATE 3: extras block only the surfaces that pass them (omitted -> ready; unavailable/loading -> not ready)",
    engineOnly.kind === "ready" &&
      withExtrasDown.kind === "unavailable" &&
      withExtrasLoading.kind === "loading",
  );
}
{
  const v = resolveGateView(src("unavailable", false, [label("expenses"), label("debts")]));
  record(
    "GATE 4: unavailable names the failed sources in plain words and says why no figure is shown",
    v.kind === "unavailable" &&
      v.headline ===
        "BudgetChek couldn't load your bills and your debts, so it can't work out this paycheck plan." &&
      v.eyebrow === "Can't calculate right now" &&
      v.body.includes("Nothing you entered has changed") &&
      !v.offline,
    v.kind === "unavailable" ? v.headline : v.kind,
  );
}
{
  const v = resolveGateView(src("loading", true, []));
  record(
    "GATE 5: an offline first load shows the offline card, not an endless 'Working it out…'",
    v.kind === "unavailable" &&
      v.offline &&
      v.headline === GATE_COPY.offlineHeadline &&
      v.labels.length === 0,
  );
}
{
  const v = resolveGateView(src("ready"), src("unavailable", false, ["your saved plans"]));
  record(
    "GATE 6: an extras-only failure does not claim the paycheck math failed",
    v.kind === "unavailable" &&
      !v.headline.includes("paycheck plan") &&
      v.headline.includes("your saved plans"),
    v.kind === "unavailable" ? v.headline : v.kind,
  );
}
{
  // Copy audit across every non-ready view the gate can produce: no figure, no
  // placeholder, no empty-state phrase that would read as "nothing is owed".
  const views = [
    resolveGateView(src("unavailable", false, [label("debts")])),
    resolveGateView(
      src(
        "unavailable",
        false,
        ENGINE_SOURCES.map((s) => s.label),
      ),
    ),
    resolveGateView(src("loading", true)),
    resolveGateView(src("ready"), src("unavailable", false, ["your saved plans"])),
  ];
  const forbidden = [
    /\d/,
    /\$/,
    /—/,
    /\bno debts\b/i,
    /nothing due/i,
    /nothing you've entered is due/i,
    /\bnone yet\b/i,
    /\$0/,
  ];
  const offenders: string[] = [];
  for (const v of views) {
    if (v.kind !== "unavailable") {
      offenders.push(`kind:${v.kind}`);
      continue;
    }
    const text = `${v.eyebrow} ${v.headline} ${v.body}`;
    for (const re of forbidden) if (re.test(text)) offenders.push(`${re}:${text}`);
  }
  record(
    "GATE 7: non-ready copy never contains a figure, a dash placeholder, 'No debts' or 'Nothing due'",
    offenders.length === 0,
    offenders.join(" | "),
  );
}

// ---- 5. MoneyDataGate, rendered without a DOM -------------------------------

{
  const SENTINEL = "SENTINEL-FIGURE $1,234.00 No debts Nothing due";
  const retry = async () => undefined;
  const child = createElement("p", null, SENTINEL);
  const render = (state: GateState, extras?: GateSourceState) =>
    renderToStaticMarkup(createElement(MoneyDataGate, { state, extras }, child));
  const gs = (s: GateSourceState, retrying = false): GateState => ({ ...s, retrying, retry });

  const ready = render(gs(src("ready")));
  record("RENDER 1: ready renders the children", ready.includes("SENTINEL-FIGURE"));

  const nonReady: [string, string][] = [
    ["loading", render(gs(src("loading")))],
    ["unavailable", render(gs(src("unavailable")))],
    ["unavailable+retrying", render(gs(src("unavailable"), true))],
    ["offline", render(gs(src("loading", true)))],
    [
      "extras unavailable",
      render(gs(src("ready")), src("unavailable", false, ["your saved plans"])),
    ],
    ["extras loading", render(gs(src("ready")), src("loading"))],
  ];
  const leaked = nonReady
    .filter(([, html]) => html.includes("SENTINEL") || html.includes("$1,234"))
    .map(([n]) => n);
  record(
    "RENDER 2: no non-ready state renders the children or any figure (loading, unavailable, retrying, offline, extras x2)",
    leaked.length === 0,
    leaked.join(","),
  );

  const loadingHtml = nonReady[0][1];
  record(
    "RENDER 3: loading keeps the 'Paycheck briefing / Working it out…' card with aria-busy",
    loadingHtml.includes("Paycheck briefing") &&
      loadingHtml.includes("Working it out") &&
      loadingHtml.includes('aria-busy="true"'),
  );
  const unavailHtml = nonReady[1][1];
  record(
    "RENDER 4: unavailable shows the eyebrow, the plain-words headline and an enabled 'Try again' button",
    unavailHtml.includes("Can&#x27;t calculate right now") &&
      unavailHtml.includes("couldn&#x27;t load your bills") &&
      /<button[^>]*>Try again<\/button>/.test(unavailHtml) &&
      !/<button[^>]*\sdisabled=""/.test(unavailHtml),
  );
  const retryingHtml = nonReady[2][1];
  record(
    "RENDER 5: while retrying the button is disabled and reads 'Trying again…'",
    /<button[^>]*\sdisabled=""[^>]*>Trying again…<\/button>/.test(retryingHtml),
    retryingHtml,
  );
  const offlineHtml = nonReady[3][1];
  record(
    "RENDER 6: offline says 'You appear to be offline.' with a Try again button",
    offlineHtml.includes("You appear to be offline.") && offlineHtml.includes("Try again"),
  );
}

// ---- 6. source guard: every hook query throws on { error } --------------------

{
  const hook = readFileSync(new URL("../src/hooks/use-money-state.ts", import.meta.url), "utf8");
  const reads = (hook.match(/await supabase/g) ?? []).length;
  const checks = (hook.match(/if \(error\) throw error;/g) ?? []).length;
  const swallowed = /const \{ data \} = await supabase/.test(hook);
  record(
    "SOURCE 1: every one of the twelve hook queries destructures { error } and throws; none swallows",
    reads === 12 && checks === 12 && !swallowed,
    `reads=${reads} checks=${checks} swallowed=${swallowed}`,
  );
  record(
    "SOURCE 2: the hook never gates on isLoading, and loads all nine engine sources through the derivation",
    !/\bisLoading\b/.test(hook) && /deriveDataStatus\(ENGINE_SOURCES/.test(hook),
  );
}

console.log("");
console.log(`${pass}/${pass + fail} data-status proof cases passed`);

if (fail > 0) {
  console.error(`${fail} data-status proof case(s) FAILED.`);
  process.exit(1);
}
