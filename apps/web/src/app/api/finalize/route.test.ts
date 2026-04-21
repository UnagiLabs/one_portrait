import { describe, expect, it, vi } from "vitest";

const VALID_UNIT_ID =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

const { dispatchFinalizeMock, getFinalizeUnitSnapshotMock } = vi.hoisted(() => ({
  dispatchFinalizeMock: vi.fn(),
  getFinalizeUnitSnapshotMock: vi.fn(),
}));

vi.mock("../../../lib/finalize/dispatch", () => ({
  dispatchFinalize: dispatchFinalizeMock,
}));

vi.mock("../../../lib/sui", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/sui")>(
    "../../../lib/sui",
  );

  return {
    ...actual,
    getFinalizeUnitSnapshot: getFinalizeUnitSnapshotMock,
  };
});

import { POST } from "./route";

describe("POST /api/finalize", () => {
  it("returns 400 for an invalid payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/finalize", {
        method: "POST",
        body: JSON.stringify({ nope: true }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_args",
    });
    expect(getFinalizeUnitSnapshotMock).not.toHaveBeenCalled();
    expect(dispatchFinalizeMock).not.toHaveBeenCalled();
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

  it("absorbs an already finalized unit without dispatching", async () => {
    getFinalizeUnitSnapshotMock.mockResolvedValue({
      unitId: VALID_UNIT_ID,
      status: "finalized",
      masterId: "0xmaster",
    });

    const response = await POST(validRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ignored_finalized",
      unitId: VALID_UNIT_ID,
    });
    expect(dispatchFinalizeMock).not.toHaveBeenCalled();
  });

  it("dispatches a filled unit", async () => {
    getFinalizeUnitSnapshotMock.mockResolvedValue({
      unitId: VALID_UNIT_ID,
      status: "filled",
      masterId: null,
    });
    dispatchFinalizeMock.mockResolvedValue({ accepted: true });

    const response = await POST(validRequest());

    expect(response.status).toBe(200);
    expect(getFinalizeUnitSnapshotMock).toHaveBeenCalledWith(VALID_UNIT_ID);
    expect(dispatchFinalizeMock).toHaveBeenCalledWith({
      unitId: VALID_UNIT_ID,
    });
    await expect(response.json()).resolves.toEqual({
      status: "queued",
      unitId: VALID_UNIT_ID,
    });
  });

  it("absorbs dispatch failures as 200 so the browser can retry later", async () => {
    getFinalizeUnitSnapshotMock.mockResolvedValue({
      unitId: VALID_UNIT_ID,
      status: "filled",
      masterId: null,
    });
    dispatchFinalizeMock.mockRejectedValue(new Error("container offline"));

    const response = await POST(validRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ignored_dispatch_failed",
      unitId: VALID_UNIT_ID,
    });
  });
});

function validRequest(): Request {
  return new Request("http://localhost/api/finalize", {
    method: "POST",
    body: JSON.stringify({ unitId: VALID_UNIT_ID }),
  });
}
