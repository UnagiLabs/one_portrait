// @vitest-environment happy-dom

import { unitTileCount } from "@one-portrait/shared";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { demoUnitId } from "../../../lib/demo";
import {
  STUB_ATHLETE_ID,
  STUB_MASTER_ID,
  STUB_UNIT_ID,
} from "../../../lib/e2e/stub-data";

const {
  getUnitProgressMock,
  getAthleteByPublicIdMock,
  loadPublicEnvMock,
  participationAccessMock,
  unitRevealClientMock,
} = vi.hoisted(() => ({
  getUnitProgressMock: vi.fn(),
  getAthleteByPublicIdMock: vi.fn(),
  loadPublicEnvMock: vi.fn(),
  participationAccessMock: vi.fn(),
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
  UnitRevealClient: (props: {
    aggregatorBase?: string | null;
    eventSubscriptionEnabled?: boolean;
    initialSubmittedCount: number;
    initialMasterId: string | null;
    maxSlots: number;
    packageId: string | null;
    startupEnabled?: boolean;
    unitId: string;
  }) => {
    unitRevealClientMock(props);

    return (
      <div
        data-aggregator-base={props.aggregatorBase ?? ""}
        data-event-subscription-enabled={String(
          props.eventSubscriptionEnabled,
        )}
        data-master-id={props.initialMasterId ?? ""}
        data-package-id={props.packageId ?? ""}
        data-startup-enabled={String(props.startupEnabled)}
        data-testid="unit-reveal-client"
        data-unit-id={props.unitId}
      >
        {props.initialSubmittedCount} / {props.maxSlots}
      </div>
    );
  },
}));

vi.mock("./participation-access", () => ({
  ParticipationAccess: (props: {
    packageId?: string | null;
    startupEnabled?: boolean;
    unitId: string;
    walrusEnv?: {
      readonly NEXT_PUBLIC_WALRUS_AGGREGATOR: string | undefined;
      readonly NEXT_PUBLIC_WALRUS_PUBLISHER: string | undefined;
    };
  }) => {
    participationAccessMock(props);

    return (
      <div
        data-package-id={props.packageId ?? ""}
        data-startup-enabled={String(props.startupEnabled)}
        data-testid="participation-access"
        data-unit-id={props.unitId}
      />
    );
  },
}));

