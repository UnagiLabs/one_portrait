import { describe, expect, it, vi } from "vitest";

import {
  readRemoteGeneratorRuntime,
  writeRemoteGeneratorRuntime,
} from "./generator-runtime-remote.mjs";

describe("generator-runtime-remote", () => {
  it("reads the current runtime from remote kv", async () => {
    const runCommand = vi.fn().mockResolvedValue({
      stderr: "",
      stdout: JSON.stringify({
        mode: "quick",
        updatedAt: "2026-04-23T00:00:00.000Z",
        url: "https://remote-kv.example.com/",
        version: 1,
      }),
    });

    await expect(
      readRemoteGeneratorRuntime({
        env: {
          CLOUDFLARED_CONFIG: "/tmp/unused",
        },
        logger: createLogger(),
        runCommand,
      }),
    ).resolves.toEqual({
      mode: "quick",
      updatedAt: "2026-04-23T00:00:00.000Z",
      url: "https://remote-kv.example.com",
      version: 1,
    });
    expect(runCommand).toHaveBeenCalledWith(
      "corepack",
      [
        "pnpm",
        "exec",
        "wrangler",
        "kv",
        "key",
        "get",
        "generator-runtime/current",
        "--binding",
        "OP_GENERATOR_RUNTIME_KV",
        "--remote",
        "--text",
      ],
      expect.objectContaining({
        cwd: expect.any(String),
      }),
    );
  });

  it("returns null and warns when the remote payload is invalid", async () => {
    const logger = createLogger();

    await expect(
      readRemoteGeneratorRuntime({
        logger,
        runCommand: vi.fn().mockResolvedValue({
          stderr: "",
          stdout: '{"bad":true}',
        }),
      }),
    ).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      "[generator-runtime][remote-kv][invalid-payload]",
    );
  });

  it("writes the current runtime to remote kv", async () => {
    const logger = createLogger();
    const runCommand = vi.fn().mockResolvedValue({
      stderr: "",
      stdout: "",
    });

    await expect(
      writeRemoteGeneratorRuntime({
        logger,
        mode: "quick",
        runCommand,
        updatedAt: "2026-04-23T00:00:00.000Z",
        url: "https://remote-kv.example.com/",
      }),
    ).resolves.toEqual({
      marker: "[generator-runtime][remote-kv][written]",
      ok: true,
    });
    expect(runCommand).toHaveBeenCalledWith(
      "corepack",
      [
        "pnpm",
        "exec",
        "wrangler",
        "kv",
        "key",
        "put",
        "generator-runtime/current",
        JSON.stringify({
          mode: "quick",
          updatedAt: "2026-04-23T00:00:00.000Z",
          url: "https://remote-kv.example.com",
          version: 1,
        }),
        "--binding",
        "OP_GENERATOR_RUNTIME_KV",
        "--remote",
      ],
      expect.objectContaining({
        cwd: expect.any(String),
      }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      "[generator-runtime][remote-kv][written] url=https://remote-kv.example.com",
    );
  });
});

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
  };
}
