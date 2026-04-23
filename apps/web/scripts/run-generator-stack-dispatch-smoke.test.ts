import { describe, expect, it, vi } from "vitest";

import { runGeneratorStackDispatchSmoke } from "./run-generator-stack-dispatch-smoke.mjs";

const VALID_ENV = {
  OP_FINALIZE_DISPATCH_SECRET: "shared-secret",
  OP_FINALIZE_DISPATCH_URL: "https://generator.example",
};

const VALID_UNIT_ID =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

describe("runGeneratorStackDispatchSmoke", () => {
  it("fails fast when the unit id argument is missing", async () => {
    const logger = createLogger();
    const fetchImpl = vi.fn();

    const result = await runGeneratorStackDispatchSmoke({
      argv: ["node", "script.mjs"],
      env: VALID_ENV,
      fetchImpl,
      logger,
    });

    expect(result).toEqual({
      exitCode: 1,
      marker: "[generator-stack][smoke][invalid-input]",
      ok: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("[generator-stack][smoke][invalid-input]"),
    );
  });

  it("validates the injected env without loading local env files", async () => {
    vi.resetModules();
    vi.doMock("./run-local-generator.mjs", () => ({
      loadWebScriptEnv: vi.fn(() => {
        throw new Error("loadWebScriptEnv should not be called");
      }),
    }));

    try {
      const { runGeneratorStackDispatchSmoke: runWithInjectedEnv } =
        await import("./run-generator-stack-dispatch-smoke.mjs");
      const logger = createLogger();
      const fetchImpl = vi.fn().mockResolvedValue({
        json: vi.fn(),
        status: 500,
      });

      const result = await runWithInjectedEnv({
        argv: ["node", "script.mjs", VALID_UNIT_ID],
        env: {
          OP_FINALIZE_DISPATCH_URL: VALID_ENV.OP_FINALIZE_DISPATCH_URL,
          OP_FINALIZE_DISPATCH_SECRET: VALID_ENV.OP_FINALIZE_DISPATCH_SECRET,
        },
        fetchImpl,
        logger,
      });

      expect(result).toEqual({
        exitCode: 1,
        marker: "[generator-stack][smoke][failed]",
        ok: false,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      vi.doUnmock("./run-local-generator.mjs");
      vi.resetModules();
    }
  });

  it("fails fast when the dispatch URL is missing", async () => {
    const logger = createLogger();
    const fetchImpl = vi.fn();

    const result = await runGeneratorStackDispatchSmoke({
      argv: ["node", "script.mjs", VALID_UNIT_ID],
      env: {
        OP_FINALIZE_DISPATCH_SECRET: VALID_ENV.OP_FINALIZE_DISPATCH_SECRET,
      },
      fetchImpl,
      logger,
    });

    expect(result).toEqual({
      exitCode: 1,
      marker: "[generator-stack][smoke][invalid-input]",
      ok: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("[generator-stack][smoke][invalid-input]"),
    );
  });

  it("fails fast when the dispatch secret is missing", async () => {
    const logger = createLogger();
    const fetchImpl = vi.fn();

    const result = await runGeneratorStackDispatchSmoke({
      argv: ["node", "script.mjs", VALID_UNIT_ID],
      env: {
        OP_FINALIZE_DISPATCH_URL: VALID_ENV.OP_FINALIZE_DISPATCH_URL,
      },
      fetchImpl,
      logger,
    });

    expect(result).toEqual({
      exitCode: 1,
      marker: "[generator-stack][smoke][invalid-input]",
      ok: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("[generator-stack][smoke][invalid-input]"),
    );
  });

  it("posts the unit id to /dispatch and reports the returned status", async () => {
    const logger = createLogger();
    const fetchImpl = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        status: "ignored_finalized",
        unitId: VALID_UNIT_ID,
      }),
      status: 200,
    });

    const result = await runGeneratorStackDispatchSmoke({
      argv: ["node", "script.mjs", VALID_UNIT_ID],
      env: VALID_ENV,
      fetchImpl,
      logger,
    });

    expect(result).toEqual({
      exitCode: 0,
      marker: "[generator-stack][smoke][ok]",
      ok: true,
      resultStatus: "ignored_finalized",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("/dispatch", "https://generator.example/"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ unitId: VALID_UNIT_ID }),
        headers: expect.objectContaining({
          "content-type": "application/json",
          "x-op-finalize-dispatch-secret": "shared-secret",
        }),
      }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      "[generator-stack][smoke][ok] status=ignored_finalized",
    );
  });

  it("fails on 401 responses", async () => {
    const logger = createLogger();
    const fetchImpl = vi.fn().mockResolvedValue({
      json: vi.fn(),
      status: 401,
    });

    const result = await runGeneratorStackDispatchSmoke({
      argv: ["node", "script.mjs", VALID_UNIT_ID],
      env: VALID_ENV,
      fetchImpl,
      logger,
    });

    expect(result).toEqual({
      exitCode: 1,
      marker: "[generator-stack][smoke][failed]",
      ok: false,
    });
    expect(logger.error).toHaveBeenCalledWith(
      "[generator-stack][smoke][failed] status=401",
    );
  });

  it("fails on 500 responses", async () => {
    const logger = createLogger();
    const fetchImpl = vi.fn().mockResolvedValue({
      json: vi.fn(),
      status: 500,
    });

    const result = await runGeneratorStackDispatchSmoke({
      argv: ["node", "script.mjs", VALID_UNIT_ID],
      env: VALID_ENV,
      fetchImpl,
      logger,
    });

    expect(result).toEqual({
      exitCode: 1,
      marker: "[generator-stack][smoke][failed]",
      ok: false,
    });
    expect(logger.error).toHaveBeenCalledWith(
      "[generator-stack][smoke][failed] status=500",
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
