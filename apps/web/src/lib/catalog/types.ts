/**
 * Catalog type boundary for ONE Portrait.
 *
 * The catalog layer owns **display metadata** (name, slug, thumbnail, etc.).
 * The on-chain layer owns the **Registry -> Unit** pointer and nothing else
 * about how the athlete should be rendered.
 *
 * These two concerns intentionally share **only** `athletePublicId` so that:
 *   - Display tweaks (copy changes, new images) never require a chain migration.
 *   - The chain stays cheap and stable (just `athlete_id: u16`).
 *   - A future CMS can replace the catalog without touching chain code.
 */

/**
 * String-normalized form of the on-chain `athlete_id: u16`.
 *
 * The Move package uses `u16` so numeric values are bound to `[0, 65535]`, but
 * we keep the catalog-side representation as a decimal string for three
 * reasons:
 *   1. Some on-chain identifier types elsewhere in the Sui ecosystem are
 *      addresses or `vector<u8>`; standardising on strings here lets us swap
 *      representations later without breaking callers.
 *   2. JSON payloads from a future CMS will almost certainly arrive as strings.
 *   3. `Map<AthletePublicId, ...>` keys behave identically across sources.
 */
export type AthletePublicId = string;

/**
 * Display-side record for a single athlete.
 *
 * This is the ONLY place display fields may live. If a new display field is
 * needed (e.g. `accentColor`, `localeOverrides`), add it here — never on
 * {@link AthleteChainRef}.
 */
export type AthleteCatalogEntry = {
  /** Decimal-string form of the on-chain `athlete_id: u16`. */
  readonly athletePublicId: AthletePublicId;
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
  /** Must match an {@link AthleteCatalogEntry.athletePublicId} to be useful. */
  readonly athletePublicId: AthletePublicId;
  /** Object ID of the current `Unit`, or `null` if no unit has been opened. */
  readonly currentUnitId: string | null;
};
