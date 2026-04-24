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

test("local build prefers deployment manifest public env over .env.local", () => {
  const repoRoot = createTempDir();
  const cwd = path.join(repoRoot, "apps/web");
  fs.mkdirSync(cwd, { recursive: true });
  writeFile(
    cwd,
    ".env.local",
    [
      "NEXT_PUBLIC_SUI_NETWORK=devnet",
      "NEXT_PUBLIC_REGISTRY_OBJECT_ID=0xreg-from-env-local",
      "NEXT_PUBLIC_PACKAGE_ID=0xpkg-from-env-local",
    ].join("\n"),
  );
  writeFile(
    path.join(repoRoot, "ops/deployments"),
    "testnet.json",
    JSON.stringify(
      {
        adminCapId:
          "0x3799b336f8163162451f4583c9213c432df2bd5145514fcc8089cc3f67de416e",
        enokiPublicApiKey: "enoki-public-manifest",
        googleClientId: "google-manifest",
        network: "testnet",
        packageId:
          "0x8568f91f71674184b5c8711b550ec6b001e88f09adbc22c7ad31e1173f02ffbf",
        registryObjectId:
          "0x22cca7fbd9392a1fc24c4b1e038c99d23c5a23d72ed63a67893c39ce8374533f",
        walrusAggregator: "https://aggregator.walrus-testnet.walrus.space",
        walrusPublisher: "https://publisher.walrus-testnet.walrus.space",
      },
      null,
      2,
    ),
  );

  const source = loadBuildPublicEnvSource({
    cwd,
    env: {},
    mode: "local",
  });

  assert.equal(source.NEXT_PUBLIC_SUI_NETWORK, "testnet");
  assert.equal(
    source.NEXT_PUBLIC_REGISTRY_OBJECT_ID,
    "0x22cca7fbd9392a1fc24c4b1e038c99d23c5a23d72ed63a67893c39ce8374533f",
  );
  assert.equal(
    source.NEXT_PUBLIC_PACKAGE_ID,
    "0x8568f91f71674184b5c8711b550ec6b001e88f09adbc22c7ad31e1173f02ffbf",
  );
});

test("local build warns about duplicated canonical public env without values", () => {
  const repoRoot = createTempDir();
  const cwd = path.join(repoRoot, "apps/web");
  fs.mkdirSync(cwd, { recursive: true });
  writeFile(
    cwd,
    ".env.local",
    "NEXT_PUBLIC_PACKAGE_ID=0xenvlocal-secret-shaped-value\n",
  );
  writeFile(
    path.join(repoRoot, "ops/deployments"),
    "testnet.json",
    JSON.stringify(
      {
        adminCapId:
          "0x3799b336f8163162451f4583c9213c432df2bd5145514fcc8089cc3f67de416e",
        enokiPublicApiKey: "enoki-public-manifest",
        googleClientId: "google-manifest",
        network: "testnet",
        packageId:
          "0x8568f91f71674184b5c8711b550ec6b001e88f09adbc22c7ad31e1173f02ffbf",
        registryObjectId:
          "0x22cca7fbd9392a1fc24c4b1e038c99d23c5a23d72ed63a67893c39ce8374533f",
        walrusAggregator: "https://aggregator.walrus-testnet.walrus.space",
        walrusPublisher: "https://publisher.walrus-testnet.walrus.space",
      },
      null,
      2,
    ),
  );
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));

  try {
    loadBuildPublicEnvSource({ cwd, env: {}, mode: "local" });
  } finally {
    console.warn = originalWarn;
  }

  const warning = warnings.join("\n");
  assert.match(warning, /NEXT_PUBLIC_PACKAGE_ID/);
  assert.match(warning, /ops\/deployments\/testnet\.json/);
  assert.doesNotMatch(warning, /0xenvlocal-secret-shaped-value/);
  assert.doesNotMatch(warning, /0x8568f91/);
});

test("local build fails when the read-only minimum keys are missing", () => {
  const cwd = createTempDir();
  writeFile(cwd, ".env.local", "NEXT_PUBLIC_SUI_NETWORK=testnet\n");

  assert.throws(() => {
    checkBuildPublicEnv({ cwd, env: {}, mode: "local" });
  }, /NEXT_PUBLIC_REGISTRY_OBJECT_ID/);
});

