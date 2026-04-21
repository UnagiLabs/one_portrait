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

  it("marks execute API failures as recovering and keeps sponsor context", async () => {
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
            code: "sponsor_failed",
            message: "execute failed",
          }),
          { status: 502 },
        ),
      );

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
          signTransaction: vi.fn(async () => ({
            signature: "wallet-signature",
          })),
        },
      ),
    ).rejects.toMatchObject({
      code: "sponsor_failed",
      status: 502,
      submissionStatus: "recovering",
      recovery: {
        digest: "sponsor-digest",
        sender: "0xsender",
        blobId: "walrus-blob_1",
      },
    });
  });

  it("marks execute transport failures as recovering and keeps sponsor context", async () => {
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
      .mockRejectedValueOnce(new Error("network down"));

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
          signTransaction: vi.fn(async () => ({
            signature: "wallet-signature",
          })),
        },
      ),
    ).rejects.toMatchObject({
      code: "sponsor_failed",
      status: 502,
      submissionStatus: "recovering",
      recovery: {
        digest: "sponsor-digest",
        sender: "0xsender",
        blobId: "walrus-blob_1",
      },
    });
  });

  it("keeps execute auth_expired as a confirmed failure", async () => {
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
            code: "auth_expired",
            message: "please log in again",
          }),
          { status: 401 },
        ),
      );

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
          signTransaction: vi.fn(async () => ({
            signature: "wallet-signature",
          })),
        },
      ),
    ).rejects.toMatchObject({
      code: "auth_expired",
      status: 401,
      submissionStatus: "failed",
      recovery: null,
    });
  });

  it("keeps execute invalid_args as a confirmed failure", async () => {
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
            code: "invalid_args",
            message: "signature is invalid",
          }),
          { status: 400 },
        ),
      );

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
          signTransaction: vi.fn(async () => ({
            signature: "wallet-signature",
          })),
        },
      ),
    ).rejects.toMatchObject({
      code: "invalid_args",
      status: 400,
      submissionStatus: "failed",
      recovery: null,
    });
  });

  it("keeps execute submit_unavailable as a confirmed failure when execute preflight fails", async () => {
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
            code: "submit_unavailable",
            message: "submit env missing",
          }),
          { status: 503 },
        ),
      );

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
          signTransaction: vi.fn(async () => ({
            signature: "wallet-signature",
          })),
        },
      ),
    ).rejects.toMatchObject({
      code: "submit_unavailable",
      status: 503,
      submissionStatus: "failed",
      recovery: null,
    });
  });
});
