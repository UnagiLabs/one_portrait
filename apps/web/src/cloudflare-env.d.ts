import type { MosaicGeneratorContainer } from "./lib/finalize/mosaic-generator-container";

declare global {
  interface CloudflareEnv {
    MOSAIC_GENERATOR?: DurableObjectNamespace<MosaicGeneratorContainer>;
  }
}

export {};
