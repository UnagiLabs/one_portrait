// @ts-expect-error `.open-next/worker.js` is generated at build time.
import { default as handler } from "../.open-next/worker.js";

export { MosaicGeneratorContainer } from "./lib/finalize/mosaic-generator-container";

export default {
  fetch: handler.fetch,
} satisfies ExportedHandler<CloudflareEnv>;
