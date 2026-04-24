"use client";

/**
 * Client-side live progress counter for a single `Unit`.
 *
 * The server component (`./page.tsx`) hydrates this with the count it read
 * from Sui at request time; from there `useUnitEvents` keeps the number
 * ticking in real time via `SubmittedEvent`s. `UnitFilledEvent` starts the
 * finalize handoff, while `MosaicReadyEvent` is forwarded to the reveal flow.
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

import { useEffect, useRef, useState } from "react";

import type {
  MosaicReadyEvent,
  SubmittedEvent,
  UnitFilledEvent,
} from "../../../lib/sui";
import { useUnitEvents } from "../../../lib/sui/react";

function formatProgressCount(value: number): string {
  return String(value);
}

export type LiveProgressProps = {
  readonly eventSubscriptionEnabled?: boolean;
  readonly packageId: string;
  readonly unitId: string;
  readonly initialMasterId?: string | null;
  readonly initialSubmittedCount: number;
  readonly maxSlots: number;
  readonly onMosaicReady?: (event: MosaicReadyEvent) => void;
  readonly triggerFinalize?: (
    unitId: string,
  ) => Promise<FinalizeTriggerResult | undefined>;
};

type FinalizeTriggerResult =
  | {
      readonly code: string;
      readonly message: string;
      readonly status: "ignored_dispatch_failed";
      readonly unitId: string | null;
    }
  | {
      readonly status: "ignored_finalized" | "ignored_pending" | "queued";
      readonly unitId: string;
    };

type FinalizeState =
  | { readonly status: "idle" }
  | { readonly status: "running" }
  | {
      readonly status: "failed";
      readonly code: string;
      readonly message: string;
    }
  | { readonly status: "queued" };

export function LiveProgress(props: LiveProgressProps): React.ReactElement {
  const {
    eventSubscriptionEnabled = true,
    packageId,
    unitId,
    initialMasterId,
    initialSubmittedCount,
    maxSlots,
    onMosaicReady,
    triggerFinalize = defaultTriggerFinalize,
  } = props;

  const initiallyFilled = maxSlots > 0 && initialSubmittedCount >= maxSlots;
  const needsInitialFinalize = initiallyFilled && initialMasterId === null;
  const [submittedCount, setSubmittedCount] = useState(initialSubmittedCount);
  const [filled, setFilled] = useState(initiallyFilled);
  const [finalizeState, setFinalizeState] = useState<FinalizeState>(
    needsInitialFinalize ? { status: "running" } : { status: "idle" },
  );
  const finalizeTriggeredRef = useRef(false);

  const startFinalize = (): void => {
    if (finalizeTriggeredRef.current) {
      return;
    }

    finalizeTriggeredRef.current = true;
    setFinalizeState({ status: "running" });
    void triggerFinalize(unitId)
      .then((result) => {
        if (result?.status === "ignored_dispatch_failed") {
          setFinalizeState({
            code: result.code,
            message: result.message,
            status: "failed",
          });
          return;
        }

        setFinalizeState({ status: "queued" });
      })
      .catch((error: unknown) => {
        setFinalizeState({
          code: "request_failed",
          message: error instanceof Error ? error.message : String(error),
          status: "failed",
        });
      });
  };

  useEffect(() => {
    if (!needsInitialFinalize) {
      return;
    }

    startFinalize();
  });

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
      setFilled(true);
      startFinalize();
    },
    onMosaicReady: (event: MosaicReadyEvent) => {
      onMosaicReady?.(event);
    },
  });

  const pct = maxSlots > 0 ? (submittedCount / maxSlots) * 100 : 0;
  const remaining = Math.max(0, maxSlots - submittedCount);
  const progressLabel =
    finalizeState.status === "running" || finalizeState.status === "failed"
      ? "Finalizing"
      : filled
        ? "Filled"
        : "Filling";

  const retryFinalize = (): void => {
    finalizeTriggeredRef.current = false;
    startFinalize();
  };

  return (
    <div className="grid gap-5">
      <p aria-live="polite" className="op-big-counter tabular-nums">
        <span className="sr-only">
          {`${formatProgressCount(submittedCount)} / ${formatProgressCount(maxSlots)}`}
        </span>
        <span className="num">{formatProgressCount(submittedCount)}</span>
        <span className="slash">/</span>
        <span className="total">{formatProgressCount(maxSlots)}</span>
      </p>
      <div className="grid gap-2">
        <div className="op-progress-bar">
          <div className="op-progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-3 font-mono-op text-[11px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
          <span className="text-[var(--ember)]">{progressLabel}</span>
          <span>
            {formatProgressCount(remaining)} tiles remaining ·{" "}
            {formatProgressCount(submittedCount)} Kakera minted
          </span>
        </div>
      </div>
      {finalizeState.status !== "idle" ? (
        <div className="grid gap-3 border border-[var(--rule)] bg-[rgba(245,239,227,0.03)] p-4 text-left">
          {finalizeState.status === "failed" ? (
            <>
              <p className="font-mono-op text-[11px] uppercase tracking-[0.14em] text-[var(--ember)]">
                finalize failed
              </p>
              <p className="text-sm text-[var(--ink-dim)]">
                {finalizeState.message}
              </p>
              <p className="font-mono-op text-[11px] text-[var(--ink-faint)]">
                {finalizeState.code}
              </p>
              <button
                className="op-btn-primary w-fit"
                onClick={retryFinalize}
                type="button"
              >
                Retry finalize
              </button>
            </>
          ) : (
            <p
              aria-live="polite"
              className="font-mono-op text-[11px] uppercase tracking-[0.14em] text-[var(--ink-dim)]"
            >
              finalize is running
            </p>
          )}
        </div>
      ) : null}
      {/* TODO(issue-4+): render submit button here (zkLogin + Sponsored Tx). */}
      {/* TODO(issue-6+): wrap reveal timing around this counter if needed. */}
    </div>
  );
}

async function defaultTriggerFinalize(
  unitId: string,
): Promise<FinalizeTriggerResult> {
  const response = await fetch("/api/finalize", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ unitId }),
  });
  const payload = (await response.json()) as FinalizeTriggerResult;

  if (!response.ok) {
    throw new Error(
      "message" in payload ? payload.message : "finalize request failed",
    );
  }

  return payload;
}
