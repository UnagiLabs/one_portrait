import { describe, expect, it, vi } from "vitest";

import { ENOKI_JWT_HEADER } from "./api";
import { EnokiSubmitClientError, submitPhotoWithEnoki } from "./client-submit";

describe("submitPhotoWithEnoki", () => {
  it("runs sponsor, sign, and execute in order", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            bytes: "sponsored-bytes",
            digest: "sponsor-digest",
            sender: "0xsender",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            digest: "final-digest",
          }),
          { status: 200 },
        ),
      );
    const signTransaction = vi.fn(async () => ({
      signature: "wallet-signature",
    }));

    await expect(
      submitPhotoWithEnoki(
        {
          unitId:
            "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          blobId: "walrus-blob_1",
        },
        {
          fetchFn,
          getJwt: async () => "header.jwt.value",
          signTransaction,
        },
      ),
    ).resolves.toEqual({
      digest: "final-digest",
      sender: "0xsender",
    });

    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      "/api/enoki/submit-photo/sponsor",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          [ENOKI_JWT_HEADER]: "header.jwt.value",
        }),
      }),
    );
    expect(signTransaction).toHaveBeenCalledWith("sponsored-bytes");
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      "/api/enoki/submit-photo/execute",
      expect.objectContaining({
        body: JSON.stringify({
          digest: "sponsor-digest",
          signature: "wallet-signature",
        }),
      }),
    );
  });

  it("maps auth expiry before sponsorship starts", async () => {
    await expect(
      submitPhotoWithEnoki(
        {
          unitId:
            "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          blobId: "walrus-blob_1",
        },
        {
          getJwt: async () => null,
          signTransaction: vi.fn(),
        },
      ),
    ).rejects.toMatchObject({
      code: "auth_expired",
      status: 401,
    });
  });

  it("passes through structured API errors", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "invalid_args",
          message: "blob id is invalid",
        }),
        { status: 400 },
      ),
    );

    await expect(
      submitPhotoWithEnoki(
        {
          unitId:
            "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          blobId: "bad blob",
        },
        {
          fetchFn,
          getJwt: async () => "header.jwt.value",
          signTransaction: vi.fn(),
        },
      ),
    ).rejects.toEqual(
      new EnokiSubmitClientError(400, "invalid_args", "blob id is invalid"),
    );
  });
});
