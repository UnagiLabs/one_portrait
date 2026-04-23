/**
 * Type boundary for the Sui read layer.
 *
 * UI / route loaders depend on the *view models* defined here — never on the
 * raw `@mysten/sui` response shapes. That keeps the SDK contained inside
 * `apps/web/src/lib/sui/` and lets us swap clients (REST, GraphQL, indexer)
 * without touching the screens.
 *
 * Display metadata (displayName / slug / thumbnail) is **not** part of any
 * view model here. That belongs to `@/lib/catalog`. The two layers share only
 * the `athletePublicId: string` key by design — see `lib/catalog/types.ts` for
 * the rationale.
 */

import type { AthletePublicId } from "../catalog/types";

/**
 * On-chain projection of the `Registry` shared object.
 *
 * The registry stores `current_units: Table<u16, ID>` — to look up the
 * current `Unit` for a given athlete we need the Table's UID
 * (`currentUnitsTableId`), which doubles as the parent id for the dynamic
 * field lookup in {@link AthleteChainRef}.
 */
export type RegistryView = {
  readonly objectId: string;
  readonly athleteMetadataTableId: string;
  readonly currentUnitsTableId: string;
};

export type AthleteMetadataView = {
  readonly athletePublicId: AthletePublicId;
  readonly displayName: string;
  readonly slug: string;
  readonly thumbnailUrl: string;
};

export type RegistryAthleteView = {
  readonly athletePublicId: AthletePublicId;
  readonly currentUnitId: string | null;
  readonly metadata: AthleteMetadataView | null;
};

export type ActiveHomeUnitView = AthleteMetadataView & {
  readonly maxSlots: number;
  readonly submittedCount: number;
  readonly unitId: string;
};

/**
 * Numeric Move u8 values for `Unit.status`.
 *
 * Mirrored verbatim from `contracts/sources/unit.move` so the mapping in
 * {@link normalizeUnitStatus} is auditable from this file alone.
 */
export const UNIT_STATUS_PENDING = 0 as const;
export const UNIT_STATUS_FILLED = 1 as const;
export const UNIT_STATUS_FINALIZED = 2 as const;

/**
 * UI-friendly union of `Unit.status`.
 *
 * Strings, not numbers, so screens can render directly without a second map.
 * `'pending'` maps to the on-chain `STATUS_PENDING` (Move calls this
 * `Filling` in `docs/spec.md` §3.3 — we keep the on-chain naming here to
 * minimise surprises for anyone reading the Move source.)
 */
export type UnitStatus = "pending" | "filled" | "finalized";

/**
 * View model returned to consumers (screens, route loaders, hooks).
 *
 * Field semantics:
 *   - `submittedCount`: length of `Unit.submissions` at fetch time.
 *   - `maxSlots`: copied from `Unit.max_slots` (always `> 0`).
 *   - `masterId`: `null` until the unit reaches `finalized`.
 */
export type AthleteProgressView = {
  readonly unitId: string;
  readonly athletePublicId: AthletePublicId;
  readonly submittedCount: number;
  readonly maxSlots: number;
  readonly status: UnitStatus;
  readonly masterId: string | null;
};

export type MasterPlacementView = {
  readonly x: number;
  readonly y: number;
  readonly submitter: string;
  readonly submissionNo: number;
};

export type MasterPlacementLookupView = {
  readonly masterId: string;
  readonly mosaicWalrusBlobId: string;
  readonly placement: MasterPlacementView | null;
};

export type GalleryEntryView =
  | {
      readonly unitId: string;
      readonly athletePublicId: AthletePublicId;
      readonly walrusBlobId: string;
      readonly submissionNo: number;
      readonly mintedAtMs: number;
      readonly masterId: null;
      readonly mosaicWalrusBlobId: null;
      readonly placement: null;
      readonly status: { readonly kind: "pending" };
    }
  | {
      readonly unitId: string;
      readonly athletePublicId: AthletePublicId;
      readonly walrusBlobId: string;
      readonly submissionNo: number;
      readonly mintedAtMs: number;
      readonly masterId: string;
      readonly mosaicWalrusBlobId: string;
      readonly placement: MasterPlacementView | null;
      readonly status: { readonly kind: "completed" };
    };

/** Convert the on-chain `u8` status into the UI union. */
export function normalizeUnitStatus(value: unknown): UnitStatus {
  if (value === UNIT_STATUS_PENDING) return "pending";
  if (value === UNIT_STATUS_FILLED) return "filled";
  if (value === UNIT_STATUS_FINALIZED) return "finalized";
  throw new Error(`Unknown Unit.status value: ${String(value)}`);
}
