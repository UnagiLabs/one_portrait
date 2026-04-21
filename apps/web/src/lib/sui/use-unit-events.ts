/**
 * React adapter around {@link subscribeToUnitEvents}.
 *
 * Mounts a per-unit subscription on mount and tears it down on unmount.
 * Handlers are captured in a ref so callers can pass inline arrow
 * functions without triggering resubscription on every render — only
 * `packageId` / `unitId` changes trigger a new subscription.
 */

import { useEffect, useRef } from "react";

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

type HandlerSet = Pick<
  UseUnitEventsArgs,
  "onSubmitted" | "onFilled" | "onMosaicReady"
>;

export function useUnitEvents(args: UseUnitEventsArgs): void {
  const { packageId, unitId } = args;

  const handlersRef = useRef<HandlerSet>({
    onSubmitted: args.onSubmitted,
    onFilled: args.onFilled,
    onMosaicReady: args.onMosaicReady,
  });

  handlersRef.current = {
    onSubmitted: args.onSubmitted,
    onFilled: args.onFilled,
    onMosaicReady: args.onMosaicReady,
  };

  useEffect(() => {
    if (!packageId || !unitId) return;

    const subscribeArgs: SubscribeToUnitEventsArgs = {
      packageId,
      unitId,
      handlers: {
        onSubmitted: (event) => handlersRef.current.onSubmitted?.(event),
        onFilled: (event) => handlersRef.current.onFilled?.(event),
        onMosaicReady: (event) => handlersRef.current.onMosaicReady?.(event),
      },
    };

    const unsubscribe: Unsubscribe = subscribeToUnitEvents(subscribeArgs);
    return unsubscribe;
  }, [packageId, unitId]);
}
