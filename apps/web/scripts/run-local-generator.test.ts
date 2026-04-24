import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  loadWebScriptEnv,
  startLocalGenerator,
} from "./run-local-generator.mjs";

describe("startLocalGenerator", () => {
  it("builds the generator image and runs the container with forwarded env", () => {
    const repoRoot = createTempRepo();
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
        "PACKAGE_ID=0xpkg",
        "--env",
        "WALRUS_PUBLISHER=https://publisher.example.com",
        "--env",
        "WALRUS_AGGREGATOR=https://aggregator.example.com",
        "--env",
        "ADMIN_CAP_ID=0xadmincap",
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
    writeJson(repoRoot, "ops/deployments/testnet.json", {
      ADMIN_CAP_ID: "0xmanifestadmincap",
      NEXT_PUBLIC_PACKAGE_ID: "0xmanifestpkg",
      NEXT_PUBLIC_SUI_NETWORK: "testnet",
      NEXT_PUBLIC_WALRUS_PUBLISHER: "https://manifest-publisher.example.com",
    });
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

    expect(env.NEXT_PUBLIC_PACKAGE_ID).toBe("0xmanifestpkg");
    expect(env.PACKAGE_ID).toBe("0xmanifestpkg");
    expect(env.NEXT_PUBLIC_WALRUS_PUBLISHER).toBe(
      "https://manifest-publisher.example.com",
    );
    expect(env.WALRUS_PUBLISHER).toBe("https://manifest-publisher.example.com");
    expect(env.ADMIN_CAP_ID).toBe("0xmanifestadmincap");
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
    writeJson(repoRoot, "ops/deployments/testnet.json", {
      NEXT_PUBLIC_PACKAGE_ID: "0xmanifestpkg",
    });
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
