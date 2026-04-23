import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("next.config", () => {
  it("initializes Cloudflare dev when local generator runtime is disabled", async () => {
    const initOpenNextCloudflareForDev = vi.fn();
    vi.doMock("@opennextjs/cloudflare", () => ({
      initOpenNextCloudflareForDev,
    }));
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("OP_LOCAL_GENERATOR_RUNTIME", "");

    await import("./next.config");

    expect(initOpenNextCloudflareForDev).toHaveBeenCalledTimes(1);
  });

  it("skips Cloudflare dev init when local generator runtime is enabled", async () => {
    const initOpenNextCloudflareForDev = vi.fn();
    vi.doMock("@opennextjs/cloudflare", () => ({
      initOpenNextCloudflareForDev,
    }));
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("OP_LOCAL_GENERATOR_RUNTIME", "1");

    await import("./next.config");

    expect(initOpenNextCloudflareForDev).not.toHaveBeenCalled();
  });
});
