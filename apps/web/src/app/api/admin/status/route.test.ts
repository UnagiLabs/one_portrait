import { describe, expect, it, vi } from "vitest";

const { loadAdminAthletesMock } = vi.hoisted(() => ({
  loadAdminAthletesMock: vi.fn(),
}));

vi.mock("../../../../lib/admin/athletes", () => ({
  loadAdminAthletes: loadAdminAthletesMock,
}));

import { GET } from "./route";

describe("GET /api/admin/status", () => {
  it("returns the on-chain admin athlete entries", async () => {
    loadAdminAthletesMock.mockResolvedValue([
      {
        currentUnit: {
          masterId: null,
          maxSlots: 2000,
          status: "filled",
          submittedCount: 2000,
          targetWalrusBlobId: "target-blob-1",
          unitId: "0xunit-1",
        },
        displayName: "Demo Athlete One",
        lookupState: "ready",
        metadataState: "ready",
        slug: "demo-athlete-one",
        thumbnailUrl: "https://example.com/1.png",
      },
      {
        currentUnit: null,
        displayName: "Athlete #2",
        lookupState: "missing",
        metadataState: "missing",
        slug: "athlete-2",
        thumbnailUrl: "https://placehold.co/512x512/png?text=Athlete+2",
      },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      athletes: [
        {
          currentUnit: {
            masterId: null,
            maxSlots: 2000,
            status: "filled",
            submittedCount: 2000,
            targetWalrusBlobId: "target-blob-1",
            unitId: "0xunit-1",
          },
          displayName: "Demo Athlete One",
          lookupState: "ready",
          metadataState: "ready",
          slug: "demo-athlete-one",
          thumbnailUrl: "https://example.com/1.png",
        },
        {
          currentUnit: null,
          displayName: "Athlete #2",
          lookupState: "missing",
          metadataState: "missing",
          slug: "athlete-2",
          thumbnailUrl: "https://placehold.co/512x512/png?text=Athlete+2",
        },
      ],
    });
  });

  it("returns 503 when the admin loader fails", async () => {
    loadAdminAthletesMock.mockRejectedValue(new Error("rpc down"));

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "admin_unavailable",
    });
  });
});
