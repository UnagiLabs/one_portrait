const DEFAULT_MOSAIC_WALRUS_EPOCHS = 50;

export class WalrusWriteError extends Error {
  readonly status: number | null;

  constructor(
    message: string,
    options: {
      readonly cause?: unknown;
      readonly status?: number | null;
    } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : {});
    this.name = "WalrusWriteError";
    this.status = options.status ?? null;
  }
}

export type WalrusWriteClient = {
  putBlob(bytes: Uint8Array, contentType?: string): Promise<{
    readonly blobId: string;
    readonly aggregatorUrl: string;
  }>;
};

export function createWalrusWriteClient(options: {
  readonly publisherBaseUrl: string;
  readonly aggregatorBaseUrl: string;
  readonly epochs?: number;
  readonly fetchFn?: typeof fetch;
}): WalrusWriteClient {
  return {
    async putBlob(bytes: Uint8Array, contentType = "image/png") {
      const fetchFn = options.fetchFn ?? fetch;
      const publisherBaseUrl = trimTrailingSlashes(options.publisherBaseUrl);
      const aggregatorBaseUrl = trimTrailingSlashes(options.aggregatorBaseUrl);
      const epochs = options.epochs ?? DEFAULT_MOSAIC_WALRUS_EPOCHS;
      const response = await fetchFn(
        `${publisherBaseUrl}/v1/blobs?epochs=${epochs}`,
        {
          method: "PUT",
          body: bytes,
          headers: {
            "content-type": contentType,
          },
        },
      );

      if (!response.ok) {
        throw new WalrusWriteError("Walrus publisher upload failed.", {
          status: response.status,
        });
      }

      const payload = await response.json();
      const blobId = readBlobId(payload);

      if (!blobId) {
        throw new WalrusWriteError(
          "Walrus publisher response did not include blobId.",
          {
            cause: payload,
          },
        );
      }

      return {
        blobId,
        aggregatorUrl: `${aggregatorBaseUrl}/v1/blobs/${blobId}`,
      };
    },
  };
}

function readBlobId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const newlyCreated = record.newlyCreated;

  if (typeof newlyCreated === "object" && newlyCreated !== null) {
    const blobObject = (newlyCreated as Record<string, unknown>).blobObject;

    if (typeof blobObject === "object" && blobObject !== null) {
      const blobId = (blobObject as Record<string, unknown>).blobId;

      if (typeof blobId === "string" && blobId.length > 0) {
        return blobId;
      }
    }
  }

  const alreadyCertified = record.alreadyCertified;

  if (typeof alreadyCertified === "object" && alreadyCertified !== null) {
    const blobId = (alreadyCertified as Record<string, unknown>).blobId;

    if (typeof blobId === "string" && blobId.length > 0) {
      return blobId;
    }
  }

  return null;
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/u, "");
}
