/**
 * Catalog type boundary for ONE Portrait.
 *
 * The catalog layer owns demo/display metadata for known athletes.
 * A catalog entry may be used before a Unit exists, so `unitId` is optional.
 */

/**
 * Display-side record for a single athlete.
 *
 * This is the ONLY place display fields may live. If a new display field is
 * needed (e.g. `accentColor`, `localeOverrides`), add it here — never on
 * {@link AthleteChainRef}.
 */
export type AthleteCatalogEntry = {
  /** Object ID of the current demo/display Unit, when one exists. */
  readonly unitId?: string;
  /** URL-safe identifier used in routes like `/athletes/[slug]`. */
  readonly slug: string;
  /** Human-readable name shown in UI. */
  readonly displayName: string;
  /** Absolute URL for the athlete thumbnail (served from Walrus or CDN). */
  readonly thumbnailUrl: string;
  /** Region label shown in catalog-driven UI. */
  readonly region?: string;
  /** Short availability label shown in catalog-driven UI. */
  readonly status?: string;
};

/**
 * Place-holder shape for the on-chain projection of a `Registry` entry.
 *
 * STEP 2 only declares the type; STEP 3 wires it to the Sui SDK. The shape is
 * deliberately minimal so a compile-time check prevents display metadata from
 * leaking in: if someone tries to add `displayName` here, the catalog tests'
 * `@ts-expect-error` lines flip and the build fails.
 */
export type AthleteChainRef = {
  /** Object ID of the current `Unit`, or `null` if no unit has been opened. */
  readonly unitId: string | null;
};
