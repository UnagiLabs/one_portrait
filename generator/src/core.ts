/**
 * Pure mosaic-generation entrypoint.
 *
 * This barrel intentionally excludes Sui/Walrus runtime wiring so that
 * callers who only need local image generation can import from here
 * without touching chain-specific integration code.
 */

export {
  assignGreedyPlacements,
  DEFAULT_MOSAIC_COLUMNS,
  DEFAULT_MOSAIC_ROWS,
  DEFAULT_TILE_SIZE_PX,
  type MosaicPlacement,
  type TargetTile,
} from "./assignment";
export {
  buildMosaicCompositionPlan,
  composeMosaicPng,
  createSharpAverageColorSampler,
  extractTargetTiles,
  type MosaicCompositionPlan,
  type MosaicCompositionTile,
} from "./image";
export type { FinalizeManifest, FinalizeManifestInput } from "./manifest";
export { buildFinalizeManifest } from "./manifest";
export type {
  GeneratedFinalizeMosaic,
  GeneratedMosaic,
  GenerateFinalizeMosaicInput,
  GenerateMosaicInput,
  MosaicGrid,
  MosaicTileInput,
  TargetAnalysis,
  TargetAnalysisCell,
} from "./mosaic";
export {
  FINALIZE_MOSAIC_CONTENT_TYPE,
  FINALIZE_MOSAIC_HEIGHT,
  FINALIZE_MOSAIC_TILE_SIZE,
  FINALIZE_MOSAIC_WEBP_QUALITY,
  FINALIZE_MOSAIC_WIDTH,
  generateFinalizeMosaic,
  generateMosaic,
} from "./mosaic";
export {
  type PreparedFinalizeInput,
  type PreparedSubmission,
  type PrepareFinalizeDeps,
  prepareFinalizeInput,
  sortSubmissions,
} from "./prepare";
