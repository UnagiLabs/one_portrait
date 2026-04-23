import { describe, expect, it, vi } from "vitest";

import { startDemoDev } from "./run-demo-dev.mjs";
import { startDev } from "./run-dev.mjs";
import { startSmokeDev } from "./run-smoke-dev.mjs";

describe("local runtime entrypoints", () => {
  it("startDev enables the local generator runtime flag without injecting a dispatch URL", () => {
    const spawnImpl = vi.fn().mockReturnValue({ on: vi.fn() });

    startDev({
      env: {},
      spawnImpl,
    });

    expect(spawnImpl).toHaveBeenCalledWith(
      expect.any(String),
      ["dev"],
      expect.objectContaining({
        env: expect.objectContaining({
          OP_GENERATOR_RUNTIME_STATE_PATH: expect.stringContaining(
            ".cache/generator-runtime.json",
          ),
          OP_LOCAL_GENERATOR_RUNTIME: "1",
        }),
      }),
    );
    expect(
      spawnImpl.mock.calls[0][2].env.OP_FINALIZE_DISPATCH_URL,
    ).toBeUndefined();
  });

  it("startSmokeDev enables the local generator runtime flag without injecting a dispatch URL", async () => {
    const spawnImpl = vi.fn().mockReturnValue({ on: vi.fn() });

    await startSmokeDev({
      env: {},
      spawnImpl,
    });

    expect(spawnImpl).toHaveBeenCalledWith(
      expect.any(String),
      ["dev"],
      expect.objectContaining({
        env: expect.objectContaining({
          OP_GENERATOR_RUNTIME_STATE_PATH: expect.stringContaining(
            ".cache/generator-runtime.json",
          ),
          OP_LOCAL_GENERATOR_RUNTIME: "1",
        }),
      }),
    );
    expect(
      spawnImpl.mock.calls[0][2].env.OP_FINALIZE_DISPATCH_URL,
    ).toBeUndefined();
  });

  it("startDemoDev enables demo mode and the local generator runtime flag", () => {
    const spawnImpl = vi.fn().mockReturnValue({ on: vi.fn() });

    startDemoDev({
      env: {},
      spawnImpl,
    });

    expect(spawnImpl).toHaveBeenCalledWith(
      expect.any(String),
      ["dev"],
      expect.objectContaining({
        env: expect.objectContaining({
          NEXT_PUBLIC_DEMO_MODE: "1",
          NEXT_PUBLIC_REGISTRY_OBJECT_ID:
            "0x00000000000000000000000000000000000000000000000000000000000000d1",
          NEXT_PUBLIC_SUI_NETWORK: "testnet",
          OP_GENERATOR_RUNTIME_STATE_PATH: expect.stringContaining(
            ".cache/generator-runtime.json",
          ),
          OP_LOCAL_GENERATOR_RUNTIME: "1",
        }),
      }),
    );
    expect(
      spawnImpl.mock.calls[0][2].env.OP_FINALIZE_DISPATCH_URL,
    ).toBeUndefined();
  });
});
