export class WalrusReadError extends Error {
  readonly blobId: string;
  readonly status: number | null;

  constructor(
    blobId: string,
    message: string,
    options: {
      readonly cause?: unknown;
      readonly status?: number | null;
    } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : {});
    this.name = "WalrusReadError";
    this.blobId = blobId;
    this.status = options.status ?? null;
  }
}

export type WalrusReadClient = {
  getBlob(blobId: string): Promise<Uint8Array>;
};

export type WalrusReadClientOptions = {
  readonly aggregatorBaseUrl: string;
  readonly fetchFn?: typeof fetch;
};

export function createWalrusReadClient(
  options: WalrusReadClientOptions,
): WalrusReadClient {
  return {
    async getBlob(blobId: string): Promise<Uint8Array> {
      const response = await (options.fetchFn ?? fetch)(
        `${trimTrailingSlashes(options.aggregatorBaseUrl)}/v1/blobs/${blobId}`,
      );

      if (!response.ok) {
        throw new WalrusReadError(
          blobId,
          "Walrus から blob を取得できませんでした。",
          {
            status: response.status,
          },
        );
      }

      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/u, "");
}
