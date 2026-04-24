// @vitest-environment happy-dom

import { unitTileCount } from "@one-portrait/shared";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    region: "Demo Region One",
    status: "Active portrait",
  },
  {
    unitId:
      "0x00000000000000000000000000000000000000000000000000000000000000d4",
    slug: "demo-athlete-two",
    displayName: "Demo Athlete Two",
    thumbnailUrl: "https://placehold.co/512x512/png?text=Athlete+2",
    region: "Demo Region Two",
    status: "Opening soon",
  },
] as const;

beforeEach(() => {
  getAthleteCatalogMock.mockResolvedValue(CATALOG);
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_DEMO_MODE;
  delete process.env.NEXT_PUBLIC_E2E_STUB_WALLET;
  getAthleteCatalogMock.mockReset();
  getActiveHomeUnitsMock.mockReset();
});

describe("HomePage", () => {
  it("renders the cinematic hero and catalog-driven portrait rail", async () => {
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

    for (const athlete of CATALOG) {
      expect(screen.getAllByText(athlete.displayName).length).toBeGreaterThan(
        0,
      );
      expect(
        screen
          .getAllByAltText(athlete.displayName)
          .some((image) => image.getAttribute("src") === athlete.thumbnailUrl),
      ).toBe(true);
    }
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

  it("lets users move the portrait rail one card at a time", async () => {
    getActiveHomeUnitsMock.mockResolvedValue([]);
    const originalScrollBy = HTMLElement.prototype.scrollBy;
    const originalScrollWidth = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollWidth",
    );
    Object.defineProperty(HTMLElement.prototype, "scrollBy", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get() {
        return this.classList.contains("op-home-portrait-track") ? 1000 : 0;
      },
    });

    try {
      const ui = await HomePage();
      render(ui);

      const rail = document.querySelector<HTMLElement>(
        ".op-home-portrait-rail",
      );
      expect(rail).toBeTruthy();
      if (!rail) {
        throw new Error("Portrait rail was not rendered");
      }

      rail.scrollLeft = 10;
      fireEvent.click(screen.getByRole("button", { name: "Next portraits" }));
      expect(rail.scrollLeft).toBe(276);

      fireEvent.click(
        screen.getByRole("button", { name: "Previous portraits" }),
      );
      expect(rail.scrollLeft).toBe(10);
    } finally {
      Object.defineProperty(HTMLElement.prototype, "scrollBy", {
        configurable: true,
        value: originalScrollBy,
      });
      if (originalScrollWidth) {
        Object.defineProperty(
          HTMLElement.prototype,
          "scrollWidth",
          originalScrollWidth,
        );
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollWidth");
      }
    }
  });

  it("keeps autoplay active immediately after arrow navigation", async () => {
    getActiveHomeUnitsMock.mockResolvedValue([]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-24T00:00:00.000Z"));

    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    const originalScrollBy = HTMLElement.prototype.scrollBy;
    const originalScrollWidth = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollWidth",
    );
    const frameCallbacks: FrameRequestCallback[] = [];

    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    window.cancelAnimationFrame = vi.fn();

    Object.defineProperty(HTMLElement.prototype, "scrollBy", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get() {
        return this.classList.contains("op-home-portrait-track") ? 1000 : 0;
      },
    });

    try {
      const ui = await HomePage();
      render(ui);

      const rail = document.querySelector<HTMLElement>(
        ".op-home-portrait-rail",
      );
      expect(rail).toBeTruthy();
      if (!rail) {
        throw new Error("Portrait rail was not rendered");
      }

      frameCallbacks.shift()?.(1);
      fireEvent.click(screen.getByRole("button", { name: "Next portraits" }));
      frameCallbacks.shift()?.(17);

      expect(rail.scrollLeft).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
      Object.defineProperty(HTMLElement.prototype, "scrollBy", {
        configurable: true,
        value: originalScrollBy,
      });
      if (originalScrollWidth) {
        Object.defineProperty(
          HTMLElement.prototype,
          "scrollWidth",
          originalScrollWidth,
        );
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollWidth");
      }
    }
  });

  it("links live portrait menu cards to the upload page", async () => {
    const firstAthlete = CATALOG[0];
    getActiveHomeUnitsMock.mockResolvedValue([
      {
        displayName: firstAthlete.displayName,
        maxSlots: unitTileCount,
        submittedCount: 1999,
        thumbnailUrl: firstAthlete.thumbnailUrl,
        unitId: "0xunit-1",
      },
    ]);

    const ui = await HomePage();
    render(ui);

    const link = screen.getAllByRole("link", {
      name: /Demo Athlete One portrait page/i,
    })[0];
    expect(link?.getAttribute("href")).toBe(
      "/units/0xunit-1?athleteName=Demo+Athlete+One",
    );
    expect(screen.getAllByText("Live").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1999 / 2000").length).toBeGreaterThan(0);
  });

  it("matches live home cards to catalog athletes without relying on chain order", async () => {
    const secondAthlete = CATALOG[1];
    getActiveHomeUnitsMock.mockResolvedValue([
      {
        displayName: secondAthlete.displayName,
        maxSlots: unitTileCount,
        submittedCount: 37,
        thumbnailUrl: secondAthlete.thumbnailUrl,
        unitId: secondAthlete.unitId,
      },
      {
        displayName: "Unlisted Chain Athlete",
        maxSlots: unitTileCount,
        submittedCount: 1998,
        thumbnailUrl: "https://placehold.co/512x512/png?text=unlisted",
        unitId:
          "0x0000000000000000000000000000000000000000000000000000000000000bad",
      },
    ]);

    const ui = await HomePage();
    render(ui);

    const secondAthleteLinks = screen.getAllByRole("link", {
      name: /Demo Athlete Two portrait page/i,
    });
    expect(secondAthleteLinks).toHaveLength(2);
    for (const link of secondAthleteLinks) {
      expect(link.getAttribute("href")).toBe(
        `/units/${secondAthlete.unitId}?athleteName=Demo+Athlete+Two`,
      );
      expect(within(link).getAllByText("Live").length).toBeGreaterThan(0);
      expect(within(link).getByText("37 / 2000")).toBeTruthy();
    }

    const firstAthleteHeadings = screen.getAllByRole("heading", {
      level: 3,
      name: "Demo Athlete One",
    });
    expect(firstAthleteHeadings).toHaveLength(2);
    for (const heading of firstAthleteHeadings) {
      const card = heading.closest(".op-home-portrait-card");
      expect(card).toBeTruthy();
      expect(card?.getAttribute("data-live")).toBeNull();
      expect(card?.closest("a")).toBeNull();
      expect(within(card as HTMLElement).queryByText("Live")).toBeNull();
      expect(within(card as HTMLElement).queryByText("37 / 2000")).toBeNull();
      expect(within(card as HTMLElement).queryByText("1998 / 2000")).toBeNull();
    }

    expect(screen.queryByText("Unlisted Chain Athlete")).toBeNull();
    expect(screen.queryByText("1998 / 2000")).toBeNull();
  });

  it("shows matched completed entries as Complete when chain lifecycle is complete", async () => {
    const firstAthlete = CATALOG[0];
    getActiveHomeUnitsMock.mockResolvedValue([
      {
        displayName: firstAthlete.displayName,
        lifecycleState: "complete",
        maxSlots: unitTileCount,
        submittedCount: 347,
        thumbnailUrl: firstAthlete.thumbnailUrl,
        unitId: "0xunit-complete",
      },
    ]);

    const ui = await HomePage();
    render(ui);

    const firstAthleteCards = screen
      .getAllByRole("heading", {
        level: 3,
        name: firstAthlete.displayName,
      })
      .map((heading) => heading.closest(".op-home-portrait-card"));
    expect(firstAthleteCards).toHaveLength(2);

    for (const card of firstAthleteCards) {
      expect(card).toBeTruthy();
      const cardElement = card as HTMLElement;
      expect(cardElement.getAttribute("data-complete")).toBe("true");
      expect(cardElement.getAttribute("data-live")).toBeNull();
      const link = cardElement.closest("a");
      expect(link?.getAttribute("href")).toBe(
        "/units/0xunit-complete?athleteName=Demo+Athlete+One",
      );
      expect(within(cardElement).getAllByText("Complete").length).toBe(2);
      expect(within(cardElement).queryByText("Live")).toBeNull();
      expect(within(cardElement).getByText("347 / 2000")).toBeTruthy();
    }

    expect(
      screen.getAllByRole("link", {
        name: /Demo Athlete One portrait page/i,
      }),
    ).toHaveLength(2);
  });

  it("keeps E2E degraded home card states distinct in the portrait rail", async () => {
    process.env.NEXT_PUBLIC_E2E_STUB_WALLET = "1";

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
    getActiveHomeUnitsMock.mockResolvedValue([]);

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
