import { describe, expect, it, vi } from "vitest";

import { runGeneratorStackPreflight } from "./generator-stack-preflight.mjs";

const validEnv = {
  OP_LOCAL_TUNNEL_NAME: "one-portrait-generator",
  OP_FINALIZE_DISPATCH_URL: "https://generator.example",
};

describe("runGeneratorStackPreflight", () => {
  it("fails fast when OP_LOCAL_TUNNEL_NAME is missing", async () => {
    const logger = createLogger();
    const runCommand = vi.fn();

    const result = await runGeneratorStackPreflight({
      env: {
        OP_FINALIZE_DISPATCH_URL: validEnv.OP_FINALIZE_DISPATCH_URL,
      },
      logger,
      runCommand,
    });

    expect(result).toEqual({
      ok: false,
      exitCode: 1,
      marker: "[generator-stack][preflight][missing-env]",
    });
    expect(runCommand).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("[generator-stack][preflight][missing-env]"),
    );
  });

  it("fails fast when OP_FINALIZE_DISPATCH_URL is missing", async () => {
    const logger = createLogger();
    const runCommand = vi.fn();

    const result = await runGeneratorStackPreflight({
      env: {
        OP_LOCAL_TUNNEL_NAME: validEnv.OP_LOCAL_TUNNEL_NAME,
      },
      logger,
      runCommand,
    });

    expect(result).toEqual({
      ok: false,
      exitCode: 1,
      marker: "[generator-stack][preflight][missing-env]",
    });
    expect(runCommand).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("[generator-stack][preflight][missing-env]"),
    );
  });

  it("fails fast when cloudflared is missing", async () => {
    const logger = createLogger();
    const runCommand = vi.fn(async (command: string, args: string[]) => {
      if (command === "cloudflared" && args[0] === "--version") {
        throw Object.assign(new Error("cloudflared not found"), {
          code: "ENOENT",
        });
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    });

    const result = await runGeneratorStackPreflight({
      env: validEnv,
      logger,
      runCommand,
    });

    expect(result).toEqual({
      ok: false,
      exitCode: 1,
      marker: "[generator-stack][preflight][missing-cloudflared]",
    });
    expect(
      runCommand.mock.calls.map(([command, args]) => [command, args]),
    ).toEqual([["cloudflared", ["--version"]]]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining(
        "[generator-stack][preflight][missing-cloudflared]",
      ),
    );
  });

  it("fails fast when the dispatch URL is missing a hostname", async () => {
    const logger = createLogger();
    const runCommand = vi.fn();

    const result = await runGeneratorStackPreflight({
      env: {
        ...validEnv,
        OP_FINALIZE_DISPATCH_URL: "https://",
      },
      logger,
      runCommand,
    });

    expect(result).toEqual({
      ok: false,
      exitCode: 1,
      marker: "[generator-stack][preflight][tunnel-misconfig]",
    });
    expect(runCommand).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("[generator-stack][preflight][tunnel-misconfig]"),
    );
  });

  it("fails fast when the dispatch URL is not https", async () => {
    const logger = createLogger();
    const runCommand = vi.fn();

    const result = await runGeneratorStackPreflight({
      env: {
        ...validEnv,
        OP_FINALIZE_DISPATCH_URL: "http://generator.example",
      },
      logger,
      runCommand,
    });

    expect(result).toEqual({
      ok: false,
      exitCode: 1,
      marker: "[generator-stack][preflight][tunnel-misconfig]",
    });
    expect(runCommand).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("[generator-stack][preflight][tunnel-misconfig]"),
    );
  });

  it("fails fast when the tunnel hostname does not match the dispatch URL hostname", async () => {
    const logger = createLogger();
    const runCommand = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "cloudflared version 2026.4.0" })
      .mockResolvedValueOnce({
        stdout: "Name one-portrait-generator",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout:
          "Matched rule #1\n  hostname: other.example.com\n  service: http://localhost:8080\n",
        stderr: "",
      });

    const result = await runGeneratorStackPreflight({
      env: validEnv,
      logger,
      runCommand,
    });

    expect(result).toEqual({
      ok: false,
      exitCode: 1,
      marker: "[generator-stack][preflight][tunnel-misconfig]",
    });
    expect(
      runCommand.mock.calls.map(([command, args]) => [command, args]),
    ).toEqual([
      ["cloudflared", ["--version"]],
      [
        "cloudflared",
        [
          "--config",
          expect.stringContaining(".cloudflared/config.yml"),
          "tunnel",
          "ingress",
          "validate",
        ],
      ],
      ["cloudflared", ["tunnel", "info", "one-portrait-generator"]],
      [
        "cloudflared",
        [
          "--config",
          expect.stringContaining(".cloudflared/config.yml"),
          "tunnel",
          "ingress",
          "rule",
          "https://generator.example/",
        ],
      ],
    ]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("[generator-stack][preflight][tunnel-misconfig]"),
    );
  });

  it("fails fast when cloudflared tunnel ingress validate fails", async () => {
    const logger = createLogger();
    const runCommand = vi.fn(async (command: string, args: string[]) => {
      if (args[0] === "--version") {
        return { stdout: "cloudflared version 2026.4.0", stderr: "" };
      }

      if (
        args.at(-3) === "tunnel" &&
        args.at(-2) === "ingress" &&
        args.at(-1) === "validate"
      ) {
        throw Object.assign(new Error("invalid ingress"), {
          stderr: "invalid",
        });
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    });

    const result = await runGeneratorStackPreflight({
      env: validEnv,
      logger,
      runCommand,
    });

    expect(result).toEqual({
      ok: false,
      exitCode: 1,
      marker: "[generator-stack][preflight][tunnel-misconfig]",
    });
    expect(
      runCommand.mock.calls.map(([command, args]) => [command, args]),
    ).toEqual([
      ["cloudflared", ["--version"]],
      [
        "cloudflared",
        [
          "--config",
          expect.stringContaining(".cloudflared/config.yml"),
          "tunnel",
          "ingress",
          "validate",
        ],
      ],
    ]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("[generator-stack][preflight][tunnel-misconfig]"),
    );
  });

  it("fails fast when cloudflared tunnel info fails", async () => {
    const logger = createLogger();
    const runCommand = vi.fn(async (command: string, args: string[]) => {
      if (args[0] === "--version") {
        return { stdout: "cloudflared version 2026.4.0", stderr: "" };
      }

      if (
        args.at(-3) === "tunnel" &&
        args.at(-2) === "ingress" &&
        args.at(-1) === "validate"
      ) {
        return { stdout: "", stderr: "" };
      }

      if (args.join(" ") === "tunnel info one-portrait-generator") {
        throw Object.assign(new Error("info failed"), {
          stderr: "info failed",
        });
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    });

    const result = await runGeneratorStackPreflight({
      env: validEnv,
      logger,
      runCommand,
    });

    expect(result).toEqual({
      ok: false,
      exitCode: 1,
      marker: "[generator-stack][preflight][tunnel-misconfig]",
    });
    expect(
      runCommand.mock.calls.map(([command, args]) => [command, args]),
    ).toEqual([
      ["cloudflared", ["--version"]],
      [
        "cloudflared",
        [
          "--config",
          expect.stringContaining(".cloudflared/config.yml"),
          "tunnel",
          "ingress",
          "validate",
        ],
      ],
      ["cloudflared", ["tunnel", "info", "one-portrait-generator"]],
    ]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("[generator-stack][preflight][tunnel-misconfig]"),
    );
  });

  it("uses a custom cloudflared config path when provided", async () => {
    const logger = createLogger();
    const runCommand = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "cloudflared version 2026.4.0" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({
        stdout: "Name: one-portrait-generator",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout:
          "Matched rule #1\n  hostname: generator.example\n  service: http://localhost:9090\n",
        stderr: "",
      });

    const result = await runGeneratorStackPreflight({
      env: {
        ...validEnv,
        OP_LOCAL_GENERATOR_PORT: "9090",
        OP_LOCAL_TUNNEL_CONFIG_PATH: "/tmp/custom-cloudflared.yml",
      },
      logger,
      runCommand,
    });

    expect(result).toEqual({
      ok: true,
      exitCode: 0,
      tunnelName: "one-portrait-generator",
      publicHostname: "generator.example",
      localPort: 9090,
    });
    expect(runCommand).toHaveBeenNthCalledWith(
      2,
      "cloudflared",
      [
        "--config",
        "/tmp/custom-cloudflared.yml",
        "tunnel",
        "ingress",
        "validate",
      ],
      {},
    );
    expect(runCommand).toHaveBeenNthCalledWith(
      4,
      "cloudflared",
      [
        "--config",
        "/tmp/custom-cloudflared.yml",
        "tunnel",
        "ingress",
        "rule",
        "https://generator.example/",
      ],
      {},
    );
  });
});

function createLogger() {
  return {
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}
