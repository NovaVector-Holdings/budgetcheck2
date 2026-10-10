import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  GATE_COPY,
  resolveGateView,
  type GateSourceState,
  type GateState,
} from "@/lib/data-status";

/**
 * Props contract (shared by Money Meeting and, in the next stage, the Overview):
 *
 *  - `state`    the object returned by `useMoneyState` (or any GateState): the nine
 *               engine sources' `status`, `unavailable`, `offline`, `retrying`, `retry`.
 *  - `extras`   OPTIONAL. Pass `state.extras` only on surfaces that SAVE from
 *               rules / imports / artifacts (Plans, Statements, the repair panel).
 *               Extras that are still loading or failed block those surfaces too.
 *  - `children` rendered ONLY when everything required is `ready`.
 *
 * Non-ready states render a notice and never the children: no 0, dash placeholder,
 * "No debts", "Nothing due" or setup form, because an empty list from a failed or
 * unfinished query is not the same as an empty list (SME ruling, 2026-10-09).
 * The copy and the decision live in src/lib/data-status.ts so they are provable
 * without a DOM.
 */
export interface MoneyDataGateProps {
  state: GateState;
  extras?: GateSourceState;
  children: ReactNode;
}

export function MoneyDataGate({ state, extras, children }: MoneyDataGateProps) {
  const view = resolveGateView(state, extras);
  if (view.kind === "ready") return <>{children}</>;
  return <MoneyDataGateNotice state={state} extras={extras} />;
}

/**
 * Just the notice, for callers that cannot wrap their content in a component
 * (it renders nothing when ready). `repairSurface` hides the loading card and
 * shows only failures: the repair panel stays usable while loading but must say
 * so when a source is down.
 */
export function MoneyDataGateNotice({
  state,
  extras,
  repairSurface = false,
}: {
  state: GateState;
  extras?: GateSourceState;
  repairSurface?: boolean;
}) {
  const view = resolveGateView(state, extras);
  if (view.kind === "ready") return null;

  if (view.kind === "loading") {
    if (repairSurface) return null;
    return (
      <section className="paper-card mt-5 p-6 sm:p-8" aria-busy="true">
        <p className="eyebrow">{GATE_COPY.loadingEyebrow}</p>
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {GATE_COPY.loadingLine}
        </p>
      </section>
    );
  }

  return (
    <section className="paper-card mt-5 p-6 sm:p-8" role="alert">
      <p className="eyebrow">{view.eyebrow}</p>
      <h2 className="mt-2 font-serif text-xl text-ink">{view.headline}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{view.body}</p>
      <Button
        type="button"
        className="mt-4"
        disabled={state.retrying}
        onClick={() => {
          void state.retry();
        }}
      >
        {state.retrying ? GATE_COPY.retrying : GATE_COPY.retry}
      </Button>
    </section>
  );
}
