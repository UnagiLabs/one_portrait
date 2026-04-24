/**
 * Catalog type boundary for ONE Portrait.
 *
 * The catalog layer owns demo/display metadata for known Units.
 * Live chain data now carries its own display name and thumbnail on Unit,
 * so `unitId` is the only catalog key.
 */

/**
 * Display-side record for a single athlete.
 *
 * This is the ONLY place display fields may live. If a new display field is
 * needed (e.g. `accentColor`, `localeOverrides`), add it here — never on
 * {@link AthleteChainRef}.
 */
export type AthleteCatalogEntry = {
  /** Object ID of the current demo/display Unit. */
  readonly unitId: string;
  /** URL-safe identifier used in routes like `/athletes/[slug]`. */
  readonly slug: string;
  /** Human-readable name shown in UI. */
  readonly displayName: string;
  /** Absolute URL for the athlete thumbnail (served from Walrus or CDN). */
  readonly thumbnailUrl: string;
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
