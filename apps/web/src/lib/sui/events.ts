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
 *   - Poll errors are reported via the optional `onError` handler so the UI
 *     can surface transient failures without killing the subscription.
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
// Demo scale: 2,000 slots × 1 unit live during reveal. At 4s poll + 50 events/page
// the worst-case throughput is 12.5 events/s before we start paging — well
// above expected submission cadence. Bump if we ever host multiple units
// concurrently.
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
  readonly onError?: (error: unknown) => void;
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
        const nextCursor =
          next &&
          typeof next.txDigest === "string" &&
          typeof next.eventSeq === "string"
            ? { txDigest: next.txDigest, eventSeq: next.eventSeq }
            : null;

        // Guard against a misbehaving fullnode that reports hasNextPage=true
        // but fails to advance the cursor — without this check we'd loop
        // forever on the same page.
        if (
          response.hasNextPage === true &&
          nextCursor !== null &&
          !cursorsEqual(cursor, nextCursor)
        ) {
          cursor = nextCursor;
          hasNextPage = true;
        } else {
          if (nextCursor !== null) cursor = nextCursor;
          hasNextPage = false;
        }
      }
    } catch (error) {
      args.onError?.(error);
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

function cursorsEqual(a: CursorLike | null, b: CursorLike | null): boolean {
  if (a === null || b === null) return a === b;
  return a.txDigest === b.txDigest && a.eventSeq === b.eventSeq;
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
