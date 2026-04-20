"use client";

/**
 * Client-side live progress counter for a single `Unit`.
 *
 * The server component (`./page.tsx`) hydrates this with the count it read
 * from Sui at request time; from there `useUnitEvents` keeps the number
 * ticking in real time via `SubmittedEvent`s. `UnitFilledEvent` and
 * `MosaicReadyEvent` are logged as hooks for the later finalize / reveal
 * flows but intentionally do not drive UI yet (out of scope for STEP 5/5).
 *
 * Follow-up issues can plug:
 *   - submit button (zkLogin + Enoki Sponsored Tx)
 *   - reveal animation (listen for MosaicReadyEvent here and fan out)
 */

import { useState } from "react";

import type {
  MosaicReadyEvent,
  SubmittedEvent,
  UnitFilledEvent,
} from "../../../lib/sui";
import { useUnitEvents } from "../../../lib/sui/react";

export type LiveProgressProps = {
  readonly packageId: string;
  readonly unitId: string;
  readonly initialSubmittedCount: number;
  readonly maxSlots: number;
};

export function LiveProgress(props: LiveProgressProps): React.ReactElement {
  const { packageId, unitId, initialSubmittedCount, maxSlots } = props;

  const [submittedCount, setSubmittedCount] = useState(initialSubmittedCount);
  const [filled, setFilled] = useState(false);
  const [mosaicReady, setMosaicReady] = useState(false);

  useUnitEvents({
    packageId,
    unitId,
    onSubmitted: (event: SubmittedEvent) => {
      // Events can arrive out of order from the RPC poll — guard against
      // a stale event clobbering a newer server/server-event count.
      setSubmittedCount((current) =>
        event.submittedCount > current ? event.submittedCount : current,
      );
    },
    onFilled: (_event: UnitFilledEvent) => {
      // Reveal orchestration is intentionally deferred to a later issue;
      // mark the flag so follow-up work has a hook to trigger animation.
      setFilled(true);
    },
    onMosaicReady: (_event: MosaicReadyEvent) => {
      // Full reveal rendering is out of scope. Track it so follow-up work
      // can swap this component for a ReadyOverlay without changing wiring.
      setMosaicReady(true);
    },
  });

  return (
    <div className="grid gap-2">
      <p
        aria-live="polite"
        className="font-mono text-3xl tabular-nums text-white"
      >
        {submittedCount} / {maxSlots}
      </p>
      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
        {filled ? "Filled" : "Filling"}
        {mosaicReady ? " · Mosaic ready" : ""}
      </p>
      {/* TODO(issue-4+): render submit button here (zkLogin + Sponsored Tx). */}
      {/* TODO(issue-6+): swap this panel for ReveralOverlay when mosaicReady. */}
    </div>
  );
}
