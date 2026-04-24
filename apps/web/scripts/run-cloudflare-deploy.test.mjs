import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import {
  assertCloudflareDeployCredentials,
  buildCloudflareDeployArgs,
  buildCloudflareDeployEnv,
  getMissingCloudflareDeployCredentials,
} from "./run-cloudflare-deploy.mjs";

const NEUTRAL_PACKAGE_ID =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const NEUTRAL_ORIGINAL_PACKAGE_ID =
  "0x2222222222222222222222222222222222222222222222222222222222222222";

const manifest = {
  adminCapId:
    "0x3799b336f8163162451f4583c9213c432df2bd5145514fcc8089cc3f67de416e",
  enokiPublicApiKey: "enoki-public-manifest",
  googleClientId: "google-manifest",
  network: "testnet",
  originalPackageId: NEUTRAL_ORIGINAL_PACKAGE_ID,
  packageId: NEUTRAL_PACKAGE_ID,
  registryObjectId:
    "0x22cca7fbd9392a1fc24c4b1e038c99d23c5a23d72ed63a67893c39ce8374533f",
  walrusAggregator: "https://aggregator.walrus-testnet.walrus.space",
  walrusPublisher: "https://publisher.walrus-testnet.walrus.space",
};

test("buildCloudflareDeployArgs passes manifest public vars without keep-vars", () => {
  const args = buildCloudflareDeployArgs({ env: {}, manifest });

  assert.deepEqual(args.slice(0, 2), ["deploy", "--"]);
  assert.equal(args.includes("--keep-vars"), false);
  assert.equal(args.includes("NEXT_PUBLIC_SUI_NETWORK:testnet"), true);
  assert.equal(
    args.includes(`NEXT_PUBLIC_PACKAGE_ID:${manifest.packageId}`),
    true,
  );
  assert.equal(
    args.includes(
      `NEXT_PUBLIC_ORIGINAL_PACKAGE_ID:${manifest.originalPackageId}`,
    ),
    true,
  );
  assert.equal(
    args.includes(
      "NEXT_PUBLIC_REGISTRY_OBJECT_ID:0x22cca7fbd9392a1fc24c4b1e038c99d23c5a23d72ed63a67893c39ce8374533f",
    ),
    true,
  );
});

test("buildCloudflareDeployArgs includes only non-empty optional runtime URL vars", () => {
  const args = buildCloudflareDeployArgs({
    env: {
      OP_FINALIZE_DISPATCH_URL: "   ",
      OP_GENERATOR_BASE_URL: " https://generator.example.com ",
      OP_GENERATOR_RUNTIME_URL_OVERRIDE: "https://runtime.example.com",
    },
    manifest,
  });

  assert.equal(
    args.includes("OP_GENERATOR_BASE_URL:https://generator.example.com"),
    true,
  );
  assert.equal(
    args.includes(
      "OP_GENERATOR_RUNTIME_URL_OVERRIDE:https://runtime.example.com",
    ),
    true,
  );
  assert.equal(
    args.some((arg) => arg.startsWith("OP_FINALIZE_DISPATCH_URL:")),
    false,
  );
});

test("buildCloudflareDeployArgs excludes secret names from deploy args", () => {
  const args = buildCloudflareDeployArgs({
    env: {
      ADMIN_SUI_PRIVATE_KEY: "admin-secret",
      CLOUDFLARE_ACCOUNT_ID: "account-id",
      CLOUDFLARE_API_TOKEN: "cf-token",
      ENOKI_PRIVATE_API_KEY: "enoki-secret",
      OP_FINALIZE_DISPATCH_SECRET: "dispatch-secret",
    },
    manifest,
  });
  const serialized = args.join("\n");

  for (const secretName of [
    "ADMIN_SUI_PRIVATE_KEY",
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_API_TOKEN",
    "ENOKI_PRIVATE_API_KEY",
    "OP_FINALIZE_DISPATCH_SECRET",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(secretName));
  }
});

test("buildCloudflareDeployEnv uses the cloudflare build PATH and XDG_CONFIG_HOME convention", () => {
  const cwd = "/repo/apps/web";
  const env = buildCloudflareDeployEnv({
    cwd,
    env: { PATH: "/usr/bin" },
  });

  assert.equal(env.PATH, `${path.join(cwd, "scripts")}:/usr/bin`);
  assert.equal(env.XDG_CONFIG_HOME, path.join(cwd, ".wrangler"));
});

test("getMissingCloudflareDeployCredentials reports missing or blank credentials", () => {
  assert.deepEqual(
    getMissingCloudflareDeployCredentials({
      env: {
        CLOUDFLARE_ACCOUNT_ID: "   ",
        CLOUDFLARE_API_TOKEN: "token",
      },
    }),
    ["CLOUDFLARE_ACCOUNT_ID"],
  );
  assert.deepEqual(
    getMissingCloudflareDeployCredentials({
      env: {
        CLOUDFLARE_ACCOUNT_ID: "account-id",
        CLOUDFLARE_API_TOKEN: "token",
      },
    }),
    [],
  );
});

test("assertCloudflareDeployCredentials fails with an actionable message", () => {
  assert.throws(
    () =>
      assertCloudflareDeployCredentials({
        env: {
          CLOUDFLARE_ACCOUNT_ID: "",
          CLOUDFLARE_API_TOKEN: "",
        },
      }),
    /Missing required Cloudflare deploy credentials: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID/,
  );
});
