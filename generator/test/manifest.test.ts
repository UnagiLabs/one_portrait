import { unitTileCount } from "@one-portrait/shared";
import { describe, expect, it } from "vitest";

import { buildFinalizeManifest } from "../src";

describe("buildFinalizeManifest", () => {
  it("creates a deterministic manifest from shared catalog data", () => {
    expect(
      buildFinalizeManifest({
        unitId: "unit-1",
        displayName: "Demo Athlete",
        targetWalrusBlobId: "blob-demo",
        tileCount: unitTileCount,
      }),
    ).toEqual({
      generatorName: "ONE Portrait",
      displayName: "Demo Athlete",
      heroCopy: "Fan photos become one portrait.",
      unitId: "unit-1",
      targetWalrusBlobId: "blob-demo",
      tileCount: unitTileCount,
    });
  });
});
