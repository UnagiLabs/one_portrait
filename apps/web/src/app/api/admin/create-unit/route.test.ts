import { afterEach, describe, expect, it, vi } from "vitest";

const { loadAdminRelayEnvMock, loadPublicEnvMock } = vi.hoisted(() => ({
  loadAdminRelayEnvMock: vi.fn(),
  loadPublicEnvMock: vi.fn(),
}));

const { getRequestCloudflareEnvMock } = vi.hoisted(() => ({
  getRequestCloudflareEnvMock: vi.fn(),
}));

const { getAthleteBySlugMock } = vi.hoisted(() => ({
  getAthleteBySlugMock: vi.fn(),
}));

vi.mock("../../../../lib/admin/env", () => ({
  loadAdminRelayEnv: loadAdminRelayEnvMock,
}));

vi.mock("../../../../lib/catalog", () => ({
  getAthleteBySlug: getAthleteBySlugMock,
}));

vi.mock("../../../../lib/env", () => ({
  loadPublicEnv: loadPublicEnvMock,
}));

vi.mock("../../../../lib/cloudflare-context", () => ({
  getRequestCloudflareEnv: getRequestCloudflareEnvMock,
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
    getAthleteBySlugMock.mockReset();
    getRequestCloudflareEnvMock.mockReset();
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
          athleteSlug: "yuya-wakamatsu",
          blobId: "target-blob-12",
          displayMaxSlots: 2000,
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

  it("returns 400 for an unknown athleteSlug", async () => {
    getAthleteBySlugMock.mockResolvedValue(undefined);

    const response = await POST(
      new Request("http://localhost/api/admin/create-unit", {
        body: JSON.stringify({
          athleteSlug: "unknown-athlete",
          blobId: "target-blob-12",
          displayMaxSlots: 2000,
          maxSlots: 2000,
        }),
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("relays the catalog-resolved create-unit request to the generator", async () => {
    getRequestCloudflareEnvMock.mockReturnValue(null);
    getAthleteBySlugMock.mockResolvedValue({
      displayName: "Yuya Wakamatsu",
      slug: "yuya-wakamatsu",
      thumbnailUrl:
        "/demo/one-athletes/Yuya_Wakamatsu-avatar-champ-500x345-1.png",
    });
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
          athleteSlug: "yuya-wakamatsu",
          blobId: "target-blob-12",
          displayMaxSlots: 2000,
          maxSlots: 2000,
        }),
        headers: {
          "x-one-portrait-admin-request": "same-origin",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(getAthleteBySlugMock).toHaveBeenCalledWith("yuya-wakamatsu");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(request.url).toBe("https://generator.example.com/admin/create-unit");
    expect(request.headers.get("x-op-finalize-dispatch-secret")).toBe(
      "shared-secret",
    );
    const relayBody = await request.json();
    expect(relayBody).toEqual({
      blobId: "target-blob-12",
      displayMaxSlots: 2000,
      displayName: "Yuya Wakamatsu",
      maxSlots: 2000,
      registryObjectId: VALID_REGISTRY_ID,
      thumbnailUrl:
        "/demo/one-athletes/Yuya_Wakamatsu-avatar-champ-500x345-1.png",
    });
    expect(relayBody).not.toHaveProperty("athleteSlug");
    await expect(response.json()).resolves.toEqual({
      digest: "0xdigest",
      status: "created",
      unitId: VALID_UNIT_ID,
    });
  });
});
