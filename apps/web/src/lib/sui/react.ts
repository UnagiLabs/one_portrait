/**
 * Client-only React adapters around the Sui read layer.
 *
 * Deliberately separated from `./index` so the server barrel stays free of
 * client-only APIs (`useEffect`, `useRef`). Turbopack/Next.js traces imports
 * transitively: if the server barrel re-exported this hook, every RSC that
 * imports any RPC helper from `@/lib/sui` would inherit the client graph and
 * `next build` would fail with "You're importing a module that depends on
 * `useEffect` into a React Server Component module."
 *
 * Import from this path ONLY in Client Components (files tagged
 * `"use client"`). Anything else should import from `@/lib/sui`.
 */

export type { KakeraOwnedClient, OwnedKakera } from "./kakera";
export type {
  UseOwnedKakeraArgs,
  UseOwnedKakeraResult,
  UseOwnedKakeraStatus,
} from "./use-owned-kakera";
export {
  OWNED_KAKERA_DEFAULT_INTERVAL_MS,
  OWNED_KAKERA_DEFAULT_MAX_ATTEMPTS,
  useOwnedKakera,
} from "./use-owned-kakera";
export type { UseUnitEventsArgs } from "./use-unit-events";
export { useUnitEvents } from "./use-unit-events";
