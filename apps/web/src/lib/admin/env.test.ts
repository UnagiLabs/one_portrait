import { describe, expect, it } from "vitest";

import { AdminEnvError, loadAdminRelayEnv } from "./env";

describe("loadAdminRelayEnv", () => {
  it("returns the generator relay config", () => {
    expect(
      loadAdminRelayEnv({
        OP_FINALIZE_DISPATCH_SECRET: "  shared-secret  ",
        OP_GENERATOR_BASE_URL: "  https://generator.example.com/  ",
      }),
    ).toEqual({
      generatorBaseUrl: "https://generator.example.com",
      sharedSecret: "shared-secret",
    });
  });

  it("throws when the relay config is missing", () => {
    expect(() =>
      loadAdminRelayEnv({
        OP_FINALIZE_DISPATCH_SECRET: " ",
        OP_GENERATOR_BASE_URL: "https://generator.example.com",
      }),
    ).toThrow(AdminEnvError);
  });

  it("throws when the generator base url is missing", () => {
    expect(() =>
      loadAdminRelayEnv({
        OP_FINALIZE_DISPATCH_SECRET: "shared-secret",
        OP_GENERATOR_BASE_URL: " ",
      }),
    ).toThrow(AdminEnvError);
  });
});