import UnitPage from "./page";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUI_NETWORK = "testnet";
  process.env.NEXT_PUBLIC_REGISTRY_OBJECT_ID = "0xreg";
  process.env.NEXT_PUBLIC_PACKAGE_ID = "0xpkg";
  process.env.NEXT_PUBLIC_WALRUS_PUBLISHER = "https://publisher.example.com";
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR = "https://aggregator.example.com";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_DEMO_MODE;
  delete process.env.NEXT_PUBLIC_E2E_STUB_WALLET;
  delete process.env.NEXT_PUBLIC_SUI_NETWORK;
  delete process.env.NEXT_PUBLIC_REGISTRY_OBJECT_ID;
  delete process.env.NEXT_PUBLIC_PACKAGE_ID;
  delete process.env.NEXT_PUBLIC_WALRUS_PUBLISHER;
  delete process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR;
  getUnitProgressMock.mockReset();
  getAthleteByPublicIdMock.mockReset();
  loadPublicEnvMock.mockReset();
  participationAccessMock.mockReset();
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

  it("passes the server-derived public props to the waiting-room clients", async () => {
    getUnitProgressMock.mockResolvedValue({
      unitId: "0xunit-1",
      athletePublicId: "1",
      submittedCount: 36,
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
      registryObjectId: "0xreg",
      packageId: "0xignored",
    });

    const ui = await UnitPage({
      params: Promise.resolve({ unitId: "0xunit-1" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(unitRevealClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregatorBase: "https://aggregator.example.com",
        eventSubscriptionEnabled: true,
        packageId: "0xpkg",
        startupEnabled: true,
        unitId: "0xunit-1",
      }),
    );
    expect(participationAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        packageId: "0xpkg",
        startupEnabled: true,
        unitId: "0xunit-1",
        walrusEnv: {
          NEXT_PUBLIC_WALRUS_AGGREGATOR: "https://aggregator.example.com",
          NEXT_PUBLIC_WALRUS_PUBLISHER: "https://publisher.example.com",
        },
      }),
    );
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
    expect(
      screen.getByTestId("unit-reveal-client").getAttribute("data-package-id"),
    ).toBe("0xpkg");
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
    expect(screen.getByRole("button", { name: "Google zkLogin" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sui wallet" })).toBeTruthy();
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

  it("applies the active unit bootstrap only in stub E2E mode", async () => {
    process.env.NEXT_PUBLIC_E2E_STUB_WALLET = "1";
    loadPublicEnvMock.mockReturnValue({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      registryObjectId: "0xreg",
    });

    const ui = await UnitPage({
      params: Promise.resolve({ unitId: "0xunit-active" }),
      searchParams: Promise.resolve({
        athleteName: "Demo Athlete One",
        op_e2e_unit_progress: "active",
      }),
    });
    render(ui);

    expect(getUnitProgressMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Demo Athlete One" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        new RegExp(`${unitTileCount - 1}\\s*/\\s*${unitTileCount}`),
      ),
    ).toBeTruthy();
  });

  it("applies the finalized unit bootstrap only for the shared stub unit", async () => {
    process.env.NEXT_PUBLIC_E2E_STUB_WALLET = "1";
    loadPublicEnvMock.mockReturnValue({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      registryObjectId: "0xreg",
    });

    const ui = await UnitPage({
      params: Promise.resolve({ unitId: STUB_UNIT_ID }),
      searchParams: Promise.resolve({
        athleteName: "Demo Athlete One",
        op_e2e_unit_progress: "finalized",
      }),
    });
    render(ui);

    expect(getUnitProgressMock).not.toHaveBeenCalled();
    expect(
      screen.getByTestId("unit-reveal-client").getAttribute("data-master-id"),
    ).toBe(STUB_MASTER_ID);
    expect(unitRevealClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialSubmittedCount: unitTileCount,
        initialMasterId: STUB_MASTER_ID,
        maxSlots: unitTileCount,
      }),
    );
    expect(getAthleteByPublicIdMock).toHaveBeenCalledWith(STUB_ATHLETE_ID);
  });

  it("ignores the finalized unit bootstrap for non-stub units", async () => {
    process.env.NEXT_PUBLIC_E2E_STUB_WALLET = "1";
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
        op_e2e_unit_progress: "finalized",
      }),
    });
    render(ui);

    expect(getUnitProgressMock).toHaveBeenCalledWith("0xunit-1");
    expect(
      screen.getByTestId("unit-reveal-client").getAttribute("data-master-id"),
    ).toBe("");
  });

  it("ignores the finalized unit bootstrap outside stub E2E mode", async () => {
    getUnitProgressMock.mockResolvedValue({
      unitId: STUB_UNIT_ID,
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
      params: Promise.resolve({ unitId: STUB_UNIT_ID }),
      searchParams: Promise.resolve({
        athleteName: "Route Athlete Name",
        op_e2e_unit_progress: "finalized",
      }),
    });
    render(ui);

    expect(getUnitProgressMock).toHaveBeenCalledWith(STUB_UNIT_ID);
    expect(
      screen.getByTestId("unit-reveal-client").getAttribute("data-master-id"),
    ).toBe("");
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

  it("disables reveal and event startup when the network env is unavailable", async () => {
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
    delete process.env.NEXT_PUBLIC_SUI_NETWORK;
    delete process.env.NEXT_PUBLIC_REGISTRY_OBJECT_ID;

    const ui = await UnitPage({
      params: Promise.resolve({ unitId: "0xunit-1" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(
      screen.getByTestId("unit-reveal-client").getAttribute("data-startup-enabled"),
    ).toBe("false");
    expect(
      screen
        .getByTestId("unit-reveal-client")
        .getAttribute("data-event-subscription-enabled"),
    ).toBe("false");
    expect(
      screen.getByTestId("participation-access").getAttribute("data-startup-enabled"),
    ).toBe("false");
  });
});
