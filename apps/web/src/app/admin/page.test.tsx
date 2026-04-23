// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { getAdminHealthMock, loadAdminAthletesMock } = vi.hoisted(() => ({
  getAdminHealthMock: vi.fn(),
  loadAdminAthletesMock: vi.fn(),
}));

vi.mock("../../lib/admin/athletes", () => ({
  loadAdminAthletes: loadAdminAthletesMock,
}));

vi.mock("../../lib/admin/health", () => ({
  getAdminHealth: getAdminHealthMock,
}));

import AdminPage from "./page";

describe("AdminPage", () => {
  it("renders the admin console with the initial server data", async () => {
    loadAdminAthletesMock.mockResolvedValue([
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
        metadataState: "ready",
        slug: "demo-athlete-one",
        thumbnailUrl: "https://example.com/1.png",
      },
    ]);
    getAdminHealthMock.mockResolvedValue({
      dispatchAuthorization: { httpStatus: 200, status: "ok" },
      generatorReadiness: { httpStatus: 200, status: "ok" },
    });

    const ui = await AdminPage();
    render(ui);

    expect(screen.getByText(/デモ管理コンソール/)).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Demo Athlete One" }),
    ).toBeTruthy();
    expect(screen.getByText(/target-blob-1/)).toBeTruthy();
    expect(screen.getAllByText("ok")).toHaveLength(2);
  });
});
