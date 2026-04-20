/**
 * Public API of the Sui read layer.
 *
 * Anything outside `apps/web/src/lib/sui/` MUST import from this barrel —
 * never from sibling files directly. That keeps the SDK surface contained
 * and makes it trivial to swap clients (REST, GraphQL, indexer) later.
 */

export type { SuiReadClient, SuiSubscriptionClient } from "./client";
export { createSuiClient, getSuiClient, resolveFullnodeUrl } from "./client";
export type {
  MosaicReadyEvent,
  RawSuiEventLike,
  SubmittedEvent,
  UnitEvent,
  UnitFilledEvent,
} from "./event-types";
export {
  parseMosaicReadyEvent,
  parseSubmittedEvent,
  parseUnitFilledEvent,
} from "./event-types";
export type {
  SubscribeToUnitEventsArgs,
  UnitEventHandlers,
  Unsubscribe,
} from "./events";
export { subscribeToUnitEvents } from "./events";
export {
  getCurrentUnitIdForAthlete,
  getRegistryObject,
  RegistryNotFoundError,
} from "./registry";
export type {
  AthleteProgressView,
  RegistryView,
  UnitStatus,
} from "./types";
export {
  UNIT_STATUS_FILLED,
  UNIT_STATUS_FINALIZED,
  UNIT_STATUS_PENDING,
} from "./types";
export { getUnitProgress, UnitNotFoundError } from "./unit";
export type { UseUnitEventsArgs } from "./use-unit-events";
export { useUnitEvents } from "./use-unit-events";
