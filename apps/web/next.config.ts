import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@one-portrait/shared"],
};

const shouldInitCloudflareDev =
  process.env.NODE_ENV !== "production" &&
  !process.env.OP_LOCAL_FINALIZE_URL?.trim();

if (shouldInitCloudflareDev) {
  initOpenNextCloudflareForDev();
}

export default nextConfig;
