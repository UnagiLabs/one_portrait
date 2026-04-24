import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const frontendCiWorkflow = readFileSync(
  new URL("../.github/workflows/frontend-ci.yml", import.meta.url),
  "utf8",
);

describe("frontend-ci workflow", () => {
  it("validates the deployment manifest in PR CI", () => {
    expect(frontendCiWorkflow).toMatch(
      /\b(deployment-env\.mjs check-drift|pnpm run check:deployment)\b/,
    );
  });

  it("runs the Web build in PR CI", () => {
    expect(frontendCiWorkflow).toContain("--filter web run build");
  });

  it("validates the Cloudflare dry-run bundle path without deploying", () => {
    expect(frontendCiWorkflow).toContain("--filter web run test:bundle-size");
    expect(frontendCiWorkflow).not.toMatch(
      /\b(opennextjs-cloudflare upload|wrangler deploy|pnpm (?:run )?(?:deploy|upload)|--filter web run (?:deploy|upload))\b/,
    );
  });

  it("does not require Cloudflare credentials in PR CI", () => {
    expect(frontendCiWorkflow).not.toContain("CLOUDFLARE_API_TOKEN");
    expect(frontendCiWorkflow).not.toContain("CLOUDFLARE_ACCOUNT_ID");
  });
});
