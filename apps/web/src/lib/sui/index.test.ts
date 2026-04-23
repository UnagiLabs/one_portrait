import { describe, expect, it } from "vitest";

import * as suiPublicApi from "./index";

describe("sui barrel", () => {
  it("re-exports the read-client helpers", () => {
    expect(typeof suiPublicApi.getSuiClient).toBe("function");
    expect(typeof suiPublicApi.createSuiClient).toBe("function");
  });

  it("re-exports the registry helpers", () => {
    expect(typeof suiPublicApi.getRegistryObject).toBe("function");
    expect(typeof suiPublicApi.getCurrentUnitIdForAthlete).toBe("function");
    expect(typeof suiPublicApi.listRegistryAthletes).toBe("function");
    expect(typeof suiPublicApi.getActiveHomeUnits).toBe("function");
  });

  it("re-exports the unit helper", () => {
    expect(typeof suiPublicApi.getUnitProgress).toBe("function");
  });

  it("re-exports the submission execution helper", () => {
    expect(typeof suiPublicApi.checkSubmissionExecution).toBe("function");
  });
});
