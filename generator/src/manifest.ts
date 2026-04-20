import { appMeta } from "@one-portrait/shared";

type GeneratorAthlete = {
  readonly id: number;
  readonly slug: string;
  readonly heroCopy: string;
};

const generatorAthletes: readonly GeneratorAthlete[] = [
  {
    id: 1,
    slug: "demo-athlete",
    heroCopy: "Fan photos become one portrait.",
  },
] as const;

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
  input: FinalizeManifestInput,
): FinalizeManifest {
  const athlete =
    generatorAthletes.find((item) => item.id === input.athleteId) ??
    generatorAthletes[0];

  return {
    generatorName: appMeta.name,
    athleteSlug: athlete.slug,
    heroCopy: athlete.heroCopy,
    unitId: input.unitId,
    targetWalrusBlobId: input.targetWalrusBlobId,
    tileCount: input.tileCount,
  };
}
