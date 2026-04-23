import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  AdminEnvError,
  loadAdminRelayEnv,
  loadCloudflareAdminRelayEnv,
} from "./env";

describe("loadAdminRelayEnv", () => {
  it("returns the generator relay config", () => {
    expect(
      loadAdminRelayEnv({
        OP_FINALIZE_DISPATCH_SECRET: "  shared-secret  ",
        OP_GENERATOR_RUNTIME_URL_OVERRIDE: "  https://generator.example.com/  ",
      }),
    ).toEqual({
      generatorBaseUrl: "https://generator.example.com",
      sharedSecret: "shared-secret",
    });
  });

  it("reads the runtime state file before legacy env", () => {
    const appRootPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "one-portrait-admin-env-"),
    );
    const cacheDir = path.join(appRootPath, ".cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, "generator-runtime.json"),
      JSON.stringify({
        mode: "quick",
        pid: process.pid,
        updatedAt: new Date().toISOString(),
        url: "https://runtime-state.example.com/",
        version: 1,
      }),
    );

    expect(() =>
      loadAdminRelayEnv(
        {
          OP_FINALIZE_DISPATCH_SECRET: "shared-secret",
          OP_GENERATOR_BASE_URL: "https://legacy-env.example.com",
        },
        { appRootPath },
      ),
    ).not.toThrow();

    expect(
      loadAdminRelayEnv(
        {
          OP_FINALIZE_DISPATCH_SECRET: "shared-secret",
          OP_GENERATOR_BASE_URL: "https://legacy-env.example.com",
        },
        { appRootPath },
      ),
    ).toEqual({
      generatorBaseUrl: "https://runtime-state.example.com",
      sharedSecret: "shared-secret",
    });
  });

  it("throws when the relay secret is missing", () => {
    expect(() =>
      loadAdminRelayEnv({
        OP_FINALIZE_DISPATCH_SECRET: " ",
      }),
    ).toThrow(AdminEnvError);
  });

  it("throws when legacy env values conflict", () => {
    expect(() =>
      loadAdminRelayEnv({
        OP_FINALIZE_DISPATCH_SECRET: "shared-secret",
        OP_FINALIZE_DISPATCH_URL: "https://dispatch.example.com",
        OP_GENERATOR_BASE_URL: "https://generator.example.com",
      }),
    ).toThrow(AdminEnvError);
  });
});

describe("loadCloudflareAdminRelayEnv", () => {
  it("reads the generator relay config from worker kv", async () => {
    await expect(
      loadCloudflareAdminRelayEnv({
        OP_FINALIZE_DISPATCH_SECRET: "request-secret",
        OP_GENERATOR_RUNTIME_KV: {
          get: async () => ({
            mode: "quick",
            updatedAt: new Date().toISOString(),
            url: "https://worker-kv.example.com/",
            version: 1,
          }),
        },
      }),
    ).resolves.toEqual({
      generatorBaseUrl: "https://worker-kv.example.com",
      sharedSecret: "request-secret",
    });
  });
});
