import { getCloudflareContext } from "@opennextjs/cloudflare";

import type { GeneratorRuntimeCloudflareEnv } from "./generator-runtime";

export function getRequestCloudflareEnv(): GeneratorRuntimeCloudflareEnv | null {
  try {
    return getCloudflareContext().env as GeneratorRuntimeCloudflareEnv;
  } catch {
    return null;
  }
}
