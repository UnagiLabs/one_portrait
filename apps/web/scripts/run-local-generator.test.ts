import { describe, expect, it, vi } from "vitest";

import { startLocalGenerator } from "./run-local-generator.mjs";

describe("startLocalGenerator", () => {
  it("defaults to 8080 when OP_LOCAL_GENERATOR_PORT is blank", () => {
    const spawnImpl = vi.fn().mockReturnValue({ on: vi.fn() });

    startLocalGenerator({
      env: {
        OP_LOCAL_GENERATOR_PORT: "",
        PORT: "",
      },
      spawnImpl,
    });

    expect(spawnImpl).toHaveBeenCalledWith(
      expect.any(String),
      ["./src/server.ts"],
      expect.objectContaining({
        env: expect.objectContaining({
          PORT: "8080",
        }),
      }),
    );
  });

  it("uses PORT when OP_LOCAL_GENERATOR_PORT is unset", () => {
    const spawnImpl = vi.fn().mockReturnValue({ on: vi.fn() });

    startLocalGenerator({
      env: {
        PORT: "9090",
      },
      spawnImpl,
    });

    expect(spawnImpl).toHaveBeenCalledWith(
      expect.any(String),
      ["./src/server.ts"],
      expect.objectContaining({
        env: expect.objectContaining({
          PORT: "9090",
        }),
      }),
    );
  });

  it("prefers OP_LOCAL_GENERATOR_PORT over PORT", () => {
    const spawnImpl = vi.fn().mockReturnValue({ on: vi.fn() });

    startLocalGenerator({
      env: {
        OP_LOCAL_GENERATOR_PORT: "7070",
        PORT: "9090",
      },
      spawnImpl,
    });

    expect(spawnImpl).toHaveBeenCalledWith(
      expect.any(String),
      ["./src/server.ts"],
      expect.objectContaining({
        env: expect.objectContaining({
          PORT: "7070",
        }),
      }),
    );
  });
});
