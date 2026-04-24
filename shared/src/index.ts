import {
  renderedMosaicSize,
  renderedMosaicTileSizePx,
  unitTileCount,
  unitTileGrid,
} from "./config";

export const appMeta = {
  name: "ONE Portrait",
  tagline: "Your Smile Becomes Their Strength",
} as const;

export type MosaicRgb = {
  readonly blue: number;
  readonly green: number;
  readonly red: number;
};

export type GeneratorSubmissionRef = {
  readonly submissionNo: number;
  readonly submitter: string;
  readonly submittedAtMs: number;
  readonly walrusBlobId: string;
};

export type GeneratorUnitSnapshot = {
  readonly athleteId: number;
  readonly displayMaxSlots: number;
  readonly submissions: readonly GeneratorSubmissionRef[];
  readonly targetWalrusBlobId: string;
  readonly unitId: string;
};

export {
  renderedMosaicSize,
  renderedMosaicTileSizePx,
  unitTileCount,
  unitTileGrid,
};
