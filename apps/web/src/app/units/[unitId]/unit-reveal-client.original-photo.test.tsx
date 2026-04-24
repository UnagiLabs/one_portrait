// @vitest-environment happy-dom

import { unitTileCount } from "@one-portrait/shared";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GalleryEntryView, OwnedKakera } from "../../../lib/sui";

const {
  useEnokiConfigStateMock,
  useCurrentAccountMock,
  findOwnedKakeraForUnitMock,
  getGalleryEntryMock,
  getMasterPlacementMock,
  getSuiClientMock,
  revealPanelMock,
} = vi.hoisted(() => ({
  useEnokiConfigStateMock: vi.fn(),
  useCurrentAccountMock: vi.fn(),
  findOwnedKakeraForUnitMock: vi.fn(),
  getGalleryEntryMock: vi.fn(),
  getMasterPlacementMock: vi.fn(),
  getSuiClientMock: vi.fn(),
  revealPanelMock: vi.fn(),
}));

vi.mock("../../../lib/enoki/provider", () => ({
  useEnokiConfigState: () => useEnokiConfigStateMock(),
}));

vi.mock("@mysten/dapp-kit", () => ({
  useCurrentAccount: () => useCurrentAccountMock(),
}));

vi.mock("../../../lib/sui", () => ({
  findOwnedKakeraForUnit: findOwnedKakeraForUnitMock,
  getGalleryEntry: getGalleryEntryMock,
  getMasterPlacement: getMasterPlacementMock,
  getSuiClient: getSuiClientMock,
}));

vi.mock("./reveal-panel", () => ({
  RevealPanel: ({
    displayName,
    mosaicUrl,
    originalPhotoUrl,
  }: {
    readonly displayName: string;
    readonly mosaicUrl: string;
    readonly originalPhotoUrl?: string | null;
  }) => {
    revealPanelMock({ displayName, mosaicUrl, originalPhotoUrl });
    return <div data-testid="reveal-panel" />;
  },
}));

vi.mock("./live-progress", () => ({
  LiveProgress: () => <div data-testid="live-progress" />,
}));

import { UnitRevealClient } from "./unit-reveal-client";

const AGGREGATOR_BASE = "https://aggregator.example.com";

function completedEntry(
  overrides: Partial<
    Extract<GalleryEntryView, { status: { kind: "completed" } }>
  > = {},
): Extract<GalleryEntryView, { status: { kind: "completed" } }> {
  return {
    unitId: "0xunit-1",
    displayName: "Demo Athlete One",
    walrusBlobId: "walrus-blob-1",
    kakeraObjectId: "0xkakera-1",
    submissionNo: 42,
    mintedAtMs: 1700000000000,
    masterId: "0xmaster-1",
    mosaicWalrusBlobId: "mosaic-blob-1",
    placement: null,
    status: { kind: "completed" },
    ...overrides,
  };
}

function ownedKakera(overrides: Partial<OwnedKakera> = {}): OwnedKakera {
  return {
    objectId: "0xkakera-1",
    unitId: "0xunit-1",
    walrusBlobId: "walrus-original-1",
    submissionNo: 42,
    mintedAtMs: 1700000000000,
    ...overrides,
  };
}

beforeEach(() => {
  useEnokiConfigStateMock.mockReturnValue({
    submitEnabled: true,
    walletProviderAvailable: true,
    config: {
      suiNetwork: "testnet",
      packageId: "0xpkg",
      enokiApiKey: "public-key",
      googleClientId: "google-client-id",
    },
  });
  useCurrentAccountMock.mockReturnValue({ address: "0xviewer" });
  getSuiClientMock.mockReturnValue({ network: "testnet" });
  findOwnedKakeraForUnitMock.mockResolvedValue(ownedKakera());
  getGalleryEntryMock.mockResolvedValue(completedEntry());
  getMasterPlacementMock.mockResolvedValue({
    masterId: "0xmaster-1",
    mosaicWalrusBlobId: "mosaic-master-blob",
    placement: null,
  });
});

afterEach(() => {
  revealPanelMock.mockReset();
  useCurrentAccountMock.mockReset();
  findOwnedKakeraForUnitMock.mockReset();
  getGalleryEntryMock.mockReset();
  getMasterPlacementMock.mockReset();
  getSuiClientMock.mockReset();
  useEnokiConfigStateMock.mockReset();
});

describe("UnitRevealClient original photo wiring", () => {
  it("passes the viewer original photo URL into RevealPanel", async () => {
    render(
      <UnitRevealClient
        displayName="Demo Athlete One"
        aggregatorBase={AGGREGATOR_BASE}
        initialMasterId="0xmaster-1"
        initialSubmittedCount={unitTileCount}
        maxSlots={unitTileCount}
        packageId="0xpkg"
        unitId="0xunit-1"
      />,
    );

    await waitFor(() => {
      expect(revealPanelMock).toHaveBeenCalledWith(
        expect.objectContaining({
          originalPhotoUrl: `${AGGREGATOR_BASE}/v1/blobs/walrus-original-1`,
        }),
      );
    });
  });

  it("keeps the original photo URL null when no owned Kakera is found", async () => {
    findOwnedKakeraForUnitMock.mockResolvedValue(null);

    render(
      <UnitRevealClient
        displayName="Demo Athlete One"
        aggregatorBase={AGGREGATOR_BASE}
        initialMasterId="0xmaster-1"
        initialSubmittedCount={unitTileCount}
        maxSlots={unitTileCount}
        packageId="0xpkg"
        unitId="0xunit-1"
      />,
    );

    await waitFor(() => {
      expect(revealPanelMock).toHaveBeenCalledWith(
        expect.objectContaining({
          originalPhotoUrl: null,
        }),
      );
    });
  });
});
