// @vitest-environment happy-dom

import { unitTileCount } from "@one-portrait/shared";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getActiveHomeUnitsMock } = vi.hoisted(() => ({
  getActiveHomeUnitsMock: vi.fn(),
}));

vi.mock("../lib/catalog", () => ({
  getAthleteCatalog: vi.fn(),
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

afterEach(() => {
  delete process.env.NEXT_PUBLIC_DEMO_MODE;
  delete process.env.NEXT_PUBLIC_E2E_STUB_WALLET;
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
