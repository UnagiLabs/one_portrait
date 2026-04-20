/**
 * React hook that polls for the Kakera Soulbound NFT minted by a specific
 * submission.
 *
 * Motivation: after the Sponsored `submit_photo` transaction resolves, the
 * Kakera mint is already on-chain but the fullnode index may take a moment
 * to surface it via `getOwnedObjects`. This hook polls
 * {@link findKakeraForSubmission} at a short fixed interval until either
 * the Kakera shows up ({@link UseOwnedKakeraResult.status} `"found"`) or
 * the retry budget is exhausted (`"timeout"`).
 *
 * The SuiClient and timer implementations are both DI parameters so that
 * tests can assert polling behaviour deterministically without leaning on
 * real network or real `setTimeout`.
 */

"use client";

import { useEffect, useRef, useState } from "react";

import {
  findKakeraForSubmission,
  type KakeraOwnedClient,
  type OwnedKakera,
} from "./kakera";

/** Default cadence: 1.5s × 20 attempts = 30s before we give up. */
export const OWNED_KAKERA_DEFAULT_INTERVAL_MS = 1_500;
export const OWNED_KAKERA_DEFAULT_MAX_ATTEMPTS = 20;

export type UseOwnedKakeraStatus = "idle" | "searching" | "found" | "timeout";

export type UseOwnedKakeraResult = {
  readonly status: UseOwnedKakeraStatus;
  readonly kakera: OwnedKakera | null;
};

export type UseOwnedKakeraArgs = {
  readonly suiClient: KakeraOwnedClient;
  readonly ownerAddress: string | null;
  readonly unitId: string;
  readonly walrusBlobId: string;
  readonly packageId: string;
  readonly intervalMs?: number;
  readonly maxAttempts?: number;
  /** Injected timer scheduler. Defaults to `setTimeout`. */
  readonly scheduleTimeout?: (ms: number, fn: () => void) => number;
  /** Injected clearer. Defaults to `clearTimeout`. */
  readonly clearTimeout?: (handle: number) => void;
};

export function useOwnedKakera(args: UseOwnedKakeraArgs): UseOwnedKakeraResult {
  const {
    suiClient,
    ownerAddress,
    unitId,
    walrusBlobId,
    packageId,
    intervalMs = OWNED_KAKERA_DEFAULT_INTERVAL_MS,
    maxAttempts = OWNED_KAKERA_DEFAULT_MAX_ATTEMPTS,
    scheduleTimeout,
    clearTimeout: clearHandle,
  } = args;

  const [result, setResult] = useState<UseOwnedKakeraResult>({
    status: ownerAddress ? "searching" : "idle",
    kakera: null,
  });

  // Latest inputs captured in a ref so the polling effect can read them
  // without having to list every function in its dependency array (which
  // would restart polling on every render).
  const latestRef = useRef({
    suiClient,
    intervalMs,
    maxAttempts,
    schedule: scheduleTimeout ?? defaultSchedule,
    clear: clearHandle ?? defaultClear,
  });
  latestRef.current = {
    suiClient,
    intervalMs,
    maxAttempts,
    schedule: scheduleTimeout ?? defaultSchedule,
    clear: clearHandle ?? defaultClear,
  };

  useEffect(() => {
    if (!ownerAddress || !unitId || !walrusBlobId || !packageId) {
      setResult({ status: ownerAddress ? "searching" : "idle", kakera: null });
      return;
    }

    setResult({ status: "searching", kakera: null });

    let cancelled = false;
    let pending: number | null = null;
    let attempts = 0;

    const runPoll = async (): Promise<void> => {
      if (cancelled) return;
      attempts += 1;

      const latest = latestRef.current;
      let found: OwnedKakera | null = null;
      try {
        found = await findKakeraForSubmission({
          suiClient: latest.suiClient,
          ownerAddress,
          unitId,
          walrusBlobId,
          packageId,
        });
      } catch {
        // Treat transport errors like "not yet found" so the UI doesn't
        // flip into an error state mid-poll; the final timeout branch
        // still covers persistent failures.
        found = null;
      }

      if (cancelled) return;

      if (found) {
        setResult({ status: "found", kakera: found });
        return;
      }

      if (attempts >= latest.maxAttempts) {
        setResult({ status: "timeout", kakera: null });
        return;
      }

      pending = latest.schedule(latest.intervalMs, () => {
        pending = null;
        void runPoll();
      });
    };

    void runPoll();

    return () => {
      cancelled = true;
      if (pending !== null) {
        latestRef.current.clear(pending);
        pending = null;
      }
    };
  }, [ownerAddress, unitId, walrusBlobId, packageId]);

  return result;
}

function defaultSchedule(ms: number, fn: () => void): number {
  return setTimeout(fn, ms) as unknown as number;
}

function defaultClear(handle: number): void {
  clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
}