test("cloudflare build falls back to wrangler.jsonc vars when process.env is missing values", () => {
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

  const source = checkBuildPublicEnv({
    cwd,
    env: {
      NEXT_PUBLIC_SUI_NETWORK: "testnet",
    },
    mode: "cloudflare",
  });

  assert.equal(source.NEXT_PUBLIC_PACKAGE_ID, "0xfrom-wrangler");
  assert.equal(
    source.NEXT_PUBLIC_WALRUS_AGGREGATOR,
    "https://aggregator.example.com",
  );
});

test("cloudflare build prefers process.env over wrangler.jsonc vars", () => {
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

  const source = loadBuildPublicEnvSource({
    cwd,
    env: {
      NEXT_PUBLIC_PACKAGE_ID: "0xexplicit",
      NEXT_PUBLIC_GOOGLE_CLIENT_ID: "google-explicit",
    },
    mode: "cloudflare",
  });

  assert.equal(source.NEXT_PUBLIC_PACKAGE_ID, "0xexplicit");
  assert.equal(source.NEXT_PUBLIC_GOOGLE_CLIENT_ID, "google-explicit");
});

test("deployment manifest values override stale build env values", () => {
  const cwd = createTempDir();
  const manifestPath = path.join(cwd, "testnet.json");
  writeFile(
    cwd,
    "testnet.json",
    JSON.stringify({
      adminCapId:
        "0x3799b336f8163162451f4583c9213c432df2bd5145514fcc8089cc3f67de416e",
      enokiPublicApiKey: "enoki-public-manifest",
      googleClientId: "google-manifest",
      network: "testnet",
      packageId:
        "0x8568f91f71674184b5c8711b550ec6b001e88f09adbc22c7ad31e1173f02ffbf",
      registryObjectId:
        "0x22cca7fbd9392a1fc24c4b1e038c99d23c5a23d72ed63a67893c39ce8374533f",
      walrusAggregator: "https://aggregator.walrus-testnet.walrus.space",
      walrusPublisher: "https://publisher.walrus-testnet.walrus.space",
    }),
  );

  const previousManifestPath = process.env.OP_DEPLOYMENT_MANIFEST;
  process.env.OP_DEPLOYMENT_MANIFEST = manifestPath;

  try {
    const source = loadBuildPublicEnvSource({
      cwd,
      env: {
        NEXT_PUBLIC_PACKAGE_ID:
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      mode: "cloudflare",
    });

    assert.equal(
      source.NEXT_PUBLIC_PACKAGE_ID,
      "0x8568f91f71674184b5c8711b550ec6b001e88f09adbc22c7ad31e1173f02ffbf",
    );
  } finally {
    if (previousManifestPath === undefined) {
      delete process.env.OP_DEPLOYMENT_MANIFEST;
    } else {
      process.env.OP_DEPLOYMENT_MANIFEST = previousManifestPath;
    }
  }
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

test("cloudflare build fails when NEXT_PUBLIC_SUI_NETWORK is invalid", () => {
  const cwd = createTempDir();

  assert.throws(() => {
    checkBuildPublicEnv({
      cwd,
      env: {
        NEXT_PUBLIC_SUI_NETWORK: "bogus",
        NEXT_PUBLIC_PACKAGE_ID: "0xpkg",
        NEXT_PUBLIC_REGISTRY_OBJECT_ID: "0xreg",
        NEXT_PUBLIC_ENOKI_API_KEY: "enoki-public",
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: "google-client-id",
        NEXT_PUBLIC_WALRUS_PUBLISHER: "https://publisher.example.com",
        NEXT_PUBLIC_WALRUS_AGGREGATOR: "https://aggregator.example.com",
      },
      mode: "cloudflare",
    });
  }, /Expected one of: mainnet, testnet, devnet, localnet/);
});

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "one-portrait-build-env-"));
}

function writeFile(dir, name, content) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), content);
}
