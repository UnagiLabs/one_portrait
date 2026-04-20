/**
 * Public API of the Sui read layer.
 *
 * Anything outside `apps/web/src/lib/sui/` MUST import from this barrel —
 * never from sibling files directly. That keeps the SDK surface contained
 * and makes it trivial to swap clients (REST, GraphQL, indexer) later.
 */

export type { SuiReadClient } from "./client";
export { createSuiClient, getSuiClient, resolveFullnodeUrl } from "./client";
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
