import { describe, expect, it } from "vitest";

import {
  loadEnokiServerEnv,
  loadSubmitPublicEnv,
  MissingEnokiServerEnvError,
  MissingSubmitPublicEnvError,
} from "./env";

const VALID = {
  NEXT_PUBLIC_SUI_NETWORK: "testnet",
  NEXT_PUBLIC_PACKAGE_ID: "0xpkg",
  NEXT_PUBLIC_REGISTRY_OBJECT_ID: "0xreg",
  NEXT_PUBLIC_ENOKI_API_KEY: "public-enoki-key",
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: "google-client-id",
  ENOKI_PRIVATE_API_KEY: "private-enoki-key",
} as const;

describe("loadSubmitPublicEnv", () => {
  it("returns the validated public submit env", () => {
    expect(loadSubmitPublicEnv(VALID)).toEqual({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      enokiApiKey: "public-enoki-key",
      googleClientId: "google-client-id",
    });
  });

  it("throws when package id is missing even if read-only env is valid", () => {
    expect(() =>
      loadSubmitPublicEnv({
        ...VALID,
        NEXT_PUBLIC_PACKAGE_ID: "   ",
      }),
    ).toThrow(MissingSubmitPublicEnvError);
  });

  it("reports every missing submit key", () => {
    try {
      loadSubmitPublicEnv({
        ...VALID,
        NEXT_PUBLIC_ENOKI_API_KEY: "",
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: undefined,
      });
      expect.unreachable("loadSubmitPublicEnv should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MissingSubmitPublicEnvError);
      const message = (error as Error).message;
      expect(message).toContain("NEXT_PUBLIC_ENOKI_API_KEY");
      expect(message).toContain("NEXT_PUBLIC_GOOGLE_CLIENT_ID");
    }
  });
});

describe("loadEnokiServerEnv", () => {
  it("returns the validated server env", () => {
    expect(loadEnokiServerEnv(VALID)).toEqual({
      privateApiKey: "private-enoki-key",
    });
  });

  it("throws when the private Enoki key is missing", () => {
    expect(() =>
      loadEnokiServerEnv({
        ...VALID,
        ENOKI_PRIVATE_API_KEY: "",
      }),
    ).toThrow(MissingEnokiServerEnvError);
  });
});
