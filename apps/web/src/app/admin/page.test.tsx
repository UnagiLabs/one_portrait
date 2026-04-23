// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const {
  getAdminHealthMock,
  getAdminUnitSnapshotMock,
  getAthleteCatalogMock,
  getCurrentUnitIdForAthleteMock,
  loadPublicEnvMock,
} = vi.hoisted(() => ({
  getAdminHealthMock: vi.fn(),
  getAdminUnitSnapshotMock: vi.fn(),
  getAthleteCatalogMock: vi.fn(),
  getCurrentUnitIdForAthleteMock: vi.fn(),
  loadPublicEnvMock: vi.fn(),
}));

vi.mock("../../lib/admin/health", () => ({
  getAdminHealth: getAdminHealthMock,
}));

vi.mock("../../lib/catalog", () => ({
  getAthleteCatalog: getAthleteCatalogMock,
}));

vi.mock("../../lib/env", () => ({
  loadPublicEnv: loadPublicEnvMock,
}));

vi.mock("../../lib/sui", async () => {
  const actual =
    await vi.importActual<typeof import("../../lib/sui")>("../../lib/sui");

  return {
    ...actual,
    getAdminUnitSnapshot: getAdminUnitSnapshotMock,
    getCurrentUnitIdForAthlete: getCurrentUnitIdForAthleteMock,
  };
});

import AdminPage from "./page";

describe("AdminPage", () => {
  it("renders the admin console with the initial server data", async () => {
    loadPublicEnvMock.mockReturnValue({
      packageId: "0xpkg",
      registryObjectId:
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
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
    getCurrentUnitIdForAthleteMock.mockResolvedValue("0xunit-1");
    getAdminUnitSnapshotMock.mockResolvedValue({
      athletePublicId: "1",
      masterId: null,
      maxSlots: 980,
      status: "filled",
      submittedCount: 980,
      targetWalrusBlobId: "target-blob-1",
      unitId: "0xunit-1",
    });
    getAdminHealthMock.mockResolvedValue({
      dispatchAuthorization: { httpStatus: 200, status: "ok" },
      generatorReadiness: { httpStatus: 200, status: "ok" },
    });

    const ui = await AdminPage();
    render(ui);

    expect(screen.getByText(/demo admin console/i)).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Demo Athlete One" }),
    ).toBeTruthy();
    expect(screen.getByText(/target-blob-1/)).toBeTruthy();
    expect(screen.getAllByText("ok")).toHaveLength(2);
  });
});
