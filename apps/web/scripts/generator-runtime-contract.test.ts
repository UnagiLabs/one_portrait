import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveGeneratorRuntime } from "../src/lib/generator-runtime";
import { resolveScriptGeneratorRuntime } from "./generator-runtime.mjs";

const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe("generator runtime contract", () => {
  it("matches server and script precedence for runtime state over legacy env", () => {
    const appRootPath = createAppRootWithRuntimeState({
      pid: process.pid,
      updatedAt: new Date().toISOString(),
      url: "https://runtime-state.example.com/",
    });
    const env = {
      OP_FINALIZE_DISPATCH_URL: "https://legacy-env.example.com",
    };

    expect(
      resolveScriptGeneratorRuntime({
        appRootPath,
        env,
      }),
    ).toEqual(
      resolveGeneratorRuntime({
        appRootPath,
        env,
      }),
    );
  });

  it("matches server and script misconfiguration handling for conflicting legacy env", () => {
    const env = {
      OP_FINALIZE_DISPATCH_URL: "https://dispatch.example.com",
      OP_GENERATOR_BASE_URL: "https://generator.example.com",
    };

    expect(
      resolveScriptGeneratorRuntime({
        env,
      }),
    ).toEqual(
      resolveGeneratorRuntime({
        env,
      }),
    );
  });
});

function createAppRootWithRuntimeState(input: {
  pid: number;
  updatedAt: string;
  url: string;
}) {
  const appRootPath = fs.mkdtempSync(
    path.join(os.tmpdir(), "one-portrait-runtime-contract-"),
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
