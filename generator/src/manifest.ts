import { appMeta } from "@one-portrait/shared";

export type FinalizeManifestInput = {
  unitId: string;
  displayName: string;
  targetWalrusBlobId: string;
  tileCount: number;
};

export type FinalizeManifest = {
  generatorName: string;
  displayName: string;
  heroCopy: string;
  unitId: string;
  targetWalrusBlobId: string;
  tileCount: number;
};

export function buildFinalizeManifest(
  input: FinalizeManifestInput,
): FinalizeManifest {
  return {
    generatorName: appMeta.name,
    displayName: input.displayName,
    heroCopy: "Fan photos become one portrait.",
    unitId: input.unitId,
    targetWalrusBlobId: input.targetWalrusBlobId,
    tileCount: input.tileCount,
  };
}
