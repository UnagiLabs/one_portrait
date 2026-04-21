import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("development entrypoints", () => {
  it("exposes root scripts for normal dev and E2E", () => {
    const rootPackageJson = readPackageJson(path.join(repoRoot, "package.json"));

    expect(rootPackageJson.scripts.dev).toBe(
      'corepack pnpm --filter web dev',
    );
    expect(rootPackageJson.scripts["dev:e2e"]).toBe(
      'corepack pnpm --filter web dev:e2e',
    );
    expect(rootPackageJson.scripts["test:e2e"]).toBe(
      'corepack pnpm --filter web test:e2e',
    );
  });

  it("keeps the web workspace E2E startup explicit", () => {
    const webPackageJson = readPackageJson(
      path.join(repoRoot, "apps/web/package.json"),
    );

    expect(webPackageJson.scripts.dev).toBe("node ./scripts/run-dev.mjs");
    expect(webPackageJson.scripts["dev:e2e"]).toBe("./scripts/e2e-dev.sh");
    expect(webPackageJson.scripts["test:e2e"]).toBe("playwright test");
  });
});

function readPackageJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
