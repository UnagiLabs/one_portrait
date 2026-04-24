// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { getAdminHealthMock, getAthleteCatalogMock, loadAdminAthletesMock } =
  vi.hoisted(() => ({
    getAdminHealthMock: vi.fn(),
    getAthleteCatalogMock: vi.fn(),
    loadAdminAthletesMock: vi.fn(),
  }));

vi.mock("../../lib/catalog", () => ({
  getAthleteCatalog: getAthleteCatalogMock,
}));

vi.mock("../../lib/admin/athletes", () => ({
  loadAdminAthletes: loadAdminAthletesMock,
}));

vi.mock("../../lib/admin/health", () => ({
  getAdminHealth: getAdminHealthMock,
}));

import AdminPage from "./page";

const HEALTH_OK = {
  currentUrl: "https://generator.example.com",
  dispatchAuthorization: { httpStatus: 200, status: "ok" } as const,
  expectedDeployment: {
    network: "testnet",
    packageId:
      "0x8568f91f71674184b5c8711b550ec6b001e88f09adbc22c7ad31e1173f02ffbf",
  },
  generatorReadiness: { httpStatus: 200, status: "ok" } as const,
  resolutionStatus: "ok" as const,
  source: "runtime_state" as const,
};

describe("AdminPage", () => {
  it("renders the admin console with the initial server data", async () => {
    loadAdminAthletesMock.mockResolvedValue([
      {
        currentUnit: {
          displayMaxSlots: 2000,
          displayName: "Demo Athlete One",
          masterId: null,
          maxSlots: 2000,
          realSubmittedCount: 2000,
          status: "filled",
          submittedCount: 2000,
          targetWalrusBlobId: "target-blob-1",
          thumbnailUrl: "https://example.com/1.png",
          unitId: "0xunit-1",
        },
        displayName: "Demo Athlete One",
        entryId: "0xunit-1",
        lookupState: "ready",
        metadataState: "ready",
        slug: "demo-athlete-one",
        thumbnailUrl: "https://example.com/1.png",
      },
    ]);
    getAthleteCatalogMock.mockResolvedValue([
      {
        displayName: "Catalog Create Athlete",
        slug: "catalog-create-athlete",
        thumbnailUrl: "https://example.com/catalog-create-athlete.png",
      },
    ]);
    getAdminHealthMock.mockResolvedValue(HEALTH_OK);

    const ui = await AdminPage();
    render(ui);

    expect(screen.getByText(/Demo admin console/)).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Demo Athlete One" }),
    ).toBeTruthy();
    expect(screen.getByText(/target-blob-1/)).toBeTruthy();
    expect(screen.getAllByText("ok")).toHaveLength(3);
    expect(screen.getByText("https://generator.example.com")).toBeTruthy();
    expect(
      screen.getByRole("option", { name: "Catalog Create Athlete" }),
    ).toBeTruthy();
  });
});
