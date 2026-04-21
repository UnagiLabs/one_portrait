// @vitest-environment happy-dom

import { unitTileCount } from "@one-portrait/shared";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { demoUnitId } from "../../../lib/demo";

const {
  getUnitProgressMock,
  getAthleteByPublicIdMock,
  loadPublicEnvMock,
  unitRevealClientMock,
} = vi.hoisted(() => ({
  getUnitProgressMock: vi.fn(),
  getAthleteByPublicIdMock: vi.fn(),
  loadPublicEnvMock: vi.fn(),
  unitRevealClientMock: vi.fn(),
}));

vi.mock("../../../lib/sui", () => ({
  getUnitProgress: getUnitProgressMock,
}));

vi.mock("../../../lib/catalog", () => ({
  getAthleteByPublicId: getAthleteByPublicIdMock,
}));

vi.mock("../../../lib/env", () => ({
  loadPublicEnv: loadPublicEnvMock,
}));

vi.mock("./unit-reveal-client", () => ({
  UnitRevealClient: ({
    initialSubmittedCount,
    maxSlots,
    initialMasterId,
  }: {
    initialSubmittedCount: number;
    maxSlots: number;
    initialMasterId: string | null;
  }) => (
    <div
      data-master-id={initialMasterId ?? ""}
      data-testid="unit-reveal-client"
      ref={() => {
        unitRevealClientMock({
          initialSubmittedCount,
          maxSlots,
          initialMasterId,
        });
      }}
    >
      {initialSubmittedCount} / {maxSlots}
    </div>
  ),
}));

import UnitPage from "./page";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_DEMO_MODE;
  delete process.env.NEXT_PUBLIC_E2E_STUB_WALLET;
  getUnitProgressMock.mockReset();
  getAthleteByPublicIdMock.mockReset();
  loadPublicEnvMock.mockReset();
  unitRevealClientMock.mockReset();
});

