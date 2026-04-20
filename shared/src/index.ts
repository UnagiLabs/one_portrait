import { athleteCatalog } from "./catalog";
import {
  renderedMosaicSize,
  renderedMosaicTileSizePx,
  unitTileCount,
  unitTileGrid,
} from "./config";
import { requiredWebEnvKeys } from "./env";

export const appMeta = {
  name: "ONE Portrait",
  tagline: "Your Smile Becomes Their Strength",
} as const;

export {
  athleteCatalog,
  renderedMosaicSize,
  renderedMosaicTileSizePx,
  requiredWebEnvKeys,
  unitTileCount,
  unitTileGrid,
};
