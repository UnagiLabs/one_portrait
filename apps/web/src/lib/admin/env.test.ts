import { describe, expect, it } from "vitest";

import { AdminEnvError, loadAdminAuthEnv, loadAdminRelayEnv } from "./env";

describe("loadAdminAuthEnv", () => {
  it("returns normalized basic auth credentials", () => {
    expect(
      loadAdminAuthEnv({
        OP_ADMIN_BASIC_AUTH_PASSWORD: "  secret-pass  ",
        OP_ADMIN_BASIC_AUTH_USERNAME: "  demo-admin  ",
      }),
    ).toEqual({
      password: "secret-pass",
      username: "demo-admin",
    });
  });

  it("throws when either basic auth field is missing", () => {
    expect(() =>
      loadAdminAuthEnv({
        OP_ADMIN_BASIC_AUTH_PASSWORD: "secret-pass",
        OP_ADMIN_BASIC_AUTH_USERNAME: " ",
      }),
    ).toThrow(AdminEnvError);
  });
});

describe("loadAdminRelayEnv", () => {
  it("returns the generator relay config without requiring admin keys", () => {
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
});