describe("UnitPage", () => {
  it("renders the initial progress count fetched on the server", async () => {
    getUnitProgressMock.mockResolvedValue({
      unitId: "0xunit-1",
      athletePublicId: "1",
      submittedCount: 72,
      maxSlots: unitTileCount,
      status: "pending",
      masterId: null,
    });
    getAthleteByPublicIdMock.mockResolvedValue({
      athletePublicId: "1",
      slug: "demo-athlete-one",
      displayName: "Demo Athlete One",
      thumbnailUrl: "https://placehold.co/512x512/png?text=Athlete+1",
    });
    loadPublicEnvMock.mockReturnValue({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      registryObjectId: "0xreg",
    });

    const ui = await UnitPage({
      params: Promise.resolve({ unitId: "0xunit-1" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(screen.getByTestId("unit-reveal-client").textContent).toContain(
      `72 / ${unitTileCount}`,
    );
    expect(screen.getByText("Demo Athlete One")).toBeTruthy();
  });

  it("shows the route athleteName when unit progress cannot be fetched", async () => {
    getUnitProgressMock.mockRejectedValue(new Error("not found"));
    loadPublicEnvMock.mockReturnValue({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      registryObjectId: "0xreg",
    });

    const ui = await UnitPage({
      params: Promise.resolve({ unitId: "0xunit-missing" }),
      searchParams: Promise.resolve({ athleteName: "Demo Athlete One" }),
    });
    render(ui);

    expect(
      screen.getByRole("heading", { name: "Demo Athlete One" }),
    ).toBeTruthy();
    expect(screen.getByText(/待機中|No active unit/i)).toBeTruthy();
  });

  it("shows a waiting-room link to the participation gallery", async () => {
    getUnitProgressMock.mockResolvedValue({
      unitId: "0xunit-1",
      athletePublicId: "1",
      submittedCount: 10,
      maxSlots: unitTileCount,
      status: "pending",
      masterId: null,
    });
    getAthleteByPublicIdMock.mockResolvedValue({
      athletePublicId: "1",
      slug: "demo-athlete-one",
      displayName: "Demo Athlete One",
      thumbnailUrl: "https://placehold.co/512x512/png?text=Athlete+1",
    });
    loadPublicEnvMock.mockReturnValue({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      registryObjectId: "0xreg",
    });

    const ui = await UnitPage({
      params: Promise.resolve({ unitId: "0xunit-1" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    const link = screen.getByRole("link", {
      name: /participation history/i,
    });
    expect(link.getAttribute("href")).toBe("/gallery");
  });

  it("shows a fixed fallback label when both route and catalog names are unavailable", async () => {
    getUnitProgressMock.mockRejectedValue(new Error("not found"));
    loadPublicEnvMock.mockReturnValue({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      registryObjectId: "0xreg",
    });

    const ui = await UnitPage({
      params: Promise.resolve({ unitId: "0xunit-missing" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(
      screen.getByRole("heading", { name: "選手情報を一時取得できません" }),
    ).toBeTruthy();
  });

  it("treats a blank athleteName query as missing", async () => {
    getUnitProgressMock.mockRejectedValue(new Error("not found"));
    loadPublicEnvMock.mockReturnValue({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      registryObjectId: "0xreg",
    });

    const ui = await UnitPage({
      params: Promise.resolve({ unitId: "0xunit-missing" }),
      searchParams: Promise.resolve({ athleteName: "   " }),
    });
    render(ui);

    expect(
      screen.getByRole("heading", { name: "選手情報を一時取得できません" }),
    ).toBeTruthy();
  });

  it("passes the packageId from env to the live progress client component", async () => {
    getUnitProgressMock.mockResolvedValue({
      unitId: "0xunit-1",
      athletePublicId: "1",
      submittedCount: 10,
      maxSlots: unitTileCount,
      status: "pending",
      masterId: null,
    });
    getAthleteByPublicIdMock.mockResolvedValue({
      athletePublicId: "1",
      slug: "demo-athlete-one",
      displayName: "Demo Athlete One",
      thumbnailUrl: "https://placehold.co/512x512/png?text=Athlete+1",
    });
    loadPublicEnvMock.mockReturnValue({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      registryObjectId: "0xreg",
    });

    const ui = await UnitPage({
      params: Promise.resolve({ unitId: "0xunit-1" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(screen.getByTestId("unit-reveal-client")).toBeTruthy();
  });

  it("passes masterId to the client wrapper so completed units can reveal on revisit", async () => {
    getUnitProgressMock.mockResolvedValue({
      unitId: "0xunit-1",
      athletePublicId: "1",
      submittedCount: unitTileCount,
      maxSlots: unitTileCount,
      status: "finalized",
      masterId: "0xmaster-1",
    });
    getAthleteByPublicIdMock.mockResolvedValue({
      athletePublicId: "1",
      slug: "demo-athlete-one",
      displayName: "Demo Athlete One",
      thumbnailUrl: "https://placehold.co/512x512/png?text=Athlete+1",
    });
    loadPublicEnvMock.mockReturnValue({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      registryObjectId: "0xreg",
    });

    const ui = await UnitPage({
      params: Promise.resolve({ unitId: "0xunit-1" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(
      screen.getByTestId("unit-reveal-client").getAttribute("data-master-id"),
    ).toBe("0xmaster-1");
  });

  it("prefers the catalog name when both catalog and route fallback are available", async () => {
    getUnitProgressMock.mockResolvedValue({
      unitId: "0xunit-1",
      athletePublicId: "1",
      submittedCount: 15,
      maxSlots: unitTileCount,
      status: "pending",
      masterId: null,
    });
    getAthleteByPublicIdMock.mockResolvedValue({
      athletePublicId: "1",
      slug: "demo-athlete-one",
      displayName: "Catalog Athlete Name",
      thumbnailUrl: "https://placehold.co/512x512/png?text=Athlete+1",
    });
    loadPublicEnvMock.mockReturnValue({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      registryObjectId: "0xreg",
    });

    const ui = await UnitPage({
      params: Promise.resolve({ unitId: "0xunit-1" }),
      searchParams: Promise.resolve({ athleteName: "Route Athlete Name" }),
    });
    render(ui);

    expect(
      screen.getByRole("heading", { name: "Catalog Athlete Name" }),
    ).toBeTruthy();
  });

  it("falls back to route athleteName when catalog lookup fails", async () => {
    getUnitProgressMock.mockResolvedValue({
      unitId: "0xunit-1",
      athletePublicId: "1",
      submittedCount: 15,
      maxSlots: unitTileCount,
      status: "pending",
      masterId: null,
    });
    getAthleteByPublicIdMock.mockRejectedValue(new Error("catalog down"));
    loadPublicEnvMock.mockReturnValue({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      registryObjectId: "0xreg",
    });

    const ui = await UnitPage({
      params: Promise.resolve({ unitId: "0xunit-1" }),
      searchParams: Promise.resolve({ athleteName: "Demo Athlete One" }),
    });
    render(ui);

    expect(screen.getByText("Demo Athlete One")).toBeTruthy();
    expect(screen.getByTestId("unit-reveal-client")).toBeTruthy();
  });

  it("uses demo fixture progress without calling Sui when demo mode is enabled", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "1";
    getAthleteByPublicIdMock.mockResolvedValue({
      athletePublicId: "1",
      slug: "demo-athlete-one",
      displayName: "Demo Athlete One",
      thumbnailUrl: "https://placehold.co/512x512/png?text=Athlete+1",
    });
    loadPublicEnvMock.mockReturnValue({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      registryObjectId: "0xreg",
    });

    const ui = await UnitPage({
      params: Promise.resolve({ unitId: demoUnitId }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(screen.getByText("Demo Athlete One")).toBeTruthy();
    expect(screen.getByTestId("unit-reveal-client").textContent).toContain(
      "347 /",
    );
    expect(
      screen.getByRole("button", { name: "Google でログイン" }),
    ).toBeTruthy();
    expect(getUnitProgressMock).not.toHaveBeenCalled();
  });

  it("applies the degraded unit seam only in stub E2E mode", async () => {
    process.env.NEXT_PUBLIC_E2E_STUB_WALLET = "1";
    loadPublicEnvMock.mockReturnValue({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      registryObjectId: "0xreg",
    });

    const ui = await UnitPage({
      params: Promise.resolve({ unitId: "0xunit-missing" }),
      searchParams: Promise.resolve({
        athleteName: "Demo Athlete One",
        op_e2e_unit_progress: "missing",
      }),
    });
    render(ui);

    expect(getUnitProgressMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Demo Athlete One" }),
    ).toBeTruthy();
    expect(screen.getByText(/待機中|No active unit/i)).toBeTruthy();
  });

  it("ignores the degraded unit seam outside stub E2E mode", async () => {
    getUnitProgressMock.mockResolvedValue({
      unitId: "0xunit-1",
      athletePublicId: "1",
      submittedCount: 15,
      maxSlots: unitTileCount,
      status: "pending",
      masterId: null,
    });
    getAthleteByPublicIdMock.mockResolvedValue({
      athletePublicId: "1",
      slug: "demo-athlete-one",
      displayName: "Catalog Athlete Name",
      thumbnailUrl: "https://placehold.co/512x512/png?text=Athlete+1",
    });
    loadPublicEnvMock.mockReturnValue({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      registryObjectId: "0xreg",
    });

    const ui = await UnitPage({
      params: Promise.resolve({ unitId: "0xunit-1" }),
      searchParams: Promise.resolve({
        athleteName: "Route Athlete Name",
        op_e2e_unit_progress: "missing",
      }),
    });
    render(ui);

    expect(
      screen.getByRole("heading", { name: "Catalog Athlete Name" }),
    ).toBeTruthy();
    expect(screen.getByTestId("unit-reveal-client")).toBeTruthy();
  });
});
