import { afterEach, describe, expect, it, vi } from "vitest";

const { loadAdminRelayEnvMock, loadPublicEnvMock } = vi.hoisted(() => ({
  loadAdminRelayEnvMock: vi.fn(),
  loadPublicEnvMock: vi.fn(),
}));

vi.mock("../../../../lib/admin/env", () => ({
  loadAdminRelayEnv: loadAdminRelayEnvMock,
}));

vi.mock("../../../../lib/env", () => ({
  loadPublicEnv: loadPublicEnvMock,
}));

import { POST } from "./route";

const VALID_UNIT_ID =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const VALID_REGISTRY_ID =
  "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd";

describe("POST /api/admin/create-unit", () => {
  const fetchMock = vi.fn();

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    loadAdminRelayEnvMock.mockReset();
    loadPublicEnvMock.mockReset();
  });

  it("returns 400 for an invalid payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/create-unit", {
        body: JSON.stringify({ nope: true }),
        headers: {
          "x-one-portrait-admin-request": "same-origin",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_args",
    });
  });

  it("returns 403 when the same-origin admin header is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/create-unit", {
        body: JSON.stringify({
          athleteId: 12,
          blobId: "target-blob-12",
          maxSlots: 2000,
        }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "forbidden",
    });
  });

  it("relays the validated create-unit request to the generator", async () => {
    loadPublicEnvMock.mockReturnValue({
      packageId: "0xpkg",
      registryObjectId: VALID_REGISTRY_ID,
      suiNetwork: "testnet",
    });
    loadAdminRelayEnvMock.mockReturnValue({
      generatorBaseUrl: "https://generator.example.com",
      sharedSecret: "shared-secret",
    });
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          digest: "0xdigest",
          status: "created",
          unitId: VALID_UNIT_ID,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("http://localhost/api/admin/create-unit", {
        body: JSON.stringify({
          athleteId: 12,
          blobId: "target-blob-12",
          maxSlots: 2000,
        }),
        headers: {
          "x-one-portrait-admin-request": "same-origin",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(request.url).toBe("https://generator.example.com/admin/create-unit");
    expect(request.headers.get("x-op-finalize-dispatch-secret")).toBe(
      "shared-secret",
    );
    await expect(request.json()).resolves.toEqual({
      athleteId: 12,
      blobId: "target-blob-12",
      maxSlots: 2000,
      registryObjectId: VALID_REGISTRY_ID,
    });
    await expect(response.json()).resolves.toEqual({
      digest: "0xdigest",
      status: "created",
      unitId: VALID_UNIT_ID,
    });
  });
});
