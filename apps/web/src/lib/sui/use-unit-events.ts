/**
 * React adapter around {@link subscribeToUnitEvents}.
 *
 * Mounts a per-unit subscription on mount and tears it down on unmount.
 * Handlers are invoked synchronously inside the polling loop's microtask;
 * callers are expected to wrap any state updates with React's batching
 * rules (the standard `setState` in a handler is fine).
 *
 * The hook intentionally does **not** own the handler identity (no
 * memoised wrapper). Callers should pass stable handlers if they want
 * to avoid resubscription churn — for the MVP a single subscription per
 * mount is enough.
 */

import { useEffect } from "react";

import type {
  MosaicReadyEvent,
  SubmittedEvent,
  UnitFilledEvent,
} from "./event-types";
import {
  type SubscribeToUnitEventsArgs,
  subscribeToUnitEvents,
  type Unsubscribe,
} from "./events";

export type UseUnitEventsArgs = {
  readonly packageId: string;
  readonly unitId: string;
  readonly onSubmitted?: (event: SubmittedEvent) => void;
  readonly onFilled?: (event: UnitFilledEvent) => void;
  readonly onMosaicReady?: (event: MosaicReadyEvent) => void;
};

export function useUnitEvents(args: UseUnitEventsArgs): void {
  const { packageId, unitId, onSubmitted, onFilled, onMosaicReady } = args;

  useEffect(() => {
    if (!packageId || !unitId) return;

    const subscribeArgs: SubscribeToUnitEventsArgs = {
      packageId,
      unitId,
      handlers: {
        onSubmitted: onSubmitted ? (event) => onSubmitted(event) : undefined,
        onFilled: onFilled ? (event) => onFilled(event) : undefined,
        onMosaicReady: onMosaicReady
          ? (event) => onMosaicReady(event)
          : undefined,
      },
    };

    const unsubscribe: Unsubscribe = subscribeToUnitEvents(subscribeArgs);
    return unsubscribe;
  }, [packageId, unitId, onSubmitted, onFilled, onMosaicReady]);
}
