import { describe, expect, it } from "vitest";

import testnetDeploymentManifest from "../ops/deployments/testnet.json";
import {
  checkPublishedTomlDrift,
  parseDeploymentManifest,
  toGeneratorEnv,
  toWebPublicEnv,
} from "../scripts/deployment-env.mjs";

const VALID_MANIFEST = testnetDeploymentManifest;

describe("deployment manifest", () => {
  it("exports web public and generator env", () => {
    const manifest = parseDeploymentManifest(VALID_MANIFEST);

    expect(toWebPublicEnv(manifest)).toMatchObject({
      NEXT_PUBLIC_PACKAGE_ID: VALID_MANIFEST.packageId,
      NEXT_PUBLIC_REGISTRY_OBJECT_ID: VALID_MANIFEST.registryObjectId,
      NEXT_PUBLIC_SUI_NETWORK: "testnet",
      NEXT_PUBLIC_WALRUS_AGGREGATOR: VALID_MANIFEST.walrusAggregator,
      NEXT_PUBLIC_WALRUS_PUBLISHER: VALID_MANIFEST.walrusPublisher,
    });
    expect(toGeneratorEnv(manifest)).toEqual({
      ADMIN_CAP_ID: VALID_MANIFEST.adminCapId,
      PACKAGE_ID: VALID_MANIFEST.packageId,
      SUI_NETWORK: "testnet",
      WALRUS_AGGREGATOR: VALID_MANIFEST.walrusAggregator,
      WALRUS_PUBLISHER: VALID_MANIFEST.walrusPublisher,
    });
  });

  it("rejects missing required keys", () => {
    expect(() =>
      parseDeploymentManifest({
        ...VALID_MANIFEST,
        registryObjectId: "",
      }),
    ).toThrow(/registryObjectId/);
  });

  it("rejects invalid Sui object ids", () => {
    expect(() =>
      parseDeploymentManifest({
        ...VALID_MANIFEST,
        packageId: "0xpkg",
      }),
    ).toThrow(/packageId/);
  });

  it("rejects invalid networks", () => {
    expect(() =>
      parseDeploymentManifest({
        ...VALID_MANIFEST,
        network: "production",
      }),
    ).toThrow(/invalid network/);
  });

  it("fails the drift check when Published.toml differs from the manifest", () => {
    expect(() =>
      checkPublishedTomlDrift({
        manifest: parseDeploymentManifest(VALID_MANIFEST),
        publishedTomlPath: new URL(
          "../contracts/Published.toml",
          import.meta.url,
        ).pathname,
      }),
    ).not.toThrow();

    expect(() =>
      checkPublishedTomlDrift({
        manifest: parseDeploymentManifest({
          ...VALID_MANIFEST,
          packageId:
            "0x9999999999999999999999999999999999999999999999999999999999999999",
        }),
        publishedTomlPath: new URL(
          "../contracts/Published.toml",
          import.meta.url,
        ).pathname,
      }),
    ).toThrow(/does not match/);
  });
});
