import { describe, expect, it } from "vitest";

import { loadPublicEnv, MissingPublicEnvError, publicEnvKeys } from "./env";

const VALID = {
  NEXT_PUBLIC_SUI_NETWORK: "testnet",
  NEXT_PUBLIC_PACKAGE_ID: "0xpkg",
  NEXT_PUBLIC_REGISTRY_OBJECT_ID: "0xreg",
} as const;

describe("publicEnvKeys", () => {
  it("lists the required read-only keys in a stable order", () => {
    expect(publicEnvKeys).toEqual([
      "NEXT_PUBLIC_SUI_NETWORK",
      "NEXT_PUBLIC_REGISTRY_OBJECT_ID",
    ]);
  });
});

describe("loadPublicEnv", () => {
  it("returns a normalized env object when every key is present", () => {
    const env = loadPublicEnv({ ...VALID });

    expect(env).toEqual({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      originalPackageId: "0xpkg",
      registryObjectId: "0xreg",
    });
  });

  it("accepts every supported Sui network", () => {
    for (const network of ["testnet", "mainnet", "devnet", "localnet"]) {
      const env = loadPublicEnv({ ...VALID, NEXT_PUBLIC_SUI_NETWORK: network });
      expect(env.suiNetwork).toBe(network);
    }
  });

  it("trims surrounding whitespace from values", () => {
    const env = loadPublicEnv({
      NEXT_PUBLIC_SUI_NETWORK: "  testnet  ",
      NEXT_PUBLIC_ORIGINAL_PACKAGE_ID: "  0xoriginal  ",
      NEXT_PUBLIC_PACKAGE_ID: "  0xpkg  ",
      NEXT_PUBLIC_REGISTRY_OBJECT_ID: "  0xreg  ",
    });

    expect(env).toEqual({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      originalPackageId: "0xoriginal",
      registryObjectId: "0xreg",
    });
  });

  it("throws MissingPublicEnvError when a key is undefined", () => {
    const source = { ...VALID, NEXT_PUBLIC_REGISTRY_OBJECT_ID: undefined };

    expect(() => loadPublicEnv(source)).toThrow(MissingPublicEnvError);
  });

  it("throws MissingPublicEnvError when a value is empty or whitespace only", () => {
    const source = { ...VALID, NEXT_PUBLIC_REGISTRY_OBJECT_ID: "   " };

    expect(() => loadPublicEnv(source)).toThrow(MissingPublicEnvError);
  });

  it("reports every missing key in the error message", () => {
    const source = {
      NEXT_PUBLIC_SUI_NETWORK: "",
      NEXT_PUBLIC_PACKAGE_ID: undefined,
      NEXT_PUBLIC_REGISTRY_OBJECT_ID: "",
    };

    try {
      loadPublicEnv(source);
      expect.unreachable("loadPublicEnv should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MissingPublicEnvError);
      const message = (error as Error).message;
      expect(message).toContain("NEXT_PUBLIC_SUI_NETWORK");
      expect(message).toContain("NEXT_PUBLIC_REGISTRY_OBJECT_ID");
      expect(message).not.toContain("NEXT_PUBLIC_PACKAGE_ID");
    }
  });

  it("rejects an unsupported Sui network value", () => {
    const source = { ...VALID, NEXT_PUBLIC_SUI_NETWORK: "production" };

    expect(() => loadPublicEnv(source)).toThrow(/NEXT_PUBLIC_SUI_NETWORK/);
  });

  it("keeps package id optional so read-only pages can still load", () => {
    const env = loadPublicEnv({
      ...VALID,
      NEXT_PUBLIC_PACKAGE_ID: "   ",
    });

    expect(env).toEqual({
      suiNetwork: "testnet",
      packageId: null,
      originalPackageId: null,
      registryObjectId: "0xreg",
    });
  });
});
