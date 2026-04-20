import { appMeta } from "@one-portrait/shared";
import { describe, expect, it } from "vitest";
import { publicEnvKeys } from "../apps/web/src/lib/env";

describe("workspace foundation", () => {
  it("exposes shared metadata through the workspace package", () => {
    expect(appMeta.name).toBe("ONE Portrait");
    expect(appMeta.tagline).toBe("Your Smile Becomes Their Strength");
  });

  it("centralises the required public env keys in apps/web", () => {
    expect(publicEnvKeys).toContain("NEXT_PUBLIC_SUI_NETWORK");
    expect(publicEnvKeys).toContain("NEXT_PUBLIC_REGISTRY_OBJECT_ID");
  });
});
