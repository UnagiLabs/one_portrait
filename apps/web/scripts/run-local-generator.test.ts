import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  loadWebScriptEnv,
  startLocalGenerator,
} from "./run-local-generator.mjs";

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
    const repoRoot = createTempRepo();
    writeManifest(repoRoot);
    const runDockerBuild = vi.fn();
    const spawnImpl = vi.fn().mockReturnValue({ on: vi.fn() });

    startLocalGenerator({
      cwd: repoRoot,
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
      webRoot: path.join(repoRoot, "apps/web"),
    });

    expect(runDockerBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        contextPath: repoRoot,
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
        cwd: repoRoot,
        stdio: "inherit",
      }),
    );
  });

  it("prefers manifest contract values over stale shell env", () => {
    const repoRoot = createTempRepo();
    writeManifest(repoRoot);
    const runDockerBuild = vi.fn();
    const spawnImpl = vi.fn().mockReturnValue({ on: vi.fn() });

    startLocalGenerator({
      cwd: repoRoot,
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
      webRoot: path.join(repoRoot, "apps/web"),
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
    const repoRoot = createTempRepo();
    const runDockerBuild = vi.fn();
    const spawnImpl = vi.fn().mockReturnValue({ on: vi.fn() });

    startLocalGenerator({
      cwd: repoRoot,
      env: {
        OP_LOCAL_GENERATOR_PORT: "",
        PORT: "",
      },
      runDockerBuild,
      spawnImpl,
      webRoot: path.join(repoRoot, "apps/web"),
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
    const repoRoot = createTempRepo();
    const runDockerBuild = vi.fn();
    const spawnImpl = vi.fn().mockReturnValue({ on: vi.fn() });

    startLocalGenerator({
      cwd: repoRoot,
      env: {
        PORT: "9090",
      },
      runDockerBuild,
      spawnImpl,
      webRoot: path.join(repoRoot, "apps/web"),
    });

    expect(spawnImpl).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["--publish", "127.0.0.1:9090:8080"]),
      expect.any(Object),
    );
  });

  it("prefers OP_LOCAL_GENERATOR_PORT over PORT", () => {
    const repoRoot = createTempRepo();
    const runDockerBuild = vi.fn();
    const spawnImpl = vi.fn().mockReturnValue({ on: vi.fn() });

    startLocalGenerator({
      cwd: repoRoot,
      env: {
        OP_LOCAL_GENERATOR_PORT: "7070",
        PORT: "9090",
      },
      runDockerBuild,
      spawnImpl,
      webRoot: path.join(repoRoot, "apps/web"),
    });

    expect(spawnImpl).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["--publish", "127.0.0.1:7070:8080"]),
      expect.any(Object),
    );
  });
});

