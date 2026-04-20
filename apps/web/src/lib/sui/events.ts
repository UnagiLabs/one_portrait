/**
 * Per-unit event subscription helper.
 *
 * Public surface is intentionally tiny — `subscribeToUnitEvents` returns an
 * `unsubscribe` function and dispatches the three on-chain events the screens
 * actually care about (`SubmittedEvent`, `UnitFilledEvent`, `MosaicReadyEvent`).
 *
 * Implementation notes:
 *   - `@mysten/sui` v2 dropped `subscribeEvent` (see CHANGELOG entry for
 *     v1.0.0). We poll `queryEvents` instead with a `MoveEventModule` filter
 *     scoped to `<packageId>::events`. That keeps the surface compatible with
 *     a future WebSocket-based implementation: callers still get `unsubscribe`.
 *   - We track a `cursor` so each poll only sees events newer than the last
 *     one we processed. `null` cursor on first call yields the historical
 *     backlog — for the MVP that's acceptable (handlers are idempotent on
 *     the screen side).
 *   - `unit_id` filtering happens client-side: the on-chain filter granularity
 *     is module, not object id.
 *   - Errors during a poll are swallowed so a transient RPC blip doesn't kill
 *     the subscription. Hard failures should surface via UI-level retries.
 *
 * Out of scope (deferred to later issues):
 *   - Reconnect / exponential backoff.
 *   - Cross-tab dedup.
 *   - WebSocket transport.
 */

import { getSuiClient, type SuiSubscriptionClient } from "./client";
import {
  type MosaicReadyEvent,
  parseMosaicReadyEvent,
  parseSubmittedEvent,
  parseUnitFilledEvent,
  type RawSuiEventLike,
  type SubmittedEvent,
  type UnitFilledEvent,
} from "./event-types";

const EVENTS_MODULE_NAME = "events";
const DEFAULT_POLL_INTERVAL_MS = 4_000;
const MAX_PAGE_SIZE = 50;

export type UnitEventHandlers = {
  readonly onSubmitted?: (event: SubmittedEvent) => void;
  readonly onFilled?: (event: UnitFilledEvent) => void;
  readonly onMosaicReady?: (event: MosaicReadyEvent) => void;
};

export type SubscribeToUnitEventsArgs = {
  readonly packageId: string;
  readonly unitId: string;
  readonly handlers: UnitEventHandlers;
  readonly client?: SuiSubscriptionClient;
  readonly intervalMs?: number;
};

export type Unsubscribe = () => void;

type CursorLike = { txDigest: string; eventSeq: string };

export function subscribeToUnitEvents(
  args: SubscribeToUnitEventsArgs,
): Unsubscribe {
  const client = args.client ?? getSuiClient();
  const intervalMs = args.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  let cursor: CursorLike | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const poll = async (): Promise<void> => {
    if (stopped) return;
    try {
      let hasNextPage = true;
      while (!stopped && hasNextPage) {
        const response = await client.queryEvents({
          query: {
            MoveEventModule: {
              module: EVENTS_MODULE_NAME,
              package: args.packageId,
            },
          },
          cursor,
          limit: MAX_PAGE_SIZE,
          order: "ascending",
        });

        for (const raw of response.data) {
          dispatchEvent(raw, args.unitId, args.handlers);
        }

        const next = response.nextCursor;
        if (next && typeof next.txDigest === "string") {
          cursor = { txDigest: next.txDigest, eventSeq: next.eventSeq };
        }
        hasNextPage = response.hasNextPage === true;
      }
    } catch {
      // Swallow transient RPC failures — the next tick will retry. We
      // intentionally don't log here; surfacing transport errors to the UI
      // belongs to a higher layer.
    } finally {
      if (!stopped) {
        timer = setTimeout(() => {
          void poll();
        }, intervalMs);
      }
    }
  };

  // Kick off the first poll on the next microtask so callers receive the
  // unsubscribe handle before any handler can fire.
  queueMicrotask(() => {
    void poll();
  });

  return () => {
    stopped = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

function dispatchEvent(
  raw: unknown,
  unitId: string,
  handlers: UnitEventHandlers,
): void {
  if (!isRawEvent(raw)) return;

  const moveEventName = extractMoveEventName(raw.type);
  switch (moveEventName) {
    case "SubmittedEvent": {
      if (!handlers.onSubmitted) return;
      const event = parseSubmittedEvent(raw);
      if (event.unitId !== unitId) return;
      handlers.onSubmitted(event);
      return;
    }
    case "UnitFilledEvent": {
      if (!handlers.onFilled) return;
      const event = parseUnitFilledEvent(raw);
      if (event.unitId !== unitId) return;
      handlers.onFilled(event);
      return;
    }
    case "MosaicReadyEvent": {
      if (!handlers.onMosaicReady) return;
      const event = parseMosaicReadyEvent(raw);
      if (event.unitId !== unitId) return;
      handlers.onMosaicReady(event);
      return;
    }
    default:
      return;
  }
}

function isRawEvent(value: unknown): value is RawSuiEventLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string" &&
    "parsedJson" in (value as Record<string, unknown>)
  );
}

function extractMoveEventName(type: string): string {
  // type looks like "0xpkg::events::SubmittedEvent"; we only care about
  // the trailing struct name to dispatch.
  const parts = type.split("::");
  return parts[parts.length - 1] ?? "";
}
