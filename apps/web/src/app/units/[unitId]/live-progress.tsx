"use client";

/**
 * Client-side live progress counter for a single `Unit`.
 *
 * The server component (`./page.tsx`) hydrates this with the count it read
 * from Sui at request time; from there `useUnitEvents` keeps the number
 * ticking in real time via `SubmittedEvent`s. `UnitFilledEvent` and
 * `MosaicReadyEvent` are logged as hooks for the later finalize / reveal
 * flows but intentionally do not drive UI yet.
 *
 * Invariant (see CLAUDE.md / docs/tech.md §10, §11):
 *   `SubmittedEvent` is the ONLY source of truth for `submittedCount`.
 *   The submit flow (`ParticipationAccess`) must NOT optimistically bump this
 *   counter — the participant sees the number advance only after the chain
 *   event is observed. This keeps the waiting-room narrative ("観測できる
 *   まで待ち、駄目なら案内付きで再試行") honest.
 *
 * Follow-up issues can plug:
 *   - reveal animation (listen for MosaicReadyEvent here and fan out)
 */

import { useRef, useState } from "react";

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
  readonly onMosaicReady?: (event: MosaicReadyEvent) => void;
  readonly triggerFinalize?: (unitId: string) => Promise<void>;
};

export function LiveProgress(props: LiveProgressProps): React.ReactElement {
  const {
    packageId,
    unitId,
    initialSubmittedCount,
    maxSlots,
    onMosaicReady,
    triggerFinalize = defaultTriggerFinalize,
  } = props;

  const [submittedCount, setSubmittedCount] = useState(initialSubmittedCount);
  const [filled, setFilled] = useState(false);
  const finalizeTriggeredRef = useRef(false);

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
      if (!finalizeTriggeredRef.current) {
        finalizeTriggeredRef.current = true;
        void triggerFinalize(unitId).catch(() => undefined);
      }
    },
    onMosaicReady: (event: MosaicReadyEvent) => {
      onMosaicReady?.(event);
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
      </p>
      {/* TODO(issue-4+): render submit button here (zkLogin + Sponsored Tx). */}
      {/* TODO(issue-6+): wrap reveal timing around this counter if needed. */}
    </div>
  );
}

async function defaultTriggerFinalize(unitId: string): Promise<void> {
  await fetch("/api/finalize", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ unitId }),
  });
}
