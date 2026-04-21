/**
 * Athlete catalog lookup helpers.
 *
 * Callers should use the re-exports from `./index`, not this module directly.
 *
 * All getters are declared `async` on purpose: the MVP reads a static TS
 * module, but the production path will hit a CMS / signed JSON manifest. Fixing
 * the shape to `async` now means the later swap is internal — nothing in the
 * UI layer has to change.
 */

import { athleteCatalogEntries } from "../../data/athlete-catalog";
import type { AthleteCatalogEntry, AthletePublicId } from "./types";

export async function getAthleteCatalog(): Promise<
  readonly AthleteCatalogEntry[]
> {
  return athleteCatalogEntries;
}

export async function getAthleteBySlug(
  slug: string,
): Promise<AthleteCatalogEntry | undefined> {
  const catalog = await getAthleteCatalog();
  return catalog.find((entry) => entry.slug === slug);
}

export async function getAthleteByPublicId(
  athletePublicId: AthletePublicId,
): Promise<AthleteCatalogEntry | undefined> {
  const catalog = await getAthleteCatalog();
  return catalog.find((entry) => entry.athletePublicId === athletePublicId);
}
