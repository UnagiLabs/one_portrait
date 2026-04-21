// @vitest-environment happy-dom

import { unitTileCount } from "@one-portrait/shared";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { demoUnitId } from "../lib/demo";

const {
  getAthleteCatalogMock,
  getCurrentUnitIdForAthleteMock,
  getUnitProgressMock,
  loadPublicEnvMock,
} = vi.hoisted(() => ({
  getAthleteCatalogMock: vi.fn(),
  getCurrentUnitIdForAthleteMock: vi.fn(),
  getUnitProgressMock: vi.fn(),
  loadPublicEnvMock: vi.fn(),
}));

vi.mock("../lib/catalog", () => ({
  getAthleteCatalog: getAthleteCatalogMock,
}));

vi.mock("../lib/sui", () => ({
  getCurrentUnitIdForAthlete: getCurrentUnitIdForAthleteMock,
  getUnitProgress: getUnitProgressMock,
}));

vi.mock("../lib/env", () => ({
  loadPublicEnv: loadPublicEnvMock,
}));

import HomePage from "./page";

const CATALOG = [
  {
    athletePublicId: "1",
    slug: "demo-athlete-one",
    displayName: "Demo Athlete One",
    thumbnailUrl: "https://placehold.co/512x512/png?text=Athlete+1",
  },
  {
    athletePublicId: "2",
    slug: "demo-athlete-two",
    displayName: "Demo Athlete Two",
    thumbnailUrl: "https://placehold.co/512x512/png?text=Athlete+2",
  },
] as const;

afterEach(() => {
  delete process.env.NEXT_PUBLIC_DEMO_MODE;
  getAthleteCatalogMock.mockReset();
  getCurrentUnitIdForAthleteMock.mockReset();
  getUnitProgressMock.mockReset();
  loadPublicEnvMock.mockReset();
});

describe("HomePage", () => {
  it("renders a card for each catalog entry with display metadata", async () => {
    getAthleteCatalogMock.mockResolvedValue(CATALOG);
    loadPublicEnvMock.mockReturnValue({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      registryObjectId: "0xreg",
    });
    getCurrentUnitIdForAthleteMock.mockImplementation(async (id: string) =>
      id === "1" ? "0xunit-1" : null,
    );
    getUnitProgressMock.mockResolvedValue({
      unitId: "0xunit-1",
      athletePublicId: "1",
      submittedCount: 42,
      maxSlots: unitTileCount,
      status: "pending",
      masterId: null,
    });

    const ui = await HomePage();
    render(ui);

    expect(screen.getByText("Demo Athlete One")).toBeTruthy();
    expect(screen.getByText("Demo Athlete Two")).toBeTruthy();
    expect(screen.getByText(/demo-athlete-one/)).toBeTruthy();
    expect(screen.getByText(/demo-athlete-two/)).toBeTruthy();
  });

  it("shows the current unit progress when an active unit exists", async () => {
    getAthleteCatalogMock.mockResolvedValue([CATALOG[0]]);
    loadPublicEnvMock.mockReturnValue({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      registryObjectId: "0xreg",
    });
    getCurrentUnitIdForAthleteMock.mockResolvedValue("0xunit-1");
    getUnitProgressMock.mockResolvedValue({
      unitId: "0xunit-1",
      athletePublicId: "1",
      submittedCount: 123,
      maxSlots: unitTileCount,
      status: "pending",
      masterId: null,
    });

    const ui = await HomePage();
    render(ui);

    expect(
      screen.getByText(new RegExp(`123\\s*/\\s*${unitTileCount}`)),
    ).toBeTruthy();
  });

  it("shows a hero link to the participation gallery", async () => {
    getAthleteCatalogMock.mockResolvedValue([CATALOG[0]]);
    loadPublicEnvMock.mockReturnValue({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      registryObjectId: "0xreg",
    });
    getCurrentUnitIdForAthleteMock.mockResolvedValue("0xunit-1");
    getUnitProgressMock.mockResolvedValue({
      unitId: "0xunit-1",
      athletePublicId: "1",
      submittedCount: 123,
      maxSlots: unitTileCount,
      status: "pending",
      masterId: null,
    });

    const ui = await HomePage();
    render(ui);

    const link = screen.getByRole("link", {
      name: /participation history/i,
    });
    expect(link.getAttribute("href")).toBe("/gallery");
  });

  it("renders a waiting-state card when no current unit is registered", async () => {
    getAthleteCatalogMock.mockResolvedValue([CATALOG[0]]);
    loadPublicEnvMock.mockReturnValue({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      registryObjectId: "0xreg",
    });
    getCurrentUnitIdForAthleteMock.mockResolvedValue(null);

    const ui = await HomePage();
    render(ui);

    expect(getUnitProgressMock).not.toHaveBeenCalled();
    expect(screen.getByText(/待機中|No active unit/i)).toBeTruthy();
  });

  it("links each athlete card to /units/[unitId] when a unit exists", async () => {
    getAthleteCatalogMock.mockResolvedValue([CATALOG[0]]);
    loadPublicEnvMock.mockReturnValue({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      registryObjectId: "0xreg",
    });
    getCurrentUnitIdForAthleteMock.mockResolvedValue("0xunit-1");
    getUnitProgressMock.mockResolvedValue({
      unitId: "0xunit-1",
      athletePublicId: "1",
      submittedCount: 0,
      maxSlots: unitTileCount,
      status: "pending",
      masterId: null,
    });

    const ui = await HomePage();
    render(ui);

    const link = screen
      .getAllByRole("link")
      .find((el) => el.getAttribute("href") === "/units/0xunit-1");
    expect(link).toBeTruthy();
  });

  it("falls back to catalog-only display when env or RPC fails", async () => {
    getAthleteCatalogMock.mockResolvedValue([CATALOG[0]]);
    loadPublicEnvMock.mockImplementation(() => {
      throw new Error("env missing");
    });

    const ui = await HomePage();
    render(ui);

    expect(screen.getByText("Demo Athlete One")).toBeTruthy();
    expect(getCurrentUnitIdForAthleteMock).not.toHaveBeenCalled();
  });

  it("falls back to placeholder progress when Sui RPC throws", async () => {
    getAthleteCatalogMock.mockResolvedValue([CATALOG[0]]);
    loadPublicEnvMock.mockReturnValue({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      registryObjectId: "0xreg",
    });
    getCurrentUnitIdForAthleteMock.mockRejectedValue(new Error("rpc down"));

    const ui = await HomePage();
    render(ui);

    expect(screen.getByText("Demo Athlete One")).toBeTruthy();
    // Placeholder must not crash the card — either waiting state or the slug
    // must still render.
    expect(screen.getByText(/demo-athlete-one/)).toBeTruthy();
  });

  it("uses demo fixture progress when demo mode is enabled", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "1";
    getAthleteCatalogMock.mockResolvedValue(CATALOG);

    const ui = await HomePage();
    render(ui);

    const link = screen
      .getAllByRole("link")
      .find((el) => el.getAttribute("href") === `/units/${demoUnitId}`);

    expect(link).toBeTruthy();
    expect(getCurrentUnitIdForAthleteMock).not.toHaveBeenCalled();
    expect(getUnitProgressMock).not.toHaveBeenCalled();
  });
});