describe("loadWebScriptEnv", () => {
  it("loads local deployment secrets into generator env", () => {
    const repoRoot = createTempRepo();
    writeFile(
      repoRoot,
      "ops/deployments/testnet.secrets.local.env",
      [
        "ADMIN_SUI_PRIVATE_KEY=secret-from-file",
        "OP_FINALIZE_DISPATCH_SECRET=dispatch-from-file",
        "ENOKI_PRIVATE_API_KEY=enoki-from-file",
      ].join("\n"),
    );

    const env = loadWebScriptEnv({
      env: {},
      repoRoot,
      webRoot: path.join(repoRoot, "apps/web"),
    });

    expect(env.ADMIN_SUI_PRIVATE_KEY).toBe("secret-from-file");
    expect(env.OP_FINALIZE_DISPATCH_SECRET).toBe("dispatch-from-file");
    expect(env.ENOKI_PRIVATE_API_KEY).toBe("enoki-from-file");
  });

  it("prefers deployment manifest and local deployment secrets over .env.local", () => {
    const repoRoot = createTempRepo();
    writeFile(
      repoRoot,
      "apps/web/.env.local",
      [
        "NEXT_PUBLIC_PACKAGE_ID=0xenvlocalpkg",
        "PACKAGE_ID=0xenvlocalpkg",
        "NEXT_PUBLIC_WALRUS_PUBLISHER=https://envlocal-publisher.example.com",
        "WALRUS_PUBLISHER=https://envlocal-publisher.example.com",
        "ADMIN_CAP_ID=0xenvlocaladmincap",
        "ADMIN_SUI_PRIVATE_KEY=envlocal-private-key",
      ].join("\n"),
    );
    writeManifest(repoRoot);
    writeFile(
      repoRoot,
      "ops/deployments/testnet.secrets.local.env",
      "ADMIN_SUI_PRIVATE_KEY=secret-from-file\n",
    );

    const env = loadWebScriptEnv({
      env: {},
      repoRoot,
      webRoot: path.join(repoRoot, "apps/web"),
    });

    expect(env.NEXT_PUBLIC_PACKAGE_ID).toBe(MANIFEST_PACKAGE_ID);
    expect(env.PACKAGE_ID).toBe(MANIFEST_PACKAGE_ID);
    expect(env.NEXT_PUBLIC_WALRUS_PUBLISHER).toBe(MANIFEST_WALRUS_PUBLISHER);
    expect(env.WALRUS_PUBLISHER).toBe(MANIFEST_WALRUS_PUBLISHER);
    expect(env.ADMIN_CAP_ID).toBe(MANIFEST_ADMIN_CAP_ID);
    expect(env.ADMIN_SUI_PRIVATE_KEY).toBe("secret-from-file");
  });

  it("warns about duplicated canonical keys without printing secret values", () => {
    const repoRoot = createTempRepo();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    writeFile(
      repoRoot,
      "apps/web/.env.local",
      [
        "NEXT_PUBLIC_PACKAGE_ID=0xenvlocalpkg",
        "ADMIN_SUI_PRIVATE_KEY=envlocal-private-key",
      ].join("\n"),
    );
    writeManifest(repoRoot);
    writeFile(
      repoRoot,
      "ops/deployments/testnet.secrets.local.env",
      "ADMIN_SUI_PRIVATE_KEY=secret-from-file\n",
    );

    loadWebScriptEnv({
      env: {},
      repoRoot,
      webRoot: path.join(repoRoot, "apps/web"),
    });

    const warning = warn.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(warning).toContain("NEXT_PUBLIC_PACKAGE_ID");
    expect(warning).toContain("ADMIN_SUI_PRIVATE_KEY");
    expect(warning).toContain("ops/deployments/testnet.json");
    expect(warning).toContain("ops/deployments/testnet.secrets.local.env");
    expect(warning).not.toContain("envlocal-private-key");
    expect(warning).not.toContain("secret-from-file");
    warn.mockRestore();
  });
});

function createTempRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "one-portrait-env-"));
  fs.mkdirSync(path.join(repoRoot, "apps/web"), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, "ops/deployments"), { recursive: true });
  return repoRoot;
}

function writeFile(repoRoot, relativePath, content) {
  const filePath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writeJson(repoRoot, relativePath, value) {
  writeFile(repoRoot, relativePath, JSON.stringify(value, null, 2));
}

function writeManifest(repoRoot) {
  writeJson(repoRoot, "ops/deployments/testnet.json", {
    adminCapId: MANIFEST_ADMIN_CAP_ID,
    enokiPublicApiKey: "enoki-public-manifest",
    googleClientId: "google-manifest",
    network: "testnet",
    packageId: MANIFEST_PACKAGE_ID,
    registryObjectId:
      "0x22cca7fbd9392a1fc24c4b1e038c99d23c5a23d72ed63a67893c39ce8374533f",
    walrusAggregator: MANIFEST_WALRUS_AGGREGATOR,
    walrusPublisher: MANIFEST_WALRUS_PUBLISHER,
  });
}
