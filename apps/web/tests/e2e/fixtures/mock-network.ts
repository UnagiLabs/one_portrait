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
 * - `/api/finalize` — observation stub for the later finalize bridge.
 * - Walrus Publisher `PUT /v1/blobs` — return stub `blobId`.
 */

import { unitTileCount } from "@one-portrait/shared";
import type { Page, Route } from "@playwright/test";

import {
  STUB_ATHLETE_ID,
  STUB_BLOB_ID,
  STUB_DIGEST,
  STUB_KAKERA_OBJECT_ID,
  STUB_MASTER_ID,
  STUB_MOSAIC_BLOB_ID,
  STUB_PACKAGE_ID,
  STUB_PLACEMENTS_TABLE_ID,
  STUB_REGISTRY_OBJECT_ID,
  STUB_REGISTRY_TABLE_ID,
  STUB_SUBMISSION_NO,
  STUB_UNIT_ID,
} from "../../../src/lib/e2e/stub-data";
import {
  E2E_STUB_ACCOUNT_ADDRESS,
  E2E_STUB_WALLET_NAME,
} from "../../../src/lib/enoki/stub-wallet";

export {
  STUB_ATHLETE_ID,
  STUB_BLOB_ID,
  STUB_DIGEST,
  STUB_KAKERA_OBJECT_ID,
  STUB_MASTER_ID,
  STUB_MOSAIC_BLOB_ID,
  STUB_PACKAGE_ID,
  STUB_PLACEMENTS_TABLE_ID,
  STUB_REGISTRY_OBJECT_ID,
  STUB_REGISTRY_TABLE_ID,
  STUB_SUBMISSION_NO,
  STUB_UNIT_ID,
} from "../../../src/lib/e2e/stub-data";

/** Derived constants used by the test assertions. */
export const KAKERA_TYPE = `${STUB_PACKAGE_ID}::kakera::Kakera`;

export type MockState = {
  submitExecuted: boolean;
  ownedObjectsCalls: number;
  sponsorRequests: number;
  executeRequests: number;
  publisherRequests: number;
  eventQueries: number;
  finalizeRequests: number;
  lastFinalizeUnitId: string | null;
};

type MockHttpResponse = {
  readonly __mockHttpStatus: number;
  readonly __mockHttpBody: unknown;
};

