import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { runGeneratorStackTunnel } from "./run-generator-stack-tunnel.mjs";

describe("runGeneratorStackTunnel", () => {
  it("starts the generator before the tunnel, reports ready, and stops on tunnel exit", async () => {
    const logger = createLogger();
    const processImpl = createProcessMock();
    const generatorChild = createChildProcess("generator");
    const tunnelChild = createChildProcess("tunnel");
    const localHealth = createDeferred();
    const externalHealth = createDeferred();

    const preflight = vi.fn().mockResolvedValue({
      exitCode: 0,
      localPort: 8080,
      ok: true,
      publicHostname: "generator.example",
      tunnelName: "one-portrait-generator",
    });
    const startLocalGenerator = vi.fn().mockResolvedValue({
      child: generatorChild,
    });
    const spawnImpl = vi.fn().mockReturnValue(tunnelChild);
    const waitForHealth = vi.fn(({ label }: { label: string }) => {
      if (label === "local") {
        return localHealth.promise;
      }

      return externalHealth.promise;
    });

    const runPromise = runGeneratorStackTunnel({
      env: {
        OP_FINALIZE_DISPATCH_URL: "https://generator.example",
        OP_LOCAL_TUNNEL_NAME: "one-portrait-generator",
      },
      logger,
      preflight,
      processImpl,
      spawnImpl,
      startLocalGenerator,
      waitForHealth,
    });

    await settle();

    expect(preflight).toHaveBeenCalledTimes(1);
    expect(startLocalGenerator).toHaveBeenCalledTimes(1);
    expect(startLocalGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          OP_FINALIZE_DISPATCH_URL: "https://generator.example",
          OP_LOCAL_TUNNEL_NAME: "one-portrait-generator",
        }),
        spawnImpl,
      }),
    );
    expect(spawnImpl).not.toHaveBeenCalled();
    expect(waitForHealth).toHaveBeenCalledTimes(1);
    expect(waitForHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "local",
        url: "http://127.0.0.1:8080/health",
      }),
    );

    localHealth.resolve({
      exitCode: 0,
      marker: "[generator-stack][health][local][ready]",
      ok: true,
    });
    await settle();

    expect(spawnImpl).toHaveBeenCalledTimes(1);
    expect(spawnImpl).toHaveBeenCalledWith(
      "cloudflared",
      ["tunnel", "run", "one-portrait-generator"],
      expect.objectContaining({
        cwd: expect.any(String),
        env: expect.objectContaining({
          OP_FINALIZE_DISPATCH_URL: "https://generator.example",
          OP_LOCAL_TUNNEL_NAME: "one-portrait-generator",
        }),
        stdio: "inherit",
      }),
    );
    expect(waitForHealth).toHaveBeenCalledTimes(2);
    expect(waitForHealth).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        label: "external",
        url: "https://generator.example/health",
      }),
    );

    externalHealth.resolve({
      exitCode: 0,
      marker: "[generator-stack][health][external][ready]",
      ok: true,
    });
    await settle();

    expect(logger.info).toHaveBeenCalledWith("[generator-stack][ready]");

    tunnelChild.emit("exit", 1, null);

    await expect(runPromise).resolves.toEqual({
      exitCode: 1,
      marker: "[generator-stack][child-exit][tunnel]",
      ok: false,
    });
    expect(generatorChild.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("kills the generator when local health times out before the tunnel starts", async () => {
    const logger = createLogger();
    const processImpl = createProcessMock();
    const generatorChild = createChildProcess("generator");
    const timeoutResult = {
      exitCode: 1,
      marker: "[generator-stack][health][local][timeout]",
      ok: false,
    };

    const preflight = vi.fn().mockResolvedValue({
      exitCode: 0,
      localPort: 8080,
      ok: true,
      publicHostname: "generator.example",
      tunnelName: "one-portrait-generator",
    });
    const startLocalGenerator = vi.fn().mockResolvedValue({
      child: generatorChild,
    });
    const spawnImpl = vi.fn();
    const waitForHealth = vi.fn().mockResolvedValue(timeoutResult);

    const result = await runGeneratorStackTunnel({
      env: {
        OP_FINALIZE_DISPATCH_URL: "https://generator.example",
        OP_LOCAL_TUNNEL_NAME: "one-portrait-generator",
      },
      logger,
      preflight,
      processImpl,
      spawnImpl,
      startLocalGenerator,
      waitForHealth,
    });

    expect(result).toEqual(timeoutResult);
    expect(startLocalGenerator).toHaveBeenCalledTimes(1);
    expect(spawnImpl).not.toHaveBeenCalled();
    expect(generatorChild.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("kills both children when external health times out after the tunnel starts", async () => {
    const logger = createLogger();
    const processImpl = createProcessMock();
    const generatorChild = createChildProcess("generator");
    const tunnelChild = createChildProcess("tunnel");

    const preflight = vi.fn().mockResolvedValue({
      exitCode: 0,
      localPort: 8080,
      ok: true,
      publicHostname: "generator.example",
      tunnelName: "one-portrait-generator",
    });
    const startLocalGenerator = vi.fn().mockResolvedValue({
      child: generatorChild,
    });
    const spawnImpl = vi.fn().mockReturnValue(tunnelChild);
    const waitForHealth = vi
      .fn()
      .mockResolvedValueOnce({
        exitCode: 0,
        marker: "[generator-stack][health][local][ready]",
        ok: true,
      })
      .mockResolvedValueOnce({
        exitCode: 1,
        marker: "[generator-stack][health][external][timeout]",
        ok: false,
      });

    const result = await runGeneratorStackTunnel({
      env: {
        OP_FINALIZE_DISPATCH_URL: "https://generator.example",
        OP_LOCAL_TUNNEL_NAME: "one-portrait-generator",
      },
      logger,
      preflight,
      processImpl,
      spawnImpl,
      startLocalGenerator,
      waitForHealth,
    });

    expect(result).toEqual({
      exitCode: 1,
      marker: "[generator-stack][health][external][timeout]",
      ok: false,
    });
    expect(generatorChild.kill).toHaveBeenCalledWith("SIGTERM");
    expect(tunnelChild.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("stops the tunnel when the generator exits unexpectedly during external health", async () => {
    const logger = createLogger();
    const processImpl = createProcessMock();
    const generatorChild = createChildProcess("generator");
    const tunnelChild = createChildProcess("tunnel");
    const externalHealth = createDeferred();

    const preflight = vi.fn().mockResolvedValue({
      exitCode: 0,
      localPort: 8080,
      ok: true,
      publicHostname: "generator.example",
      tunnelName: "one-portrait-generator",
    });
    const startLocalGenerator = vi.fn().mockResolvedValue({
      child: generatorChild,
    });
    const spawnImpl = vi.fn().mockReturnValue(tunnelChild);
    const waitForHealth = vi
      .fn()
      .mockResolvedValueOnce({
        exitCode: 0,
        marker: "[generator-stack][health][local][ready]",
        ok: true,
      })
      .mockReturnValueOnce(externalHealth.promise);

    const runPromise = runGeneratorStackTunnel({
      env: {
        OP_FINALIZE_DISPATCH_URL: "https://generator.example",
        OP_LOCAL_TUNNEL_NAME: "one-portrait-generator",
      },
      logger,
      preflight,
      processImpl,
      spawnImpl,
      startLocalGenerator,
      waitForHealth,
    });

    await settle();
    generatorChild.emit("exit", 1, null);

    await expect(runPromise).resolves.toEqual({
      exitCode: 1,
      marker: "[generator-stack][child-exit][generator]",
      ok: false,
    });
    expect(tunnelChild.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("stops both children and returns the same signal when interrupted", async () => {
    const logger = createLogger();
    const processImpl = createProcessMock();
    const generatorChild = createChildProcess("generator");
    const tunnelChild = createChildProcess("tunnel");
    const externalHealth = createDeferred();

    const preflight = vi.fn().mockResolvedValue({
      exitCode: 0,
      localPort: 8080,
      ok: true,
      publicHostname: "generator.example",
      tunnelName: "one-portrait-generator",
    });
    const startLocalGenerator = vi.fn().mockResolvedValue({
      child: generatorChild,
    });
    const spawnImpl = vi.fn().mockReturnValue(tunnelChild);
    const waitForHealth = vi
      .fn()
      .mockResolvedValueOnce({
        exitCode: 0,
        marker: "[generator-stack][health][local][ready]",
        ok: true,
      })
      .mockReturnValueOnce(externalHealth.promise);

    const runPromise = runGeneratorStackTunnel({
      env: {
        OP_FINALIZE_DISPATCH_URL: "https://generator.example",
        OP_LOCAL_TUNNEL_NAME: "one-portrait-generator",
      },
      logger,
      preflight,
      processImpl,
      spawnImpl,
      startLocalGenerator,
      waitForHealth,
    });

    await settle();
    processImpl.emit("SIGTERM");

    await expect(runPromise).resolves.toEqual({
      exitCode: 1,
      marker: "[generator-stack][signal][SIGTERM]",
      ok: false,
      signal: "SIGTERM",
    });
    expect(generatorChild.kill).toHaveBeenCalledWith("SIGTERM");
    expect(tunnelChild.kill).toHaveBeenCalledWith("SIGTERM");
  });
});

function createChildProcess(name: string) {
  const child = new EventEmitter() as EventEmitter & {
    kill: ReturnType<typeof vi.fn>;
    readonly name: string;
  };
  let exited = false;

  child.name = name;
  child.kill = vi.fn((signal = "SIGTERM") => {
    if (exited) {
      return true;
    }

    exited = true;
    queueMicrotask(() => {
      child.emit("exit", null, signal);
    });
    return true;
  });

  child.once("exit", () => {
    exited = true;
  });

  return child;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

function createLogger() {
  return {
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

function createProcessMock() {
  const processMock = new EventEmitter() as EventEmitter & {
    kill: ReturnType<typeof vi.fn>;
    pid: number;
  };

  processMock.pid = 4242;
  processMock.kill = vi.fn();

  return processMock;
}

async function settle() {
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
}
