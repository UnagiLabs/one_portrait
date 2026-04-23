import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  resolveCloudflareGeneratorRuntime,
  resolveGeneratorRuntime,
} from "./generator-runtime";

const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe("resolveGeneratorRuntime", () => {
  it("prefers the shell override over runtime state and legacy env", () => {
    const appRootPath = createAppRootWithRuntimeState({
      pid: process.pid,
      updatedAt: new Date().toISOString(),
      url: "https://runtime-state.example.com",
    });

    expect(
      resolveGeneratorRuntime({
        appRootPath,
        env: {
          OP_FINALIZE_DISPATCH_URL: "https://legacy-dispatch.example.com",
          OP_GENERATOR_BASE_URL: "https://legacy-generator.example.com",
          OP_GENERATOR_RUNTIME_URL_OVERRIDE: "https://override.example.com",
        },
      }),
    ).toEqual({
      source: "override",
      status: "ok",
      url: "https://override.example.com",
    });
  });

  it("prefers runtime state over legacy env", () => {
    const appRootPath = createAppRootWithRuntimeState({
      pid: process.pid,
      updatedAt: new Date().toISOString(),
      url: "https://runtime-state.example.com/",
    });

    expect(
      resolveGeneratorRuntime({
        appRootPath,
        env: {
          OP_FINALIZE_DISPATCH_URL: "https://legacy-dispatch.example.com",
        },
      }),
    ).toEqual({
      source: "runtime_state",
      status: "ok",
      url: "https://runtime-state.example.com",
    });
  });

  it("ignores stale runtime state when the recorded process is gone", () => {
    const appRootPath = createAppRootWithRuntimeState({
      pid: 999_999,
      updatedAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
      url: "https://runtime-state.example.com",
    });

    expect(
      resolveGeneratorRuntime({
        appRootPath,
        env: {
          OP_GENERATOR_BASE_URL: "https://legacy-generator.example.com",
        },
        isProcessAlive: () => false,
      }),
    ).toEqual({
      source: "legacy_env",
      status: "ok",
      url: "https://legacy-generator.example.com",
    });
  });

  it("returns misconfigured when legacy env values disagree", () => {
    expect(
      resolveGeneratorRuntime({
        env: {
          OP_FINALIZE_DISPATCH_URL: "https://dispatch.example.com",
          OP_GENERATOR_BASE_URL: "https://generator.example.com",
        },
      }),
    ).toEqual({
      message:
        "`OP_GENERATOR_BASE_URL` と `OP_FINALIZE_DISPATCH_URL` の値が一致していません。",
      source: "none",
      status: "misconfigured",
      url: null,
    });
  });

  it("falls back to localhost when no runtime URL is configured", () => {
    expect(
      resolveGeneratorRuntime({
        env: {},
      }),
    ).toEqual({
      source: "fallback",
      status: "ok",
      url: "http://127.0.0.1:8080",
    });
  });

  it("reads the runtime state path from an explicit env var", () => {
    const appRootPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "one-portrait-runtime-path-"),
    );
    const runtimeStatePath = path.join(appRootPath, "tmp", "runtime.json");
    createdDirs.push(appRootPath);
    fs.mkdirSync(path.dirname(runtimeStatePath), { recursive: true });
    fs.writeFileSync(
      runtimeStatePath,
      JSON.stringify({
        mode: "quick",
        pid: process.pid,
        updatedAt: new Date().toISOString(),
        url: "https://env-path.example.com",
        version: 1,
      }),
    );

    expect(
      resolveGeneratorRuntime({
        env: {
          OP_GENERATOR_RUNTIME_STATE_PATH: runtimeStatePath,
        },
      }),
    ).toEqual({
      source: "runtime_state",
      status: "ok",
      url: "https://env-path.example.com",
    });
  });
});

describe("resolveCloudflareGeneratorRuntime", () => {
  it("prefers the shell override over worker kv and legacy env", async () => {
    const kvGet = () =>
      Promise.resolve({
        mode: "quick",
        updatedAt: new Date().toISOString(),
        url: "https://worker-kv.example.com",
        version: 1,
      });

    await expect(
      resolveCloudflareGeneratorRuntime({
        env: {
          OP_FINALIZE_DISPATCH_URL: "https://legacy.example.com",
          OP_GENERATOR_RUNTIME_KV: {
            get: kvGet,
          },
          OP_GENERATOR_RUNTIME_URL_OVERRIDE: "https://override.example.com",
        },
      }),
    ).resolves.toEqual({
      source: "override",
      status: "ok",
      url: "https://override.example.com",
    });
  });

  it("prefers worker kv over legacy env", async () => {
    await expect(
      resolveCloudflareGeneratorRuntime({
        env: {
          OP_FINALIZE_DISPATCH_URL: "https://legacy.example.com",
          OP_GENERATOR_RUNTIME_KV: {
            get: async () => ({
              mode: "quick",
              updatedAt: new Date().toISOString(),
              url: "https://worker-kv.example.com/",
              version: 1,
            }),
          },
        },
      }),
    ).resolves.toEqual({
      source: "worker_kv",
      status: "ok",
      url: "https://worker-kv.example.com",
    });
  });

  it("ignores an invalid worker kv payload and falls back to legacy env", async () => {
    await expect(
      resolveCloudflareGeneratorRuntime({
        env: {
          OP_GENERATOR_BASE_URL: "https://legacy.example.com",
          OP_GENERATOR_RUNTIME_KV: {
            get: async () => ({
              nope: true,
            }),
          },
        },
      }),
    ).resolves.toEqual({
      source: "legacy_env",
      status: "ok",
      url: "https://legacy.example.com",
    });
  });

  it("ignores worker kv read failures and falls back to localhost", async () => {
    await expect(
      resolveCloudflareGeneratorRuntime({
        env: {
          OP_GENERATOR_RUNTIME_KV: {
            get: async () => {
              throw new Error("kv offline");
            },
          },
        },
      }),
    ).resolves.toEqual({
      source: "fallback",
      status: "ok",
      url: "http://127.0.0.1:8080",
    });
  });

  it("ignores stale worker kv payloads and falls back to legacy env", async () => {
    await expect(
      resolveCloudflareGeneratorRuntime({
        env: {
          OP_GENERATOR_BASE_URL: "https://legacy.example.com",
          OP_GENERATOR_RUNTIME_KV: {
            get: async () => ({
              mode: "quick",
              updatedAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
              url: "https://stale-worker-kv.example.com",
              version: 1,
            }),
          },
        },
      }),
    ).resolves.toEqual({
      source: "legacy_env",
      status: "ok",
      url: "https://legacy.example.com",
    });
  });
});

function createAppRootWithRuntimeState(input: {
  pid: number;
  updatedAt: string;
  url: string;
}): string {
  const appRootPath = fs.mkdtempSync(
    path.join(os.tmpdir(), "one-portrait-runtime-"),
  );
  const cacheDir = path.join(appRootPath, ".cache");
  createdDirs.push(appRootPath);

  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    path.join(cacheDir, "generator-runtime.json"),
    JSON.stringify({
      mode: "quick",
      pid: input.pid,
      updatedAt: input.updatedAt,
      url: input.url,
      version: 1,
    }),
  );

  return appRootPath;
}
