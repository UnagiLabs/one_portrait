import { describe, expect, it, vi } from "vitest";

import {
  GENERATOR_STACK_HEALTH_RETRY_INTERVAL_MS,
  GENERATOR_STACK_HEALTH_TIMEOUT_MS,
  waitForGeneratorStackHealth,
} from "./generator-stack-health.mjs";

const labels = ["local", "external"] as const;

describe.each(labels)("waitForGeneratorStackHealth: %s", (label) => {
  it("treats 200 as ready immediately", async () => {
    const logger = createLogger();
    const clock = createClock();
    const fetchImpl = vi.fn().mockResolvedValue({ status: 200 });

    const result = await waitForGeneratorStackHealth({
      fetchImpl,
      label,
      logger,
      now: clock.now,
      sleep: clock.sleep,
      url:
        label === "local"
          ? "http://127.0.0.1:8080/health"
          : "https://generator.example/health",
    });

    expect(result).toEqual({
      ok: true,
      exitCode: 0,
      marker: `[generator-stack][health][${label}][ready]`,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(clock.sleep).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      `[generator-stack][health][${label}][ready]`,
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("retries repeated 503 responses until ready", async () => {
    const logger = createLogger();
    const clock = createClock();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ status: 200 });

    const result = await waitForGeneratorStackHealth({
      fetchImpl,
      label,
      logger,
      now: clock.now,
      sleep: clock.sleep,
      url:
        label === "local"
          ? "http://127.0.0.1:8080/health"
          : "https://generator.example/health",
    });

    expect(result).toEqual({
      ok: true,
      exitCode: 0,
      marker: `[generator-stack][health][${label}][ready]`,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(clock.sleep).toHaveBeenCalledTimes(2);
    expect(clock.sleep).toHaveBeenNthCalledWith(
      1,
      GENERATOR_STACK_HEALTH_RETRY_INTERVAL_MS,
    );
    expect(clock.sleep).toHaveBeenNthCalledWith(
      2,
      GENERATOR_STACK_HEALTH_RETRY_INTERVAL_MS,
    );
    expect(logger.info).toHaveBeenCalledWith(
      `[generator-stack][health][${label}][ready]`,
    );
  });

  it("retries repeated connection errors until ready", async () => {
    const logger = createLogger();
    const clock = createClock();
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce({ status: 200 });

    const result = await waitForGeneratorStackHealth({
      fetchImpl,
      label,
      logger,
      now: clock.now,
      sleep: clock.sleep,
      url:
        label === "local"
          ? "http://127.0.0.1:8080/health"
          : "https://generator.example/health",
    });

    expect(result).toEqual({
      ok: true,
      exitCode: 0,
      marker: `[generator-stack][health][${label}][ready]`,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(clock.sleep).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith(
      `[generator-stack][health][${label}][ready]`,
    );
  });

  it("times out after repeated 503 responses", async () => {
    const logger = createLogger();
    const clock = createClock();
    const fetchImpl = vi.fn().mockResolvedValue({ status: 503 });

    const result = await waitForGeneratorStackHealth({
      fetchImpl,
      label,
      logger,
      now: clock.now,
      sleep: clock.sleep,
      url:
        label === "local"
          ? "http://127.0.0.1:8080/health"
          : "https://generator.example/health",
    });

    expect(result).toEqual({
      ok: false,
      exitCode: 1,
      marker: `[generator-stack][health][${label}][timeout]`,
    });
    expect(fetchImpl).toHaveBeenCalled();
    expect(clock.sleep).toHaveBeenCalledTimes(
      GENERATOR_STACK_HEALTH_TIMEOUT_MS /
        GENERATOR_STACK_HEALTH_RETRY_INTERVAL_MS,
    );
    expect(logger.error).toHaveBeenCalledWith(
      `[generator-stack][health][${label}][timeout]`,
    );
  });

  it("times out after repeated connection errors", async () => {
    const logger = createLogger();
    const clock = createClock();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("fetch failed"));

    const result = await waitForGeneratorStackHealth({
      fetchImpl,
      label,
      logger,
      now: clock.now,
      sleep: clock.sleep,
      url:
        label === "local"
          ? "http://127.0.0.1:8080/health"
          : "https://generator.example/health",
    });

    expect(result).toEqual({
      ok: false,
      exitCode: 1,
      marker: `[generator-stack][health][${label}][timeout]`,
    });
    expect(fetchImpl).toHaveBeenCalled();
    expect(clock.sleep).toHaveBeenCalledTimes(
      GENERATOR_STACK_HEALTH_TIMEOUT_MS /
        GENERATOR_STACK_HEALTH_RETRY_INTERVAL_MS,
    );
    expect(logger.error).toHaveBeenCalledWith(
      `[generator-stack][health][${label}][timeout]`,
    );
  });

  it("times out when fetch never resolves and aborts each attempt", async () => {
    const logger = createLogger();
    const clock = createClock();
    const signals: AbortSignal[] = [];
    const fetchImpl = vi.fn(
      (requestUrl: URL | string, options?: RequestInit) => {
        void requestUrl;
        if (options?.signal) {
          signals.push(options.signal);
        }

        return new Promise(() => {});
      },
    );

    const result = await waitForGeneratorStackHealth({
      createAbortController: () => new AbortController(),
      fetchImpl,
      label,
      logger,
      now: clock.now,
      sleep: clock.sleep,
      url:
        label === "local"
          ? "http://127.0.0.1:8080/health"
          : "https://generator.example/health",
      waitForAttemptTimeout: vi.fn(async () => {}),
    });

    expect(result).toEqual({
      ok: false,
      exitCode: 1,
      marker: `[generator-stack][health][${label}][timeout]`,
    });
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("does not report ready when the first 200 arrives at the timeout boundary", async () => {
    const logger = createLogger();
    const clock = createClock();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ status: 200 });

    const result = await waitForGeneratorStackHealth({
      fetchImpl,
      label,
      logger,
      now: clock.now,
      retryIntervalMs: 1000,
      sleep: clock.sleep,
      timeoutMs: 3000,
      url:
        label === "local"
          ? "http://127.0.0.1:8080/health"
          : "https://generator.example/health",
    });

    expect(result).toEqual({
      ok: false,
      exitCode: 1,
      marker: `[generator-stack][health][${label}][timeout]`,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

function createClock() {
  let currentTime = 0;

  return {
    now: vi.fn(() => currentTime),
    sleep: vi.fn(async (milliseconds: number) => {
      currentTime += milliseconds;
    }),
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
