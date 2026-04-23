import { describe, expect, it, vi } from "vitest";

const VALID_UNIT_ID =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

const { dispatchFinalizeMock, getFinalizeUnitSnapshotMock } = vi.hoisted(
  () => ({
    dispatchFinalizeMock: vi.fn(),
    getFinalizeUnitSnapshotMock: vi.fn(),
  }),
);

vi.mock("../../../../lib/finalize/dispatch", () => ({
  dispatchFinalize: dispatchFinalizeMock,
}));

vi.mock("../../../../lib/sui", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/sui")>(
    "../../../../lib/sui",
  );

  return {
    ...actual,
    getFinalizeUnitSnapshot: getFinalizeUnitSnapshotMock,
  };
});

import { POST } from "./route";

describe("POST /api/admin/finalize", () => {
  it("returns 400 for an invalid payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/finalize", {
        method: "POST",
        body: JSON.stringify({ nope: true }),
        headers: {
          "x-one-portrait-admin-request": "same-origin",
        },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_args",
    });
  });

  it("returns 403 when the same-origin admin header is missing", async () => {
    const response = await POST(validRequest({ withAdminHeader: false }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "forbidden",
    });
  });

  it("absorbs a pending unit without dispatching", async () => {
    getFinalizeUnitSnapshotMock.mockResolvedValue({
      unitId: VALID_UNIT_ID,
      status: "pending",
      masterId: null,
    });

    const response = await POST(validRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ignored_pending",
      unitId: VALID_UNIT_ID,
    });
    expect(dispatchFinalizeMock).not.toHaveBeenCalled();
  });

  it("returns the generator finalize result for a filled unit", async () => {
    getFinalizeUnitSnapshotMock.mockResolvedValue({
      unitId: VALID_UNIT_ID,
      status: "filled",
      masterId: null,
    });
    dispatchFinalizeMock.mockResolvedValue({
      status: "finalized",
      unitId: VALID_UNIT_ID,
      mosaicBlobId: "mosaic-blob",
      digest: "0xdigest",
      placementCount: 2000,
    });

    const response = await POST(validRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "finalized",
      unitId: VALID_UNIT_ID,
      mosaicBlobId: "mosaic-blob",
      digest: "0xdigest",
      placementCount: 2000,
    });
  });

  it("absorbs dispatch failures so the admin UI can retry", async () => {
    getFinalizeUnitSnapshotMock.mockResolvedValue({
      unitId: VALID_UNIT_ID,
      status: "filled",
      masterId: null,
    });
    dispatchFinalizeMock.mockRejectedValue(new Error("generator offline"));

    const response = await POST(validRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ignored_dispatch_failed",
      unitId: VALID_UNIT_ID,
    });
  });
});

function validRequest(options: { withAdminHeader?: boolean } = {}): Request {
  return new Request("http://localhost/api/admin/finalize", {
    body: JSON.stringify({ unitId: VALID_UNIT_ID }),
    headers:
      options.withAdminHeader === false
        ? undefined
        : {
            "x-one-portrait-admin-request": "same-origin",
          },
    method: "POST",
  });
}
