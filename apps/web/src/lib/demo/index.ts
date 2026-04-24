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
      displayName: "Demo Athlete One",
      submittedCount: 347,
      maxSlots: unitTileCount,
      realMaxSlots: unitTileCount,
      realSubmittedCount: 347,
      status: "pending",
      masterId: null,
      thumbnailUrl: "https://placehold.co/512x512/png?text=Athlete+1",
    },
  ],
]);

const demoGalleryEntries = [
  {
    unitId: demoUnitId,
    displayName: "Demo Athlete One",
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
    displayName: "Demo Athlete Two",
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

export function getDemoUnitProgress(
  unitId: string,
): AthleteProgressView | null {
  return demoProgressByUnitId.get(unitId) ?? null;
}

export function getDemoGalleryEntries(): readonly GalleryEntryView[] {
  return demoGalleryEntries;
}
