// @ts-nocheck

import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error test-only import from a Node .mjs script
import {
  assertNormalDevEnvironment,
  parseEnvFile,
} from "../../scripts/dev-mode.mjs";
// @ts-expect-error test-only import from a Node .mjs script
import { e2eStubEnv, startE2EDev } from "../../scripts/run-e2e-dev.mjs";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  }
});

describe("assertNormalDevEnvironment", () => {
  it("throws when .env.local still contains E2E stub values", () => {
    const cwd = createTempWebRoot();
    fs.writeFileSync(
      path.join(cwd, ".env.local"),
      [
        "NEXT_PUBLIC_SUI_NETWORK=testnet",
        "NEXT_PUBLIC_E2E_STUB_WALLET=1",
        "NEXT_PUBLIC_ENOKI_API_KEY=enoki-e2e-stub",
      ].join("\n"),
    );

    expect(() =>
      assertNormalDevEnvironment({
        cwd,
        env: {},
      }),
    ).toThrow(/E2E stub values still present/u);
  });

  it("accepts normal development env files", () => {
    const cwd = createTempWebRoot();
    fs.writeFileSync(
      path.join(cwd, ".env.local"),
      [
        "NEXT_PUBLIC_SUI_NETWORK=testnet",
        "NEXT_PUBLIC_ENOKI_API_KEY=real-public-key",
      ].join("\n"),
    );

    expect(() =>
      assertNormalDevEnvironment({
        cwd,
        env: {},
      }),
    ).not.toThrow();
  });

  it("parses quoted env values", () => {
    expect(
      parseEnvFile(
        [
          "NEXT_PUBLIC_GOOGLE_CLIENT_ID='google-e2e-stub'",
          'NEXT_PUBLIC_WALRUS_PUBLISHER="https://publisher.e2e.stub"',
        ].join("\n"),
      ),
    ).toEqual({
      NEXT_PUBLIC_GOOGLE_CLIENT_ID: "google-e2e-stub",
      NEXT_PUBLIC_WALRUS_PUBLISHER: "https://publisher.e2e.stub",
    });
  });
});

describe("startE2EDev", () => {
  it("injects stub env without mutating .env.local", async () => {
    const cwd = createTempWebRoot();
    const envLocalPath = path.join(cwd, ".env.local");
    const originalEnvLocal = [
      "NEXT_PUBLIC_SUI_NETWORK=devnet",
      "NEXT_PUBLIC_ENOKI_API_KEY=real-public-key",
    ].join("\n");

    fs.writeFileSync(envLocalPath, originalEnvLocal);
    fs.mkdirSync(path.join(cwd, ".next"), { recursive: true });
    fs.mkdirSync(path.join(cwd, "node_modules", ".bin"), { recursive: true });

    const spawnCalls: Array<
      [string, string[], { env: Record<string, string> }]
    > = [];

    await startE2EDev({
      cwd,
      env: { E2E_PORT: "3100" },
      isPortBusy: async () => false,
      nextDevBin: "/tmp/fake-next",
      spawnImpl: (
        command: string,
        args: string[],
        options: { env: Record<string, string> },
      ) => {
        spawnCalls.push([command, args, options]);
        return new EventEmitter() as ChildProcess;
      },
    });

    expect(fs.readFileSync(envLocalPath, "utf8")).toBe(originalEnvLocal);
    expect(fs.existsSync(path.join(cwd, ".next"))).toBe(false);
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0][2].env).toMatchObject(e2eStubEnv);
  });
});

function createTempWebRoot() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "one-portrait-web-"));
  tempDirs.push(tempDir);
  return tempDir;
}
