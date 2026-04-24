export type RegistryView = {
  readonly objectId: string;
  readonly unitIds: readonly string[];
};

export type AthleteMetadataView = {
  readonly displayName: string;
  readonly slug: string;
  readonly thumbnailUrl: string;
};

export type RegistryAthleteView = {
  readonly currentUnitId: string;
  readonly metadata: AthleteMetadataView;
};

export type ActiveHomeUnitView = {
  readonly displayName: string;
  readonly maxSlots: number;
  readonly submittedCount: number;
  readonly thumbnailUrl: string;
  readonly unitId: string;
};

export const UNIT_STATUS_PENDING = 0 as const;
export const UNIT_STATUS_FILLED = 1 as const;
export const UNIT_STATUS_FINALIZED = 2 as const;

export type UnitStatus = "pending" | "filled" | "finalized";

/**
 * View model returned to consumers (screens, route loaders, hooks).
 *
 * Field semantics:
 *   - `submittedCount`: Progress count shown in the UI, including prefilled
 *     slots for demo units.
 *   - `maxSlots`: Total count shown in the UI, preferring `display_max_slots`.
 *   - `masterId`: `null` until the unit reaches `finalized`.
 */
export type AthleteProgressView = {
  readonly displayName: string;
  readonly masterId: string | null;
  readonly maxSlots: number;
  readonly realMaxSlots: number;
  readonly realSubmittedCount: number;
  readonly status: UnitStatus;
  readonly submittedCount: number;
  readonly thumbnailUrl: string;
  readonly unitId: string;
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
      readonly displayName: string;
      readonly walrusBlobId: string;
      readonly kakeraObjectId?: string;
      readonly submissionNo: number;
      readonly mintedAtMs: number;
      readonly masterId: null;
      readonly mosaicWalrusBlobId: null;
      readonly placement: null;
      readonly status: { readonly kind: "pending" };
    }
  | {
      readonly unitId: string;
      readonly displayName: string;
      readonly walrusBlobId: string;
      readonly kakeraObjectId?: string;
      readonly submissionNo: number;
      readonly mintedAtMs: number;
      readonly masterId: string;
      readonly mosaicWalrusBlobId: string;
      readonly placement: MasterPlacementView | null;
      readonly status: { readonly kind: "completed" };
    };

export function normalizeUnitStatus(value: unknown): UnitStatus {
  if (value === UNIT_STATUS_PENDING) return "pending";
  if (value === UNIT_STATUS_FILLED) return "filled";
  if (value === UNIT_STATUS_FINALIZED) return "finalized";
  throw new Error(`Unknown Unit.status value: ${String(value)}`);
}
