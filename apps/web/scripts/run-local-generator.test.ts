import { describe, expect, it, vi } from "vitest";

import { startLocalGenerator } from "./run-local-generator.mjs";

const MANIFEST_PACKAGE_ID =
  "0x8568f91f71674184b5c8711b550ec6b001e88f09adbc22c7ad31e1173f02ffbf";
const MANIFEST_ADMIN_CAP_ID =
  "0x1884569ea7b990035635768d05bab0b12c1d1e5ca5dd58d56b096a4aaae08693";
const MANIFEST_WALRUS_AGGREGATOR =
  "https://aggregator.walrus-testnet.walrus.space";
const MANIFEST_WALRUS_PUBLISHER =
  "https://publisher.walrus-testnet.walrus.space";

describe("startLocalGenerator", () => {
  it("builds the generator image and runs the container with manifest env plus secrets", () => {
    const runDockerBuild = vi.fn();
    const spawnImpl = vi.fn().mockReturnValue({ on: vi.fn() });

    startLocalGenerator({
      env: {
        ADMIN_CAP_ID: "0xadmincap",
        ADMIN_SUI_PRIVATE_KEY: "suiprivkey",
        NEXT_PUBLIC_PACKAGE_ID: "0xpkg",
        NEXT_PUBLIC_SUI_NETWORK: "testnet",
        NEXT_PUBLIC_WALRUS_AGGREGATOR: "https://aggregator.example.com",
        NEXT_PUBLIC_WALRUS_PUBLISHER: "https://publisher.example.com",
        OP_FINALIZE_DISPATCH_SECRET: "shared-secret",
        OP_LOCAL_GENERATOR_PORT: "7070",
      },
      runDockerBuild,
      spawnImpl,
    });

    expect(runDockerBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        contextPath: expect.stringContaining("one_portrait"),
        dockerfilePath: expect.stringContaining("generator/Dockerfile"),
        imageTag: "one-portrait-generator:local",
      }),
    );
    expect(spawnImpl).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining([
        "run",
        "--rm",
        "--name",
        "one-portrait-generator-7070",
        "--publish",
        "127.0.0.1:7070:8080",
        "--env",
        "PORT=8080",
        "--env",
        "SUI_NETWORK=testnet",
        "--env",
        `PACKAGE_ID=${MANIFEST_PACKAGE_ID}`,
        "--env",
        `WALRUS_PUBLISHER=${MANIFEST_WALRUS_PUBLISHER}`,
        "--env",
        `WALRUS_AGGREGATOR=${MANIFEST_WALRUS_AGGREGATOR}`,
        "--env",
        `ADMIN_CAP_ID=${MANIFEST_ADMIN_CAP_ID}`,
        "--env",
        "ADMIN_SUI_PRIVATE_KEY=suiprivkey",
        "--env",
        "OP_FINALIZE_DISPATCH_SECRET=shared-secret",
        "one-portrait-generator:local",
      ]),
      expect.objectContaining({
        cwd: expect.stringContaining("one_portrait"),
        stdio: "inherit",
      }),
    );
  });

  it("prefers manifest contract values over stale shell env", () => {
    const runDockerBuild = vi.fn();
    const spawnImpl = vi.fn().mockReturnValue({ on: vi.fn() });

    startLocalGenerator({
      env: {
        ADMIN_CAP_ID:
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ADMIN_SUI_PRIVATE_KEY: "suiprivkey",
        NEXT_PUBLIC_PACKAGE_ID:
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        OP_FINALIZE_DISPATCH_SECRET: "shared-secret",
        PACKAGE_ID:
          "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      },
      runDockerBuild,
      spawnImpl,
    });

    expect(spawnImpl).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining([
        `PACKAGE_ID=${MANIFEST_PACKAGE_ID}`,
        `ADMIN_CAP_ID=${MANIFEST_ADMIN_CAP_ID}`,
      ]),
      expect.any(Object),
    );
  });

  it("defaults to 8080 when OP_LOCAL_GENERATOR_PORT is blank", () => {
    const runDockerBuild = vi.fn();
    const spawnImpl = vi.fn().mockReturnValue({ on: vi.fn() });

    startLocalGenerator({
      env: {
        OP_LOCAL_GENERATOR_PORT: "",
        PORT: "",
      },
      runDockerBuild,
      spawnImpl,
    });

    expect(spawnImpl).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining([
        "--name",
        "one-portrait-generator-8080",
        "--publish",
        "127.0.0.1:8080:8080",
      ]),
      expect.any(Object),
    );
  });

  it("uses PORT when OP_LOCAL_GENERATOR_PORT is unset", () => {
    const runDockerBuild = vi.fn();
    const spawnImpl = vi.fn().mockReturnValue({ on: vi.fn() });

    startLocalGenerator({
      env: {
        PORT: "9090",
      },
      runDockerBuild,
      spawnImpl,
    });

    expect(spawnImpl).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["--publish", "127.0.0.1:9090:8080"]),
      expect.any(Object),
    );
  });

  it("prefers OP_LOCAL_GENERATOR_PORT over PORT", () => {
    const runDockerBuild = vi.fn();
    const spawnImpl = vi.fn().mockReturnValue({ on: vi.fn() });

    startLocalGenerator({
      env: {
        OP_LOCAL_GENERATOR_PORT: "7070",
        PORT: "9090",
      },
      runDockerBuild,
      spawnImpl,
    });

    expect(spawnImpl).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["--publish", "127.0.0.1:7070:8080"]),
      expect.any(Object),
    );
  });
});
