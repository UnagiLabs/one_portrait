/**
 * Network mocking fixture for E2E specs.
 *
 * Intercepts client-side traffic so Playwright runs do not touch Sui testnet,
 * Enoki, or Walrus. Server-side fetches from Next.js server components (e.g.,
 * the `Registry`/`Unit` read on the homepage) are NOT intercepted here — the
 * app already degrades those failures to a `waiting`/`unavailable` card, which
 * is enough for the smoke path. Client traffic covered:
 *
 * - Sui JSON-RPC (fullnode.testnet.sui.io) — dispatched by `method`.
 * - `/api/enoki/submit-photo/sponsor` / `/execute` — configurable success or
 *   recovery failure.
 * - Walrus Publisher `PUT /v1/blobs` — return stub `blobId`.
 */

import { unitTileCount } from "@one-portrait/shared";
import type { Page, Route } from "@playwright/test";

import {
  E2E_STUB_ACCOUNT_ADDRESS,
  E2E_STUB_WALLET_NAME,
} from "../../../src/lib/enoki/stub-wallet";

export const STUB_UNIT_ID =
  "0x00000000000000000000000000000000000000000000000000000000000ab1e5";
export const STUB_ATHLETE_ID = "1";
export const STUB_REGISTRY_TABLE_ID =
  "0x0000000000000000000000000000000000000000000000000000000000001ab1e";
export const STUB_PACKAGE_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000001";
export const STUB_REGISTRY_OBJECT_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000002";
export const STUB_BLOB_ID = "STUB_BLOB_ID_XYZ";
export const STUB_DIGEST = "4q49qZdCaTzeU2BP4mfQesc2dbt3h32Qn2rLHHwrBJne";
export const STUB_KAKERA_OBJECT_ID =
  "0x00000000000000000000000000000000000000000000000000000000000ka123";
export const STUB_SUBMISSION_NO = 1;

/** Derived constants used by the test assertions. */
export const KAKERA_TYPE = `${STUB_PACKAGE_ID}::kakera::Kakera`;

export type MockState = {
  submitExecuted: boolean;
};

export type InstallMockOptions = {
  readonly executeApiMode?: "success" | "recovering_http_error";
  readonly transactionExecutionStatus?: "success" | "failed" | "unknown";
  readonly transactionBlockDelayMs?: number;
  readonly kakeraVisibleAfterExecute?: boolean;
};

/**
 * Install default mocks on `page`. Returns a `state` handle the test can flip
 * (e.g., to force the Kakera to appear earlier). Also seeds the dapp-kit
 * localStorage key so the stub wallet auto-connects on first render.
 */
export async function installDefaultMocks(
  page: Page,
  options: InstallMockOptions = {},
): Promise<MockState> {
  const state: MockState = { submitExecuted: false };
  const executeApiMode = options.executeApiMode ?? "success";
  const transactionExecutionStatus =
    options.transactionExecutionStatus ?? "success";
  const transactionBlockDelayMs = options.transactionBlockDelayMs ?? 0;
  const kakeraVisibleAfterExecute = options.kakeraVisibleAfterExecute ?? true;

  await page.addInitScript(
    ({ walletName, address }) => {
      try {
        window.localStorage.setItem(
          "sui-dapp-kit:wallet-connection-info",
          JSON.stringify({
            state: {
              lastConnectedWalletName: walletName,
              lastConnectedAccountAddress: address,
            },
            version: 0,
          }),
        );
      } catch {
        // localStorage may be unavailable (iframe / privacy mode); swallow.
      }
    },
    { walletName: E2E_STUB_WALLET_NAME, address: E2E_STUB_ACCOUNT_ADDRESS },
  );

  await page.route(/fullnode\.[a-z]+\.sui\.io/, (route) =>
    handleSuiRpc(route, state, {
      transactionExecutionStatus,
      transactionBlockDelayMs,
      kakeraVisibleAfterExecute,
    }),
  );

  await page.route("**/api/enoki/submit-photo/sponsor", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        bytes: "AAAA",
        digest: STUB_DIGEST,
        sender: E2E_STUB_ACCOUNT_ADDRESS,
      }),
    });
  });

  await page.route("**/api/enoki/submit-photo/execute", async (route) => {
    state.submitExecuted = true;
    if (executeApiMode === "recovering_http_error") {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          code: "submit_unavailable",
          message: "execute failed",
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ digest: STUB_DIGEST }),
    });
  });

  await page.route("**/publisher.e2e.stub/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        newlyCreated: {
          blobObject: {
            blobId: STUB_BLOB_ID,
          },
        },
      }),
    });
  });

  await page.route("**/aggregator.e2e.stub/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    });
  });

  return state;
}

async function handleSuiRpc(
  route: Route,
  state: MockState,
  options: Required<
    Pick<
      InstallMockOptions,
      | "transactionExecutionStatus"
      | "transactionBlockDelayMs"
      | "kakeraVisibleAfterExecute"
    >
  >,
): Promise<void> {
  const raw = route.request().postData();
  const payload = raw ? safeParseJson(raw) : null;

  if (Array.isArray(payload)) {
    const responses = await Promise.all(
      payload.map((single) => buildResponse(single, state, options)),
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responses),
    });
    return;
  }

  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(await buildResponse(payload, state, options)),
  });
}