export type InstallMockOptions = {
  readonly autoConnectWallet?: boolean;
  readonly executeApiMode?: "success" | "recovering_http_error";
  /**
   * Deterministic gallery switch used by the E2E suite:
   * - `empty` keeps the original no-Kakera path
   * - `completed` returns one hydrated completed entry
   * - `hydration_error` returns one Kakera but makes the Unit lookup fail
   */
  readonly galleryEntryMode?: "empty" | "completed" | "hydration_error";
  /**
   * Deterministic original-image switch for completed cards.
   * Only the original blob request fails; the mosaic request still resolves.
   */
  readonly originalImageMode?: "success" | "original_blob_not_found";
  readonly ownedObjectsFailuresBeforeSuccess?: number;
  readonly transactionExecutionStatus?: "success" | "failed" | "unknown";
  readonly transactionBlockDelayMs?: number;
  readonly kakeraVisibleAfterExecute?: boolean;
  readonly waitingRoomEventMode?: "idle" | "active";
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
  const state: MockState = {
    submitExecuted: false,
    ownedObjectsCalls: 0,
    sponsorRequests: 0,
    executeRequests: 0,
    publisherRequests: 0,
    eventQueries: 0,
    finalizeRequests: 0,
    lastFinalizeUnitId: null,
  };
  const autoConnectWallet = options.autoConnectWallet ?? true;
  const executeApiMode = options.executeApiMode ?? "success";
  const galleryEntryMode = options.galleryEntryMode ?? "empty";
  const originalImageMode = options.originalImageMode ?? "success";
  const ownedObjectsFailuresBeforeSuccess =
    options.ownedObjectsFailuresBeforeSuccess ?? 0;
  const transactionExecutionStatus =
    options.transactionExecutionStatus ?? "success";
  const transactionBlockDelayMs = options.transactionBlockDelayMs ?? 0;
  const kakeraVisibleAfterExecute = options.kakeraVisibleAfterExecute ?? true;
  const waitingRoomEventMode = options.waitingRoomEventMode ?? "idle";

  if (autoConnectWallet) {
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
  }

  await page.route(/fullnode\.[a-z]+\.sui\.io/, (route) =>
    handleSuiRpc(route, state, {
      ownedObjectsFailuresBeforeSuccess,
      galleryEntryMode,
      transactionExecutionStatus,
      transactionBlockDelayMs,
      kakeraVisibleAfterExecute,
      waitingRoomEventMode,
    }),
  );

  await page.route("**/api/enoki/submit-photo/sponsor", async (route) => {
    state.sponsorRequests += 1;
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
    state.executeRequests += 1;
    state.submitExecuted = true;
    if (executeApiMode === "recovering_http_error") {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          code: "sponsor_failed",
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

  await page.route("**/api/finalize", async (route) => {
    state.finalizeRequests += 1;
    state.lastFinalizeUnitId = extractFinalizeUnitId(
      safeParseJson(route.request().postData() ?? ""),
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route("**/publisher.e2e.stub/**", async (route) => {
    state.publisherRequests += 1;
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
    const url = route.request().url();
    if (
      originalImageMode === "original_blob_not_found" &&
      url.includes(`/v1/blobs/${STUB_BLOB_ID}`)
    ) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          code: "blob_not_found",
          message: "mock original image unavailable",
        }),
      });
      return;
    }

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
      | "ownedObjectsFailuresBeforeSuccess"
      | "galleryEntryMode"
      | "transactionExecutionStatus"
      | "transactionBlockDelayMs"
      | "kakeraVisibleAfterExecute"
      | "waitingRoomEventMode"
    >
  >,
): Promise<void> {
  const raw = route.request().postData();
  const payload = raw ? safeParseJson(raw) : null;

  if (Array.isArray(payload)) {
    const responses = await Promise.all(
      payload.map((single) => buildResponse(single, state, options)),
    );
    const httpResponse = responses.find(isMockHttpResponse);
    if (httpResponse) {
      await route.fulfill({
        status: httpResponse.__mockHttpStatus,
        contentType: "application/json",
        body: JSON.stringify(httpResponse.__mockHttpBody),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responses),
    });
    return;
  }

  await route.fulfill({
    contentType: "application/json",
    ...(await buildRouteResponse(payload, state, options)),
  });
}

async function buildRouteResponse(
  payload: unknown,
  state: MockState,
  options: Required<
    Pick<
      InstallMockOptions,
      | "ownedObjectsFailuresBeforeSuccess"
      | "galleryEntryMode"
      | "transactionExecutionStatus"
      | "transactionBlockDelayMs"
      | "kakeraVisibleAfterExecute"
      | "waitingRoomEventMode"
    >
  >,
): Promise<Record<string, unknown> | MockHttpResponse> {
  const response = await buildResponse(payload, state, options);
  if (isMockHttpResponse(response)) {
    return {
      status: response.__mockHttpStatus,
      body: JSON.stringify(response.__mockHttpBody),
    };
  }
  return {
    status: 200,
    body: JSON.stringify(response),
  };
}

async function buildResponse(
  call: unknown,
  state: MockState,
  options: Required<
    Pick<
      InstallMockOptions,
      | "ownedObjectsFailuresBeforeSuccess"
      | "galleryEntryMode"
      | "transactionExecutionStatus"
      | "transactionBlockDelayMs"
      | "kakeraVisibleAfterExecute"
      | "waitingRoomEventMode"
    >
  >,
): Promise<Record<string, unknown> | MockHttpResponse> {
  const id = isObject(call) ? call.id : null;
  const method =
    isObject(call) && typeof call.method === "string" ? call.method : "";
  const params =
    isObject(call) && Array.isArray(call.params) ? call.params : [];

  const envelope = (result: unknown) => ({ jsonrpc: "2.0", id, result });

  switch (method) {
    case "sui_getObject":
      return envelope(handleGetObject(params, options.galleryEntryMode));
    case "suix_getDynamicFieldObject":
      return envelope(handleDynamicField(params, options.galleryEntryMode));
    case "sui_getTransactionBlock":
      return envelope(await handleGetTransactionBlock(state, options));
    case "suix_queryEvents":
      state.eventQueries += 1;
      return envelope(
        options.waitingRoomEventMode === "active"
          ? buildWaitingRoomEventPage(state.eventQueries)
          : { data: [], hasNextPage: false, nextCursor: null },
      );
    case "suix_getOwnedObjects": {
      const ownedObjects = handleOwnedObjects(params, state, options);
      if (isMockHttpResponse(ownedObjects)) {
        return ownedObjects;
      }
      return envelope(ownedObjects);
    }
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
    Pick<
      InstallMockOptions,
      "transactionExecutionStatus" | "transactionBlockDelayMs"
    >
  >,
): Promise<unknown> {
  if (options.transactionBlockDelayMs > 0) {
    await new Promise((resolve) =>
      setTimeout(resolve, options.transactionBlockDelayMs),
    );
  }

  if (
    !state.submitExecuted ||
    options.transactionExecutionStatus === "unknown"
  ) {
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

function handleGetObject(
  params: readonly unknown[],
  galleryEntryMode: Required<InstallMockOptions>["galleryEntryMode"],
): unknown {
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
    if (galleryEntryMode === "hydration_error") {
      return { data: null };
    }

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
            id: { id: STUB_UNIT_ID },
            status: galleryEntryMode === "completed" ? 2 : 0,
            target_walrus_blob: [],
            submissions: [],
            max_slots: String(unitTileCount),
            athlete_id: Number(STUB_ATHLETE_ID),
            submitters: {
              type: "0x2::table::Table<address, bool>",
              fields: {
                id: { id: "0xsubmitters" },
                size: "1",
              },
            },
            master_id:
              galleryEntryMode === "completed"
                ? { fields: { vec: [STUB_MASTER_ID] } }
                : { fields: { vec: [] } },
          },
        },
      },
    };
  }

  if (id === STUB_MASTER_ID && galleryEntryMode === "completed") {
    return {
      data: {
        objectId: STUB_MASTER_ID,
        version: "1",
        digest: "master-digest",
        type: `${STUB_PACKAGE_ID}::master_portrait::MasterPortrait`,
        content: {
          dataType: "moveObject",
          type: `${STUB_PACKAGE_ID}::master_portrait::MasterPortrait`,
          hasPublicTransfer: true,
          fields: {
            id: { id: STUB_MASTER_ID },
            unit_id: STUB_UNIT_ID,
            athlete_id: Number(STUB_ATHLETE_ID),
            mosaic_walrus_blob_id: Array.from(
              new TextEncoder().encode(STUB_MOSAIC_BLOB_ID),
            ),
            placements: {
              type: `0x2::table::Table<vector<u8>, ${STUB_PACKAGE_ID}::master_portrait::Placement>`,
              fields: {
                id: { id: STUB_PLACEMENTS_TABLE_ID },
                size: "1",
              },
            },
          },
        },
      },
    };
  }

  return { data: null };
}

function handleDynamicField(
  params: readonly unknown[],
  galleryEntryMode: Required<InstallMockOptions>["galleryEntryMode"],
): unknown {
  const parentId = typeof params[0] === "string" ? params[0] : "";
  if (parentId === STUB_REGISTRY_TABLE_ID) {
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

  if (
    galleryEntryMode !== "completed" ||
    parentId !== STUB_PLACEMENTS_TABLE_ID
  ) {
    return { data: null };
  }

  return {
    data: {
      objectId:
        "0x00000000000000000000000000000000000000000000000000000000000df101",
      version: "1",
      digest: "placement-digest",
      type: `0x2::dynamic_field::Field<vector<u8>, ${STUB_PACKAGE_ID}::master_portrait::Placement>`,
      content: {
        dataType: "moveObject",
        type: `0x2::dynamic_field::Field<vector<u8>, ${STUB_PACKAGE_ID}::master_portrait::Placement>`,
        hasPublicTransfer: false,
        fields: {
          id: {
            id: "0x00000000000000000000000000000000000000000000000000000000000df102",
          },
          name: Array.from(new TextEncoder().encode(STUB_BLOB_ID)),
          value: {
            type: `${STUB_PACKAGE_ID}::master_portrait::Placement`,
            fields: {
              x: "12",
              y: "8",
              submitter: E2E_STUB_ACCOUNT_ADDRESS,
              submission_no: String(STUB_SUBMISSION_NO),
            },
          },
        },
      },
    },
  };
}

function handleOwnedObjects(
  params: readonly unknown[],
  state: MockState,
  options: Required<
    Pick<
      InstallMockOptions,
      | "ownedObjectsFailuresBeforeSuccess"
      | "galleryEntryMode"
      | "kakeraVisibleAfterExecute"
    >
  >,
): Record<string, unknown> | MockHttpResponse {
  const owner = typeof params[0] === "string" ? params[0] : "";
  if (owner === E2E_STUB_ACCOUNT_ADDRESS) {
    state.ownedObjectsCalls += 1;
    if (state.ownedObjectsCalls <= options.ownedObjectsFailuresBeforeSuccess) {
      return {
        __mockHttpStatus: 503,
        __mockHttpBody: {
          code: "owned_objects_unavailable",
          message: "mock owned objects unavailable",
        },
      };
    }
  }

  const shouldExposeKakera =
    owner === E2E_STUB_ACCOUNT_ADDRESS &&
    (options.galleryEntryMode !== "empty" ||
      (state.submitExecuted && options.kakeraVisibleAfterExecute));

  if (!shouldExposeKakera) {
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

function isMockHttpResponse(
  value: Record<string, unknown> | MockHttpResponse,
): value is MockHttpResponse {
  return "__mockHttpStatus" in value && "__mockHttpBody" in value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractFinalizeUnitId(value: unknown): string | null {
  if (!isObject(value)) {
    return null;
  }

  return typeof value.unitId === "string" ? value.unitId : null;
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildWaitingRoomEventPage(
  queryIndex: number,
): Record<string, unknown> {
  if (queryIndex === 1) {
    return {
      data: [
        makeSubmittedEvent({
          submittedCount: unitTileCount,
          eventSeq: "1",
        }),
      ],
      hasNextPage: true,
      nextCursor: { txDigest: STUB_DIGEST, eventSeq: "1" },
    };
  }

  if (queryIndex === 2) {
    return {
      data: [
        makeUnitFilledEvent({ eventSeq: "2" }),
        makeMosaicReadyEvent({ eventSeq: "3" }),
        makeUnitFilledEvent({ eventSeq: "4" }),
      ],
      hasNextPage: false,
      nextCursor: null,
    };
  }

  return { data: [], hasNextPage: false, nextCursor: null };
}

function makeSubmittedEvent(opts: {
  readonly submittedCount: number;
  readonly eventSeq: string;
}): Record<string, unknown> {
  return makeEvent({
    eventSeq: opts.eventSeq,
    parsedJson: {
      unit_id: STUB_UNIT_ID,
      athlete_id: STUB_ATHLETE_ID,
      submitter: E2E_STUB_ACCOUNT_ADDRESS,
      walrus_blob_id: Array.from(new TextEncoder().encode(STUB_BLOB_ID)),
      submission_no: STUB_SUBMISSION_NO,
      submitted_count: opts.submittedCount,
      max_slots: unitTileCount,
    },
    type: `${STUB_PACKAGE_ID}::events::SubmittedEvent`,
  });
}

function makeUnitFilledEvent(opts: {
  readonly eventSeq: string;
}): Record<string, unknown> {
  return makeEvent({
    eventSeq: opts.eventSeq,
    parsedJson: {
      unit_id: STUB_UNIT_ID,
      athlete_id: STUB_ATHLETE_ID,
      filled_count: unitTileCount,
      max_slots: unitTileCount,
    },
    type: `${STUB_PACKAGE_ID}::events::UnitFilledEvent`,
  });
}

function makeMosaicReadyEvent(opts: {
  readonly eventSeq: string;
}): Record<string, unknown> {
  return makeEvent({
    eventSeq: opts.eventSeq,
    parsedJson: {
      unit_id: STUB_UNIT_ID,
      athlete_id: STUB_ATHLETE_ID,
      master_id: STUB_MASTER_ID,
      mosaic_walrus_blob_id: Array.from(
        new TextEncoder().encode(STUB_MOSAIC_BLOB_ID),
      ),
    },
    type: `${STUB_PACKAGE_ID}::events::MosaicReadyEvent`,
  });
}

function makeEvent(opts: {
  readonly eventSeq: string;
  readonly parsedJson: Record<string, unknown>;
  readonly type: string;
}): Record<string, unknown> {
  return {
    id: { txDigest: STUB_DIGEST, eventSeq: opts.eventSeq },
    packageId: STUB_PACKAGE_ID,
    transactionModule: "events",
    sender: E2E_STUB_ACCOUNT_ADDRESS,
    type: opts.type,
    parsedJson: opts.parsedJson,
    bcs: "",
    bcsEncoding: "base64",
    timestampMs: "0",
  };
}
