import { appMeta, requiredWebEnvKeys } from "@one-portrait/shared";
import { describe, expect, it } from "vitest";

describe("workspace foundation", () => {
  it("exposes shared metadata through the workspace package", () => {
    expect(appMeta.name).toBe("ONE Portrait");
    expect(requiredWebEnvKeys).toContain("NEXT_PUBLIC_SUI_NETWORK");
  });
});
