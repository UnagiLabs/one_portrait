import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  buildPublicEnvKeys,
  checkBuildPublicEnv,
  loadBuildPublicEnvSource,
} from "./check-build-public-env.mjs";

const REQUIRED_LOCAL_KEYS = [
  "NEXT_PUBLIC_SUI_NETWORK",
  "NEXT_PUBLIC_REGISTRY_OBJECT_ID",
];

const REQUIRED_CLOUDFLARE_KEYS = [
  "NEXT_PUBLIC_SUI_NETWORK",
  "NEXT_PUBLIC_PACKAGE_ID",
  "NEXT_PUBLIC_REGISTRY_OBJECT_ID",
  "NEXT_PUBLIC_ENOKI_API_KEY",
  "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
  "NEXT_PUBLIC_WALRUS_PUBLISHER",
  "NEXT_PUBLIC_WALRUS_AGGREGATOR",
];

test("buildPublicEnvKeys exposes the cloudflare build requirements", () => {
  assert.deepEqual(buildPublicEnvKeys.cloudflare, REQUIRED_CLOUDFLARE_KEYS);
  assert.deepEqual(buildPublicEnvKeys.local, REQUIRED_LOCAL_KEYS);
});

test("local build merges env files when process.env is missing the values", () => {
  const cwd = createTempDir();
  writeFile(
    cwd,
    ".env.local",
    [
      "NEXT_PUBLIC_SUI_NETWORK=testnet",
      "NEXT_PUBLIC_REGISTRY_OBJECT_ID=0xreg-from-file",
      "NEXT_PUBLIC_PACKAGE_ID=0xpkg-from-file",
    ].join("\n"),
  );

  const source = loadBuildPublicEnvSource({
    cwd,
    env: {},
    mode: "local",
  });

  assert.equal(source.NEXT_PUBLIC_SUI_NETWORK, "testnet");
  assert.equal(source.NEXT_PUBLIC_REGISTRY_OBJECT_ID, "0xreg-from-file");
  assert.equal(source.NEXT_PUBLIC_PACKAGE_ID, "0xpkg-from-file");

  assert.doesNotThrow(() => {
    checkBuildPublicEnv({ cwd, env: {}, mode: "local" });
  });
});

test("local build fails when the read-only minimum keys are missing", () => {
  const cwd = createTempDir();
  writeFile(cwd, ".env.local", "NEXT_PUBLIC_SUI_NETWORK=testnet\n");

  assert.throws(() => {
    checkBuildPublicEnv({ cwd, env: {}, mode: "local" });
  }, /NEXT_PUBLIC_REGISTRY_OBJECT_ID/);
});

test("cloudflare build only trusts process.env and ignores wrangler.jsonc", () => {
  const cwd = createTempDir();
  writeFile(
    cwd,
    "wrangler.jsonc",
    JSON.stringify(
      {
        vars: {
          NEXT_PUBLIC_SUI_NETWORK: "testnet",
          NEXT_PUBLIC_PACKAGE_ID: "0xfrom-wrangler",
          NEXT_PUBLIC_REGISTRY_OBJECT_ID: "0xreg-from-wrangler",
          NEXT_PUBLIC_ENOKI_API_KEY: "enoki-from-wrangler",
          NEXT_PUBLIC_GOOGLE_CLIENT_ID: "google-from-wrangler",
          NEXT_PUBLIC_WALRUS_PUBLISHER: "https://publisher.example.com",
          NEXT_PUBLIC_WALRUS_AGGREGATOR: "https://aggregator.example.com",
        },
      },
      null,
      2,
    ),
  );

  assert.throws(() => {
    checkBuildPublicEnv({
      cwd,
      env: {
        NEXT_PUBLIC_SUI_NETWORK: "testnet",
        NEXT_PUBLIC_PACKAGE_ID: "0xexplicit",
        NEXT_PUBLIC_REGISTRY_OBJECT_ID: "0xreg-explicit",
        NEXT_PUBLIC_ENOKI_API_KEY: "enoki-explicit",
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: "google-explicit",
        NEXT_PUBLIC_WALRUS_PUBLISHER: "https://publisher.example.com",
      },
      mode: "cloudflare",
    });
  }, /NEXT_PUBLIC_WALRUS_AGGREGATOR/);
});

test("cloudflare build passes when every public build variable is present in process.env", () => {
  const cwd = createTempDir();

  assert.doesNotThrow(() => {
    checkBuildPublicEnv({
      cwd,
      env: {
        NEXT_PUBLIC_SUI_NETWORK: "testnet",
        NEXT_PUBLIC_PACKAGE_ID: "0xpkg",
        NEXT_PUBLIC_REGISTRY_OBJECT_ID: "0xreg",
        NEXT_PUBLIC_ENOKI_API_KEY: "enoki-public",
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: "google-client-id",
        NEXT_PUBLIC_WALRUS_PUBLISHER: "https://publisher.example.com",
        NEXT_PUBLIC_WALRUS_AGGREGATOR: "https://aggregator.example.com",
      },
      mode: "cloudflare",
    });
  });
});

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "one-portrait-build-env-"));
}

function writeFile(dir, name, content) {
  fs.writeFileSync(path.join(dir, name), content);
}
