import { unitTileCount } from "@one-portrait/shared";

import type { AthleteProgressView, GalleryEntryView } from "../sui";

export const demoPackageId =
  "0x00000000000000000000000000000000000000000000000000000000000000d0";
export const demoRegistryObjectId =
  "0x00000000000000000000000000000000000000000000000000000000000000d1";
export const demoUnitId =
  "0x00000000000000000000000000000000000000000000000000000000000000d2";
export const demoMasterId =
  "0x00000000000000000000000000000000000000000000000000000000000000d3";

const demoProgressByUnitId = new Map<string, AthleteProgressView>([
  [
    demoUnitId,
    {
      unitId: demoUnitId,
      athletePublicId: "1",
      submittedCount: 347,
      maxSlots: unitTileCount,
      status: "pending",
      masterId: null,
    },
  ],
]);

const demoCurrentUnitIdsByAthlete = new Map<string, string | null>([
  ["1", demoUnitId],
  ["2", null],
  ["3", null],
]);

const demoGalleryEntries = [
  {
    unitId: demoUnitId,
    athletePublicId: "1",
    walrusBlobId: "demo-original-one",
    submissionNo: 347,
    mintedAtMs: 1_800_000_000_000,
    masterId: demoMasterId,
    mosaicWalrusBlobId: "demo-mosaic-one",
    placement: {
      x: 12,
      y: 8,
      submitter: "0xdemo-viewer",
      submissionNo: 347,
    },
    status: { kind: "completed" },
  },
  {
    unitId:
      "0x00000000000000000000000000000000000000000000000000000000000000d4",
    athletePublicId: "2",
    walrusBlobId: "demo-original-two",
    submissionNo: 88,
    mintedAtMs: 1_790_000_000_000,
    masterId: null,
    mosaicWalrusBlobId: null,
    placement: null,
    status: { kind: "pending" },
  },
] satisfies readonly GalleryEntryView[];

export function isDemoModeEnabled(
  source: Readonly<Record<string, string | undefined>>,
): boolean {
  return source.NEXT_PUBLIC_DEMO_MODE === "1";
}

export function getDemoModeSource(): Readonly<
  Record<"NEXT_PUBLIC_DEMO_MODE", string | undefined>
> {
  return {
    NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
  };
}

export function getDemoCurrentUnitIdForAthlete(
  athletePublicId: string,
): string | null {
  return demoCurrentUnitIdsByAthlete.get(athletePublicId) ?? null;
}

export function getDemoUnitProgress(
  unitId: string,
): AthleteProgressView | null {
  return demoProgressByUnitId.get(unitId) ?? null;
}

export function getDemoGalleryEntries(): readonly GalleryEntryView[] {
  return demoGalleryEntries;
}
