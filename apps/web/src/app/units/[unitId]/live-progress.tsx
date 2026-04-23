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
import {
  getDisplayedSubmittedCount,
  getRemainingSlotsCount,
} from "../../../lib/sui/types";

export type LiveProgressProps = {
  readonly displayMaxSlots?: number;
  readonly eventSubscriptionEnabled?: boolean;
  readonly packageId: string;
  readonly unitId: string;
  readonly initialSubmittedCount: number;
  readonly maxSlots: number;
  readonly onMosaicReady?: (event: MosaicReadyEvent) => void;
  readonly triggerFinalize?: (unitId: string) => Promise<void>;
};

export function LiveProgress(props: LiveProgressProps): React.ReactElement {
  const {
    eventSubscriptionEnabled = true,
    displayMaxSlots,
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
  const effectiveDisplayMaxSlots = displayMaxSlots ?? maxSlots;

  useUnitEvents({
    packageId: eventSubscriptionEnabled ? packageId : "",
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

  const progressView = {
    displayMaxSlots: effectiveDisplayMaxSlots,
    maxSlots,
    submittedCount,
  };
  const displayedSubmittedCount = getDisplayedSubmittedCount(progressView);
  const pct =
    effectiveDisplayMaxSlots > 0
      ? (displayedSubmittedCount / effectiveDisplayMaxSlots) * 100
      : 0;
  const remaining = getRemainingSlotsCount(progressView);

  return (
    <div className="grid gap-5">
      <p
        aria-live="polite"
        className="op-big-counter tabular-nums"
        data-testid="live-progress-counter"
      >
        <span className="num">{displayedSubmittedCount.toLocaleString()}</span>
        <span className="slash">/</span>
        <span className="total">
          {effectiveDisplayMaxSlots.toLocaleString()}
        </span>
      </p>
      <div className="grid gap-2">
        <div className="op-progress-bar">
          <div className="op-progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-3 font-mono-op text-[11px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
          <span className="text-[var(--ember)]">
            {filled ? "Filled" : "Filling"}
          </span>
          <span>
            {remaining.toLocaleString()} tiles remaining ·{" "}
            {displayedSubmittedCount.toLocaleString()} Kakera minted
          </span>
        </div>
      </div>
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
