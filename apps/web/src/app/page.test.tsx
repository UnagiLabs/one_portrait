// @vitest-environment happy-dom

import { unitTileCount } from "@one-portrait/shared";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { demoUnitId } from "../lib/demo";

const { getAthleteCatalogMock, getActiveHomeUnitsMock } = vi.hoisted(() => ({
  getAthleteCatalogMock: vi.fn(),
  getActiveHomeUnitsMock: vi.fn(),
}));

vi.mock("../lib/catalog", () => ({
  getAthleteCatalog: getAthleteCatalogMock,
}));

vi.mock("../lib/sui", () => ({
  getActiveHomeUnits: getActiveHomeUnitsMock,
  RegistrySchemaError: class RegistrySchemaError extends Error {
    constructor(
      public readonly objectId: string,
      public readonly detail: string,
    ) {
      super(
        `Registry object does not match current contract schema; ${detail} (object ${objectId})`,
      );
      this.name = "RegistrySchemaError";
    }
  },
}));

import HomePage from "./page";

const CATALOG = [
  {
    unitId: demoUnitId,
    slug: "demo-athlete-one",
    displayName: "Demo Athlete One",
    thumbnailUrl: "https://placehold.co/512x512/png?text=Athlete+1",
  },
  {
    unitId:
      "0x00000000000000000000000000000000000000000000000000000000000000d4",
    slug: "demo-athlete-two",
    displayName: "Demo Athlete Two",
    thumbnailUrl: "https://placehold.co/512x512/png?text=Athlete+2",
  },
] as const;

afterEach(() => {
  delete process.env.NEXT_PUBLIC_DEMO_MODE;
  delete process.env.NEXT_PUBLIC_E2E_STUB_WALLET;
  getAthleteCatalogMock.mockReset();
  getActiveHomeUnitsMock.mockReset();
});

describe("HomePage", () => {
  it("renders the cinematic hero and portrait work rail", async () => {
    getActiveHomeUnitsMock.mockResolvedValue([]);

    const ui = await HomePage();
    render(ui);

    expect(
      screen.getByRole("heading", {
        name: new RegExp(
          `${unitTileCount.toLocaleString()}\\s*fans,\\s*one reveal`,
          "i",
        ),
      }),
    ).toBeTruthy();
    expect(screen.getByText("Step 01 — Choose your portrait")).toBeTruthy();
    expect(screen.getAllByText("Yuya Wakamatsu").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Takeru").length).toBeGreaterThan(0);
  });

  it("keeps the gallery link available", async () => {
    getActiveHomeUnitsMock.mockResolvedValue([]);

    const ui = await HomePage();
    render(ui);

    const link = screen.getByRole("link", {
      name: /participation history/i,
    });
    expect(link.getAttribute("href")).toBe("/gallery");
  });

  it("links live portrait menu cards to the upload page", async () => {
    getActiveHomeUnitsMock.mockResolvedValue([
      {
        displayName: "test02",
        maxSlots: unitTileCount,
        submittedCount: 1999,
        thumbnailUrl: "https://placehold.co/512x512/png?text=test02",
        unitId: "0xunit-1",
      },
    ]);

    const ui = await HomePage();
    render(ui);

    const link = screen.getAllByRole("link", {
      name: /Yuya Wakamatsu portrait upload page/i,
    })[0];
    expect(link?.getAttribute("href")).toBe(
      "/units/0xunit-1?athleteName=Yuya+Wakamatsu",
    );
    expect(screen.queryByText("test02")).toBeNull();
    expect(screen.getAllByText("Live").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Complete").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1999 / 2000").length).toBeGreaterThan(0);
  });

  it("keeps E2E degraded home card states distinct in the portrait rail", async () => {
    process.env.NEXT_PUBLIC_E2E_STUB_WALLET = "1";
    getAthleteCatalogMock.mockResolvedValue(CATALOG);

    const ui = await HomePage({
      searchParams: Promise.resolve({
        op_e2e_home_card_state: `${demoUnitId}:waiting,0x00000000000000000000000000000000000000000000000000000000000000d4:unavailable`,
      }),
    });
    render(ui);

    expect(screen.getAllByText(/Waiting \/ No active unit/i).length).toBe(2);
    expect(
      screen.getAllByText(/Progress temporarily unavailable/i).length,
    ).toBe(2);
    expect(getActiveHomeUnitsMock).not.toHaveBeenCalled();
  });

  it("does not render the legacy live registry block", async () => {
    getActiveHomeUnitsMock.mockResolvedValue([
      {
        displayName: "test02",
        maxSlots: unitTileCount,
        submittedCount: 1999,
        thumbnailUrl: "https://placehold.co/512x512/png?text=test02",
        unitId: "0xunit-1",
      },
    ]);

    const ui = await HomePage();
    render(ui);

    expect(screen.queryByText(/^Live registry$/i)).toBeNull();
    expect(screen.queryByText(/one_portrait::registry/i)).toBeNull();
    expect(screen.queryByText(/^Hidden until reveal$/i)).toBeNull();
    expect(
      screen.queryByText(/No active units are available right now/i),
    ).toBeNull();
  });
});
