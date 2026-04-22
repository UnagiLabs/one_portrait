import { describe, expect, it, vi } from "vitest";

const {
  getAdminUnitSnapshotMock,
  getAthleteCatalogMock,
  getCurrentUnitIdForAthleteMock,
  loadPublicEnvMock,
} = vi.hoisted(() => ({
  getAdminUnitSnapshotMock: vi.fn(),
  getAthleteCatalogMock: vi.fn(),
  getCurrentUnitIdForAthleteMock: vi.fn(),
  loadPublicEnvMock: vi.fn(),
}));

vi.mock("../../../../lib/catalog", () => ({
  getAthleteCatalog: getAthleteCatalogMock,
}));

vi.mock("../../../../lib/env", () => ({
  loadPublicEnv: loadPublicEnvMock,
}));

vi.mock("../../../../lib/sui", async () => {
  const actual =
    await vi.importActual<typeof import("../../../../lib/sui")>(
      "../../../../lib/sui",
    );

  return {
    ...actual,
    getAdminUnitSnapshot: getAdminUnitSnapshotMock,
    getCurrentUnitIdForAthlete: getCurrentUnitIdForAthleteMock,
  };
});

import { GET } from "./route";

describe("GET /api/admin/status", () => {
  it("returns the catalog with current unit snapshots", async () => {
    loadPublicEnvMock.mockReturnValue({
      packageId: "0xpkg",
      registryObjectId: "0xregistry",
      suiNetwork: "testnet",
    });
    getAthleteCatalogMock.mockResolvedValue([
      {
        athletePublicId: "1",
        displayName: "Demo Athlete One",
        slug: "demo-athlete-one",
        thumbnailUrl: "https://example.com/1.png",
      },
      {
        athletePublicId: "2",
        displayName: "Demo Athlete Two",
        slug: "demo-athlete-two",
        thumbnailUrl: "https://example.com/2.png",
      },
    ]);
    getCurrentUnitIdForAthleteMock.mockImplementation(async (athleteId) =>
      athleteId === "1" ? "0xunit-1" : null,
    );
    getAdminUnitSnapshotMock.mockResolvedValue({
      athletePublicId: "1",
      masterId: null,
      maxSlots: 980,
      status: "filled",
      submittedCount: 980,
      targetWalrusBlobId: "target-blob-1",
      unitId: "0xunit-1",
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      athletes: [
        {
          athletePublicId: "1",
          currentUnit: {
            athletePublicId: "1",
            masterId: null,
            maxSlots: 980,
            status: "filled",
            submittedCount: 980,
            targetWalrusBlobId: "target-blob-1",
            unitId: "0xunit-1",
          },
          displayName: "Demo Athlete One",
          lookupState: "ready",
          slug: "demo-athlete-one",
          thumbnailUrl: "https://example.com/1.png",
        },
        {
          athletePublicId: "2",
          currentUnit: null,
          displayName: "Demo Athlete Two",
          lookupState: "missing",
          slug: "demo-athlete-two",
          thumbnailUrl: "https://example.com/2.png",
        },
      ],
    });
    expect(getCurrentUnitIdForAthleteMock).toHaveBeenCalledWith("1", {
      registryObjectId: "0xregistry",
    });
  });

  it("marks an athlete as unavailable when lookup fails", async () => {
    loadPublicEnvMock.mockReturnValue({
      packageId: "0xpkg",
      registryObjectId: "0xregistry",
      suiNetwork: "testnet",
    });
    getAthleteCatalogMock.mockResolvedValue([
      {
        athletePublicId: "1",
        displayName: "Demo Athlete One",
        slug: "demo-athlete-one",
        thumbnailUrl: "https://example.com/1.png",
      },
    ]);
    getCurrentUnitIdForAthleteMock.mockRejectedValue(new Error("rpc down"));

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      athletes: [
        {
          athletePublicId: "1",
          currentUnit: null,
          displayName: "Demo Athlete One",
          lookupState: "unavailable",
          slug: "demo-athlete-one",
          thumbnailUrl: "https://example.com/1.png",
        },
      ],
    });
  });

  it("returns 503 when public env is missing", async () => {
    loadPublicEnvMock.mockImplementation(() => {
      throw new Error("env missing");
    });

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "admin_unavailable",
    });
  });
});