async function buildResponse(
  call: unknown,
  state: MockState,
  options: Required<
    Pick<
      InstallMockOptions,
      | "transactionExecutionStatus"
      | "transactionBlockDelayMs"
      | "kakeraVisibleAfterExecute"
    >
  >,
): Promise<Record<string, unknown>> {
  const id = isObject(call) ? call.id : null;
  const method =
    isObject(call) && typeof call.method === "string" ? call.method : "";
  const params =
    isObject(call) && Array.isArray(call.params) ? call.params : [];

  const envelope = (result: unknown) => ({ jsonrpc: "2.0", id, result });

  switch (method) {
    case "sui_getObject":
      return envelope(handleGetObject(params));
    case "suix_getDynamicFieldObject":
      return envelope(handleDynamicField(params));
    case "sui_getTransactionBlock":
      return envelope(await handleGetTransactionBlock(state, options));
    case "suix_queryEvents":
      return envelope({ data: [], hasNextPage: false, nextCursor: null });
    case "suix_getOwnedObjects":
      return envelope(handleOwnedObjects(params, state, options));
    case "sui_getLatestCheckpointSequenceNumber":
      return envelope("1");
    case "sui_dryRunTransactionBlock":
      return envelope({ effects: { status: { status: "success" } } });
    default:
      return envelope(null);
  }
}

async function handleGetTransactionBlock(
  state: MockState,
  options: Required<
    Pick<InstallMockOptions, "transactionExecutionStatus" | "transactionBlockDelayMs">
  >,
): Promise<unknown> {
  if (options.transactionBlockDelayMs > 0) {
    await new Promise((resolve) =>
      setTimeout(resolve, options.transactionBlockDelayMs),
    );
  }

  if (!state.submitExecuted || options.transactionExecutionStatus === "unknown") {
    return {
      digest: STUB_DIGEST,
      effects: null,
    };
  }

  return {
    digest: STUB_DIGEST,
    effects: {
      status:
        options.transactionExecutionStatus === "success"
          ? {
              status: "success",
            }
          : {
              status: "failure",
              error: "mock execution failure",
            },
    },
  };
}

function handleGetObject(params: readonly unknown[]): unknown {
  const id = typeof params[0] === "string" ? params[0] : "";
  if (id === STUB_REGISTRY_OBJECT_ID) {
    return {
      data: {
        objectId: STUB_REGISTRY_OBJECT_ID,
        version: "1",
        digest: "reg-digest",
        type: `${STUB_PACKAGE_ID}::registry::Registry`,
        content: {
          dataType: "moveObject",
          type: `${STUB_PACKAGE_ID}::registry::Registry`,
          hasPublicTransfer: false,
          fields: {
            current_units: {
              type: `0x2::table::Table<u16, 0x2::object::ID>`,
              fields: {
                id: { id: STUB_REGISTRY_TABLE_ID },
                size: "1",
              },
            },
          },
        },
      },
    };
  }

  if (id === STUB_UNIT_ID) {
    return {
      data: {
        objectId: STUB_UNIT_ID,
        version: "1",
        digest: "unit-digest",
        type: `${STUB_PACKAGE_ID}::unit::Unit`,
        content: {
          dataType: "moveObject",
          type: `${STUB_PACKAGE_ID}::unit::Unit`,
          hasPublicTransfer: false,
          fields: {
            status: 0,
            submissions: [],
            max_slots: String(unitTileCount),
            athlete_id: STUB_ATHLETE_ID,
            master_id: { fields: { vec: [] } },
          },
        },
      },
    };
  }

  return { data: null };
}

function handleDynamicField(params: readonly unknown[]): unknown {
  const parentId = typeof params[0] === "string" ? params[0] : "";
  if (parentId !== STUB_REGISTRY_TABLE_ID) {
    return { data: null };
  }
  return {
    data: {
      objectId:
        "0x00000000000000000000000000000000000000000000000000000000000df001",
      version: "1",
      digest: "df-digest",
      type: `0x2::dynamic_field::Field<u16, 0x2::object::ID>`,
      content: {
        dataType: "moveObject",
        type: `0x2::dynamic_field::Field<u16, 0x2::object::ID>`,
        hasPublicTransfer: false,
        fields: {
          id: {
            id: "0x00000000000000000000000000000000000000000000000000000000000df002",
          },
          name: { type: "u16", value: Number(STUB_ATHLETE_ID) },
          value: STUB_UNIT_ID,
        },
      },
    },
  };
}

function handleOwnedObjects(
  params: readonly unknown[],
  state: MockState,
  options: Required<Pick<InstallMockOptions, "kakeraVisibleAfterExecute">>,
): unknown {
  const owner = typeof params[0] === "string" ? params[0] : "";
  if (
    owner !== E2E_STUB_ACCOUNT_ADDRESS ||
    !state.submitExecuted ||
    !options.kakeraVisibleAfterExecute
  ) {
    return { data: [], hasNextPage: false, nextCursor: null };
  }

  const blobBytes = Array.from(new TextEncoder().encode(STUB_BLOB_ID));

  return {
    data: [
      {
        data: {
          objectId: STUB_KAKERA_OBJECT_ID,
          version: "1",
          digest: "kakera-digest",
          type: KAKERA_TYPE,
          content: {
            dataType: "moveObject",
            type: KAKERA_TYPE,
            hasPublicTransfer: false,
            fields: {
              id: { id: STUB_KAKERA_OBJECT_ID },
              athlete_id: STUB_ATHLETE_ID,
              unit_id: STUB_UNIT_ID,
              walrus_blob_id: blobBytes,
              submission_no: STUB_SUBMISSION_NO,
              minted_at_ms: "1710000000000",
            },
          },
        },
      },
    ],
    hasNextPage: false,
    nextCursor: null,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
