// @vitest-environment happy-dom

import { unitTileCount } from "@one-portrait/shared";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    });
    render(ui);

    expect(screen.getByTestId("unit-reveal-client").textContent).toContain(
      `72 / ${unitTileCount}`,
    );
    expect(screen.getByText("Demo Athlete One")).toBeTruthy();
  });

  it("shows a fallback when the Unit object cannot be fetched", async () => {
    getUnitProgressMock.mockRejectedValue(new Error("not found"));
    loadPublicEnvMock.mockReturnValue({
      suiNetwork: "testnet",
      packageId: "0xpkg",
      registryObjectId: "0xreg",
    });

    const ui = await UnitPage({
      params: Promise.resolve({ unitId: "0xunit-missing" }),
    });
    render(ui);

    expect(screen.getByText(/待機中|No active unit/i)).toBeTruthy();
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
    });
    render(ui);

    expect(
      screen.getByTestId("unit-reveal-client").getAttribute("data-master-id"),
    ).toBe("0xmaster-1");
  });
});
