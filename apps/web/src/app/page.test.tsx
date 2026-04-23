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
  delete process.env.NEXT_PUBLIC_E2E_STUB_WALLET;
  getAthleteCatalogMock.mockReset();
  getActiveHomeUnitsMock.mockReset();
});

describe("HomePage", () => {
  it("renders chain-driven cards with on-chain metadata", async () => {
    getActiveHomeUnitsMock.mockResolvedValue([
      {
        ...CATALOG[0],
        maxSlots: unitTileCount,
        submittedCount: 42,
        unitId: "0xunit-1",
      },
      {
        ...CATALOG[1],
        maxSlots: unitTileCount,
        submittedCount: 12,
        unitId: "0xunit-2",
      },
    ]);

    const ui = await HomePage();
    render(ui);

    expect(screen.getByText("Demo Athlete One")).toBeTruthy();
    expect(screen.getByText("Demo Athlete Two")).toBeTruthy();
    expect(screen.getByText(/demo-athlete-one/)).toBeTruthy();
    expect(screen.getByText(/demo-athlete-two/)).toBeTruthy();
  });

  it("shows the current unit progress when an active unit exists", async () => {
    getActiveHomeUnitsMock.mockResolvedValue([
      {
        ...CATALOG[0],
        maxSlots: unitTileCount,
        submittedCount: 123,
        unitId: "0xunit-1",
      },
    ]);

    const ui = await HomePage();
    render(ui);

    expect(
      screen.getByText(new RegExp(`123\\s*/\\s*${unitTileCount}`)),
    ).toBeTruthy();
  });

  it("shows a hero link to the participation gallery", async () => {
    getActiveHomeUnitsMock.mockResolvedValue([
      {
        ...CATALOG[0],
        maxSlots: unitTileCount,
        submittedCount: 123,
        unitId: "0xunit-1",
      },
    ]);

    const ui = await HomePage();
    render(ui);

    const link = screen.getByRole("link", {
      name: /participation history/i,
    });
    expect(link.getAttribute("href")).toBe("/gallery");
  });

  it("shows an empty state when no active units are available", async () => {
    getActiveHomeUnitsMock.mockResolvedValue([]);

    const ui = await HomePage();
    render(ui);

    expect(
      screen.getByText(/現在表示できる開催中ユニットはありません/),
    ).toBeTruthy();
  });

  it("links each athlete card to /units/[unitId] when a unit exists", async () => {
    getActiveHomeUnitsMock.mockResolvedValue([
      {
        ...CATALOG[0],
        maxSlots: unitTileCount,
        submittedCount: 0,
        unitId: "0xunit-1",
      },
    ]);

    const ui = await HomePage();
    render(ui);

    const link = screen
      .getAllByRole("link")
      .find(
        (el) =>
          el.getAttribute("href") ===
          "/units/0xunit-1?athleteName=Demo+Athlete+One",
      );
    expect(link).toBeTruthy();
  });

  it("falls back to the empty state when the chain read fails", async () => {
    getActiveHomeUnitsMock.mockRejectedValue(new Error("rpc down"));

    const ui = await HomePage();
    render(ui);

    expect(
      screen.getByText(/現在表示できる開催中ユニットはありません/),
    ).toBeTruthy();
  });

  it("falls back to the empty state when the configured registry is stale", async () => {
    const { RegistrySchemaError } = await import("../lib/sui");
    getActiveHomeUnitsMock.mockRejectedValue(
      new RegistrySchemaError("0xstale", "missing `athlete_metadata`"),
    );

    const ui = await HomePage();
    render(ui);

    expect(
      screen.getByText(/現在表示できる開催中ユニットはありません/),
    ).toBeTruthy();
  });

  it("uses demo fixture progress when demo mode is enabled", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "1";
    getAthleteCatalogMock.mockResolvedValue(CATALOG);

    const ui = await HomePage();
    render(ui);

    const link = screen
      .getAllByRole("link")
      .find(
        (el) =>
          el.getAttribute("href") ===
          `/units/${demoUnitId}?athleteName=Demo+Athlete+One`,
      );

    expect(link).toBeTruthy();
    expect(getActiveHomeUnitsMock).not.toHaveBeenCalled();
  });

  it("applies explicit home degraded overrides only in stub E2E mode", async () => {
    process.env.NEXT_PUBLIC_E2E_STUB_WALLET = "1";
    getAthleteCatalogMock.mockResolvedValue(CATALOG);

    const ui = await HomePage({
      searchParams: Promise.resolve({
        op_e2e_home_card_state: "1:waiting,2:unavailable",
      }),
    });
    render(ui);

    expect(screen.getByText("Demo Athlete One")).toBeTruthy();
    expect(screen.getByText("Demo Athlete Two")).toBeTruthy();
    expect(screen.getByText(/待機中|No active unit/i)).toBeTruthy();
    expect(
      screen.getByText(/進捗を一時取得できません|temporarily unavailable/i),
    ).toBeTruthy();
    expect(getActiveHomeUnitsMock).not.toHaveBeenCalled();
  });

  it("ignores home degraded overrides outside stub E2E mode", async () => {
    getActiveHomeUnitsMock.mockResolvedValue([
      {
        ...CATALOG[0],
        maxSlots: unitTileCount,
        submittedCount: 12,
        unitId: "0xunit-1",
      },
    ]);

    const ui = await HomePage({
      searchParams: Promise.resolve({
        op_e2e_home_card_state: "1:waiting",
      }),
    });
    render(ui);

    expect(
      screen.getByText(new RegExp(`12\\s*/\\s*${unitTileCount}`)),
    ).toBeTruthy();
  });
});
