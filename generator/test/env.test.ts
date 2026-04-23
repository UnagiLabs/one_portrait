import { describe, expect, it } from "vitest";

import {
  loadGeneratorRuntimeEnv,
  MissingGeneratorRuntimeEnvError,
} from "../src/env";

const VALID = {
  SUI_NETWORK: "testnet",
  PACKAGE_ID: "0xpkg",
  ADMIN_CAP_ID: "0xadmincap",
  ADMIN_SUI_PRIVATE_KEY: "suiprivkey",
  WALRUS_PUBLISHER: "https://publisher.walrus.example",
  WALRUS_AGGREGATOR: "https://aggregator.walrus.example",
} as const;

describe("loadGeneratorRuntimeEnv", () => {
  it("returns the normalized container runtime env", () => {
    expect(loadGeneratorRuntimeEnv(VALID)).toEqual({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      adminCapId: "0xadmincap",
      adminPrivateKey: "suiprivkey",
      demoFinalizeManifestPath: null,
      walrusPublisherBaseUrl: "https://publisher.walrus.example",
      walrusAggregatorBaseUrl: "https://aggregator.walrus.example",
    });
  });

  it("reads an optional demo finalize manifest path when present", () => {
    expect(
      loadGeneratorRuntimeEnv({
        ...VALID,
        OP_DEMO_FINALIZE_MANIFEST: "  /tmp/demo-manifest.json  ",
      }),
    ).toMatchObject({
      demoFinalizeManifestPath: "/tmp/demo-manifest.json",
    });
  });

  it("rejects unsupported Sui network names", () => {
    expect(() =>
      loadGeneratorRuntimeEnv({
        ...VALID,
        SUI_NETWORK: "production",
      }),
    ).toThrow(/SUI_NETWORK/);
  });

  it("explains that deploy-time admin values come from Cloudflare", () => {
    try {
      loadGeneratorRuntimeEnv({
        ...VALID,
        ADMIN_CAP_ID: "",
        ADMIN_SUI_PRIVATE_KEY: undefined,
      });
      expect.unreachable("loadGeneratorRuntimeEnv should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MissingGeneratorRuntimeEnvError);
      const message = (error as Error).message;
      expect(message).toContain("ADMIN_CAP_ID");
      expect(message).toContain("ADMIN_SUI_PRIVATE_KEY");
      expect(message).toContain("Cloudflare");
    }
  });
});
