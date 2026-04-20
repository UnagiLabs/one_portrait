/**
 * Public catalog API for ONE Portrait.
 *
 * Every consumer outside this folder should import from
 * `apps/web/src/lib/catalog` (this barrel), not from sibling files directly.
 * Keeping the surface area pinned here makes it trivial to later swap the
 * static TS data source for a CMS / JSON manifest without touching callers.
 */

export {
  getAthleteByPublicId,
  getAthleteBySlug,
  getAthleteCatalog,
} from "./athlete-catalog";
export type {
  AthleteCatalogEntry,
  AthleteChainRef,
  AthletePublicId,
} from "./types";
