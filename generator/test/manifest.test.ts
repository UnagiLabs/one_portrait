import { unitTileCount } from "@one-portrait/shared";
import { describe, expect, it } from "vitest";

import { buildFinalizeManifest } from "../src";

describe("buildFinalizeManifest", () => {
  it("creates a deterministic manifest from shared catalog data", () => {
    expect(
      buildFinalizeManifest({
        unitId: "unit-1",
        athleteId: 1,
        targetWalrusBlobId: "blob-demo",
        tileCount: unitTileCount,
      }),
    ).toEqual({
      generatorName: "ONE Portrait",
      athleteSlug: "demo-athlete",
      heroCopy: "Fan photos become one portrait.",
      unitId: "unit-1",
      targetWalrusBlobId: "blob-demo",
      tileCount: unitTileCount,
    });
  });
});
