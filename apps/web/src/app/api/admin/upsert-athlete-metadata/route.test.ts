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

const VALID_REGISTRY_ID =
  "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd";

describe("POST /api/admin/upsert-athlete-metadata", () => {
  const fetchMock = vi.fn();

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    loadAdminRelayEnvMock.mockReset();
    loadPublicEnvMock.mockReset();
  });

  it("returns 400 for an invalid payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/upsert-athlete-metadata", {
        body: JSON.stringify({ athleteId: 12, slug: "demo-athlete" }),
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
      new Request("http://localhost/api/admin/upsert-athlete-metadata", {
        body: JSON.stringify({
          athleteId: 12,
          displayName: "Demo Athlete",
          slug: "demo-athlete",
          thumbnailUrl: "https://example.com/demo.png",
        }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "forbidden",
    });
  });

  it("relays the validated metadata request to the generator", async () => {
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
          athleteId: 12,
          digest: "0xdigest",
          status: "upserted",
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("http://localhost/api/admin/upsert-athlete-metadata", {
        body: JSON.stringify({
          athleteId: 12,
          displayName: "Demo Athlete",
          slug: "demo-athlete",
          thumbnailUrl: "https://example.com/demo.png",
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
    expect(request.url).toBe(
      "https://generator.example.com/admin/upsert-athlete-metadata",
    );
    await expect(request.json()).resolves.toEqual({
      athleteId: 12,
      displayName: "Demo Athlete",
      registryObjectId: VALID_REGISTRY_ID,
      slug: "demo-athlete",
      thumbnailUrl: "https://example.com/demo.png",
    });
    await expect(response.json()).resolves.toEqual({
      athleteId: 12,
      digest: "0xdigest",
      status: "upserted",
    });
  });
});
