/**
 * Static catalog entries for ONE Portrait (MVP).
 *
 * Replace this module with a CMS/JSON fetch later without touching callers —
 * the public helpers in `@/lib/catalog` already expose an async-friendly API.
 *
 * All data here is placeholder. We intentionally do not hardcode real ONE
 * Championship athletes until legal/brand review is complete.
 */

import type { AthleteCatalogEntry } from "../lib/catalog/types";
import { demoUnitId } from "../lib/demo";

export const athleteCatalogEntries: readonly AthleteCatalogEntry[] = [
  {
    unitId: demoUnitId,
    slug: "demo-athlete-one",
    displayName: "Demo Athlete One",
    thumbnailUrl: "https://placehold.co/512x512/png?text=Athlete+1",
  },
  {
    unitId:
      "0x00000000000000000000000000000000000000000000000000000000000000d4",
    slug: "demo-athlete-two",
    displayName: "Demo Athlete Two",
    thumbnailUrl: "https://placehold.co/512x512/png?text=Athlete+2",
  },
  {
    unitId:
      "0x00000000000000000000000000000000000000000000000000000000000000d5",
    slug: "demo-athlete-three",
    displayName: "Demo Athlete Three",
    thumbnailUrl: "https://placehold.co/512x512/png?text=Athlete+3",
  },
] as const;
