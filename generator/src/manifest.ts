import { appMeta, athleteCatalog } from "@one-portrait/shared";

export type FinalizeManifestInput = {
  unitId: string;
  athleteId: number;
  targetWalrusBlobId: string;
  tileCount: number;
};

export type FinalizeManifest = {
  generatorName: string;
  athleteSlug: string;
  heroCopy: string;
  unitId: string;
  targetWalrusBlobId: string;
  tileCount: number;
};

export function buildFinalizeManifest(
  input: FinalizeManifestInput
): FinalizeManifest {
  const athlete =
    athleteCatalog.find((item) => item.id === input.athleteId) ?? athleteCatalog[0];

  return {
    generatorName: appMeta.name,
    athleteSlug: athlete.slug,
    heroCopy: athlete.heroCopy,
    unitId: input.unitId,
    targetWalrusBlobId: input.targetWalrusBlobId,
    tileCount: input.tileCount
  };
}
