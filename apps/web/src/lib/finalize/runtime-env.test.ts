import { describe, expect, it } from "vitest";

import {
  loadFinalizeRuntimeEnv,
  MissingFinalizeRuntimeEnvError,
} from "./runtime-env";

const VALID = {
  NEXT_PUBLIC_SUI_NETWORK: "testnet",
  NEXT_PUBLIC_PACKAGE_ID: "0xpkg",
  NEXT_PUBLIC_WALRUS_PUBLISHER: "https://publisher.walrus.example",
  NEXT_PUBLIC_WALRUS_AGGREGATOR: "https://aggregator.walrus.example",
  ADMIN_CAP_ID: "0xadmincap",
  ADMIN_SUI_PRIVATE_KEY: "suiprivkey",
} as const;

describe("loadFinalizeRuntimeEnv", () => {
  it("maps the web runtime env into the generator container contract", () => {
    expect(loadFinalizeRuntimeEnv(VALID)).toEqual({
      SUI_NETWORK: "testnet",
      PACKAGE_ID: "0xpkg",
      WALRUS_PUBLISHER: "https://publisher.walrus.example",
      WALRUS_AGGREGATOR: "https://aggregator.walrus.example",
      ADMIN_CAP_ID: "0xadmincap",
      ADMIN_SUI_PRIVATE_KEY: "suiprivkey",
    });
  });

  it("trims surrounding whitespace from every required value", () => {
    expect(
      loadFinalizeRuntimeEnv({
        NEXT_PUBLIC_SUI_NETWORK: "  testnet  ",
        NEXT_PUBLIC_PACKAGE_ID: "  0xpkg  ",
        NEXT_PUBLIC_WALRUS_PUBLISHER: "  https://publisher.walrus.example  ",
        NEXT_PUBLIC_WALRUS_AGGREGATOR:
          "  https://aggregator.walrus.example  ",
        ADMIN_CAP_ID: "  0xadmincap  ",
        ADMIN_SUI_PRIVATE_KEY: "  suiprivkey  ",
      }),
    ).toEqual({
      SUI_NETWORK: "testnet",
      PACKAGE_ID: "0xpkg",
      WALRUS_PUBLISHER: "https://publisher.walrus.example",
      WALRUS_AGGREGATOR: "https://aggregator.walrus.example",
      ADMIN_CAP_ID: "0xadmincap",
      ADMIN_SUI_PRIVATE_KEY: "suiprivkey",
    });
  });

  it("explains that admin secrets belong in Cloudflare Secrets Store", () => {
    try {
      loadFinalizeRuntimeEnv({
        ...VALID,
        ADMIN_CAP_ID: "",
        ADMIN_SUI_PRIVATE_KEY: undefined,
      });
      expect.unreachable("loadFinalizeRuntimeEnv should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MissingFinalizeRuntimeEnvError);
      const message = (error as Error).message;
      expect(message).toContain("ADMIN_CAP_ID");
      expect(message).toContain("ADMIN_SUI_PRIVATE_KEY");
      expect(message).toContain("Cloudflare Secrets Store");
    }
  });
});
