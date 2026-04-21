import { EnokiClientError } from "@mysten/enoki";
import { describe, expect, it, vi } from "vitest";

import { ENOKI_JWT_HEADER, EnokiApiError } from "./api";
import {
  executeSponsoredSubmitPhoto,
  parseExecuteSponsoredInput,
  parseSubmitPhotoInput,
  readZkLoginJwt,
  resolveRuntimeEnv,
  sponsorSubmitPhoto,
  submitPhotoTarget,
} from "./submit-photo";

const VALID_UNIT_ID =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

describe("parseSubmitPhotoInput", () => {
  it("accepts a valid submit payload", () => {
    expect(
      parseSubmitPhotoInput({
        unitId: VALID_UNIT_ID,
        blobId: "walrus-blob_1",
      }),
    ).toEqual({
      unitId: VALID_UNIT_ID,
      blobId: "walrus-blob_1",
    });
  });

  it("rejects extra keys", () => {
    expect(() =>
      parseSubmitPhotoInput({
        unitId: VALID_UNIT_ID,
        blobId: "walrus-blob_1",
        extra: "nope",
      }),
    ).toThrow(EnokiApiError);
  });
});

describe("parseExecuteSponsoredInput", () => {
  it("accepts digest and signature", () => {
    expect(
      parseExecuteSponsoredInput({
        digest: "digest",
        signature: "signature",
      }),
    ).toEqual({
      digest: "digest",
      signature: "signature",
    });
  });
});

describe("readZkLoginJwt", () => {
  it("reads the JWT from the expected header", () => {
    const headers = new Headers({
      [ENOKI_JWT_HEADER]: "header.jwt.value",
    });

    expect(readZkLoginJwt(headers)).toBe("header.jwt.value");
  });

  it("throws when the JWT header is missing", () => {
    expect(() => readZkLoginJwt(new Headers())).toThrow(EnokiApiError);
  });
});

describe("resolveRuntimeEnv", () => {
  it("maps the validated env into runtime values", () => {
    expect(
      resolveRuntimeEnv({
        NEXT_PUBLIC_SUI_NETWORK: "testnet",
        NEXT_PUBLIC_PACKAGE_ID: "0xpkg",
        NEXT_PUBLIC_REGISTRY_OBJECT_ID: "0xreg",
        NEXT_PUBLIC_ENOKI_API_KEY: "public-key",
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: "google-client-id",
        ENOKI_PRIVATE_API_KEY: "private-key",
      }),
    ).toEqual({
      network: "testnet",
      packageId: "0xpkg",
      privateApiKey: "private-key",
    });
  });
});

describe("sponsorSubmitPhoto", () => {
  it("validates the JWT and restricts sponsorship to submit_photo", async () => {
    const getZkLogin = vi.fn(async () => ({
      address: "0xsender",
      publicKey: "public",
      salt: "salt",
    }));
    const createSponsoredTransaction = vi.fn(async () => ({
      bytes: "sponsored-bytes",
      digest: "digest",
    }));
    const buildTransactionKind = vi.fn(async () => "kind-bytes");

    const result = await sponsorSubmitPhoto(
      {
        jwt: "jwt",
        unitId: VALID_UNIT_ID,
        blobId: "walrus-blob_1",
      },
      {
        network: "testnet",
        packageId: "0xpkg",
        privateApiKey: "private-key",
      },
      {
        enokiClient: {
          getZkLogin,
          createSponsoredTransaction,
        },
        buildTransactionKind,
      },
    );

    expect(result).toEqual({
      bytes: "sponsored-bytes",
      digest: "digest",
      sender: "0xsender",
    });
    expect(getZkLogin).toHaveBeenCalledWith({ jwt: "jwt" });
    expect(buildTransactionKind).toHaveBeenCalledWith({
      network: "testnet",
      packageId: "0xpkg",
      unitId: VALID_UNIT_ID,
      blobId: "walrus-blob_1",
    });
    expect(createSponsoredTransaction).toHaveBeenCalledWith({
      network: "testnet",
      sender: "0xsender",
      transactionKindBytes: "kind-bytes",
      allowedMoveCallTargets: [submitPhotoTarget("0xpkg")],
    });
  });

  it("maps Enoki auth failures to auth_expired", async () => {
    await expect(
      sponsorSubmitPhoto(
        {
          jwt: "jwt",
          unitId: VALID_UNIT_ID,
          blobId: "walrus-blob_1",
        },
        {
          network: "testnet",
          packageId: "0xpkg",
          privateApiKey: "private-key",
        },
        {
          enokiClient: {
            getZkLogin: vi.fn(async () => {
              throw new EnokiClientError(
                401,
                JSON.stringify({
                  errors: [
                    {
                      code: "unauthorized",
                      message: "jwt expired",
                      data: null,
                    },
                  ],
                }),
              );
            }),
            createSponsoredTransaction: vi.fn(),
          },
          buildTransactionKind: vi.fn(),
        },
      ),
    ).rejects.toMatchObject({
      code: "auth_expired",
      status: 401,
    });
  });
});

describe("executeSponsoredSubmitPhoto", () => {
  it("revalidates the JWT before executing the sponsored transaction", async () => {
    const getZkLogin = vi.fn(async () => ({
      address: "0xsender",
      publicKey: "public",
      salt: "salt",
    }));
    const executeSponsoredTransaction = vi.fn(async () => ({
      digest: "digest",
    }));

    await expect(
      executeSponsoredSubmitPhoto(
        {
          jwt: "jwt",
          digest: "digest",
          signature: "signature",
        },
        {
          network: "testnet",
          packageId: "0xpkg",
          privateApiKey: "private-key",
        },
        {
          enokiClient: {
            getZkLogin,
            executeSponsoredTransaction,
          },
        },
      ),
    ).resolves.toEqual({
      digest: "digest",
    });

    expect(getZkLogin).toHaveBeenCalledWith({ jwt: "jwt" });
    expect(executeSponsoredTransaction).toHaveBeenCalledWith({
      digest: "digest",
      signature: "signature",
    });
  });
});
