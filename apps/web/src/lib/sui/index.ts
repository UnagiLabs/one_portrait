/**
 * Public API of the Sui read layer (server- and client-neutral).
 *
 * Anything outside `apps/web/src/lib/sui/` MUST import from this barrel —
 * never from sibling files directly — for everything **except** the React
 * hook adapter, which lives in `./react` to keep the RSC graph free of
 * client-only imports (see `./react.ts` for the rationale).
 *
 * Keeping the barrel split means:
 *   - Server Components (`app/page.tsx`, `app/units/[unitId]/page.tsx`) can
 *     freely import RPC helpers from `@/lib/sui` without Turbopack dragging
 *     `useEffect` / `useRef` into the server graph.
 *   - Client Components import the hook from `@/lib/sui/react` explicitly,
 *     documenting the boundary at the import site.
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
export { getFinalizeUnitSnapshot } from "./finalize";
export {
  getGalleryEntry,
  getMasterPlacement,
  MasterPortraitNotFoundError,
} from "./gallery";
export type {
  FindKakeraForSubmissionArgs,
  FindOwnedKakeraForUnitArgs,
  KakeraOwnedClient,
  ListOwnedKakeraArgs,
  OwnedKakera,
} from "./kakera";
export {
  findKakeraForSubmission,
  findOwnedKakeraForUnit,
  listOwnedKakera,
} from "./kakera";
export {
  getCurrentUnitIdForAthlete,
  getRegistryObject,
  RegistryNotFoundError,
} from "./registry";
export type {
  AthleteProgressView,
  GalleryEntryView,
  MasterPlacementLookupView,
  MasterPlacementView,
  RegistryView,
  UnitStatus,
} from "./types";
export {
  UNIT_STATUS_FILLED,
  UNIT_STATUS_FINALIZED,
  UNIT_STATUS_PENDING,
} from "./types";
export { getUnitProgress, UnitNotFoundError } from "./unit";
