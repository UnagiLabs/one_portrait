// @vitest-environment happy-dom

import { unitTileCount } from "@one-portrait/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GalleryEntryView, OwnedKakera } from "../../../lib/sui";

const {
  useEnokiConfigStateMock,
  useCurrentAccountMock,
  findOwnedKakeraForUnitMock,
  getGalleryEntryMock,
  getMasterPlacementMock,
  getSuiClientMock,
} = vi.hoisted(() => ({
  useEnokiConfigStateMock: vi.fn(),
  useCurrentAccountMock: vi.fn(),
  findOwnedKakeraForUnitMock: vi.fn(),
  getGalleryEntryMock: vi.fn(),
  getMasterPlacementMock: vi.fn(),
  getSuiClientMock: vi.fn(),
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

vi.mock("./live-progress", () => ({
  LiveProgress: ({
    initialSubmittedCount,
    maxSlots,
    onMosaicReady,
  }: {
    initialSubmittedCount: number;
    maxSlots: number;
    onMosaicReady?: (event: {
      readonly kind: "mosaicReady";
      readonly unitId: string;
      readonly athletePublicId: string;
      readonly masterId: string;
      readonly mosaicWalrusBlobId: readonly number[];
    }) => void;
  }) => (
    <div>
      <div data-testid="live-progress">
        {initialSubmittedCount} / {maxSlots}
      </div>
      <button
        onClick={() => {
          onMosaicReady?.({
            kind: "mosaicReady",
            unitId: "0xunit-1",
            athletePublicId: "1",
            masterId: "0xmaster-1",
            mosaicWalrusBlobId: Array.from(
              new TextEncoder().encode("mosaic-event-blob"),
            ),
          });
        }}
        type="button"
      >
        emit mosaic ready
      </button>
    </div>
  ),
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
    athletePublicId: "1",
    walrusBlobId: "walrus-blob-1",
    submissionNo: 42,
    mintedAtMs: 1700000000000,
    masterId: "0xmaster-1",
    mosaicWalrusBlobId: "mosaic-gallery-blob",
    placement: {
      x: 12,
      y: 34,
      submitter: "0xviewer",
      submissionNo: 42,
    },
    status: { kind: "completed" },
    ...overrides,
  };
}

function ownedKakera(overrides: Partial<OwnedKakera> = {}): OwnedKakera {
  return {
    objectId: "0xkakera-1",
    athletePublicId: "1",
    unitId: "0xunit-1",
    walrusBlobId: "walrus-blob-1",
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
  useCurrentAccountMock.mockReturnValue(null);
  getSuiClientMock.mockReturnValue({ network: "testnet" });
  findOwnedKakeraForUnitMock.mockResolvedValue(null);
  getGalleryEntryMock.mockResolvedValue(completedEntry());
  getMasterPlacementMock.mockResolvedValue({
    masterId: "0xmaster-1",
    mosaicWalrusBlobId: "mosaic-master-blob",
    placement: null,
  });
});

afterEach(() => {
  useCurrentAccountMock.mockReset();
  findOwnedKakeraForUnitMock.mockReset();
  getGalleryEntryMock.mockReset();
  getMasterPlacementMock.mockReset();
  getSuiClientMock.mockReset();
  useEnokiConfigStateMock.mockReset();
});

describe("UnitRevealClient", () => {
  it("does not render the full mosaic before reveal", () => {
    render(
      <UnitRevealClient
        displayName="Demo Athlete One"
        aggregatorBase={AGGREGATOR_BASE}
        initialMasterId={null}
        initialSubmittedCount={42}
        maxSlots={unitTileCount}
        packageId="0xpkg"
        unitId="0xunit-1"
      />,
    );

    expect(screen.getByTestId("live-progress").textContent).toContain(
      `42 / ${unitTileCount}`,
    );
    expect(screen.queryByTestId("reveal-panel")).toBeNull();
    expect(screen.queryByTestId("reveal-image")).toBeNull();
  });

  it("reveals the mosaic and highlights the viewer placement after MosaicReadyEvent", async () => {
    useCurrentAccountMock.mockReturnValue({ address: "0xviewer" });
    findOwnedKakeraForUnitMock.mockResolvedValue(ownedKakera());
    getGalleryEntryMock.mockResolvedValue(completedEntry());

    render(
      <UnitRevealClient
        displayName="Demo Athlete One"
        aggregatorBase={AGGREGATOR_BASE}
        initialMasterId={null}
        initialSubmittedCount={unitTileCount}
        maxSlots={unitTileCount}
        packageId="0xpkg"
        unitId="0xunit-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "emit mosaic ready" }));

    await waitFor(() => {
      expect(screen.getByTestId("reveal-panel")).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByTestId("placement-highlight")).toBeTruthy();
    });

    expect(screen.getByTestId("reveal-image").getAttribute("src")).toContain(
      "/v1/blobs/mosaic-gallery-blob",
    );
  });

  it("recovers the placement after MosaicReadyEvent even when gallery hydration fails", async () => {
    useCurrentAccountMock.mockReturnValue({ address: "0xviewer" });
    findOwnedKakeraForUnitMock.mockResolvedValue(ownedKakera());
    getGalleryEntryMock.mockRejectedValue(new Error("stale unit read"));
    getMasterPlacementMock.mockResolvedValue({
      masterId: "0xmaster-1",
      mosaicWalrusBlobId: "mosaic-master-blob",
      placement: {
        x: 7,
        y: 9,
        submitter: "0xviewer",
        submissionNo: 42,
      },
    });

    render(
      <UnitRevealClient
        displayName="Demo Athlete One"
        aggregatorBase={AGGREGATOR_BASE}
        initialMasterId={null}
        initialSubmittedCount={unitTileCount}
        maxSlots={unitTileCount}
        packageId="0xpkg"
        unitId="0xunit-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "emit mosaic ready" }));

    await waitFor(() => {
      expect(screen.getByTestId("placement-highlight")).toBeTruthy();
    });
    expect(screen.getByTestId("reveal-image").getAttribute("src")).toContain(
      "/v1/blobs/mosaic-master-blob",
    );
  });

  it("shows the completed mosaic on revisit without waiting for a fresh event", async () => {
    useCurrentAccountMock.mockReturnValue({ address: "0xviewer" });
    findOwnedKakeraForUnitMock.mockResolvedValue(null);
    getMasterPlacementMock.mockResolvedValue({
      masterId: "0xmaster-1",
      mosaicWalrusBlobId: "mosaic-revisit-blob",
      placement: null,
    });

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
      expect(screen.getByTestId("reveal-image").getAttribute("src")).toContain(
        "/v1/blobs/mosaic-revisit-blob",
      );
    });
    expect(screen.queryByTestId("placement-highlight")).toBeNull();
  });

  it("shows the completed mosaic on revisit without reading wallet hooks when the provider is absent", async () => {
    useEnokiConfigStateMock.mockReturnValue({
      submitEnabled: false,
      walletProviderAvailable: false,
      reason: "wallet-provider-disabled",
    });
    useCurrentAccountMock.mockImplementation(() => {
      throw new Error("wallet hook should not be read when the provider is absent");
    });
    getMasterPlacementMock.mockResolvedValue({
      masterId: "0xmaster-1",
      mosaicWalrusBlobId: "mosaic-missing-env-blob",
      placement: null,
    });

    render(
      <UnitRevealClient
        displayName="Demo Athlete One"
        aggregatorBase={AGGREGATOR_BASE}
        initialMasterId="0xmaster-1"
        initialSubmittedCount={unitTileCount}
        maxSlots={unitTileCount}
        packageId=""
        unitId="0xunit-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("reveal-image").getAttribute("src")).toContain(
        "/v1/blobs/mosaic-missing-env-blob",
      );
    });
    expect(screen.queryByTestId("placement-highlight")).toBeNull();
  });

  it("does not start reveal RPC work when startup is disabled", () => {
    getSuiClientMock.mockImplementation(() => {
      throw new Error("reveal RPC should not start when startup is disabled");
    });

    render(
      <UnitRevealClient
        aggregatorBase={AGGREGATOR_BASE}
        displayName="Demo Athlete One"
        initialMasterId="0xmaster-1"
        initialSubmittedCount={unitTileCount}
        maxSlots={unitTileCount}
        packageId="0xpkg"
        startupEnabled={false}
        unitId="0xunit-1"
      />,
    );

    expect(getSuiClientMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("reveal-panel")).toBeNull();
  });

  it("still renders the mosaic when placement lookup fails", async () => {
    useCurrentAccountMock.mockReturnValue({ address: "0xviewer" });
    findOwnedKakeraForUnitMock.mockResolvedValue(ownedKakera());
    getGalleryEntryMock.mockRejectedValue(new Error("placement lookup failed"));
    getMasterPlacementMock.mockResolvedValue({
      masterId: "0xmaster-1",
      mosaicWalrusBlobId: "mosaic-fallback-blob",
      placement: null,
    });

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
      expect(screen.getByTestId("reveal-image").getAttribute("src")).toContain(
        "/v1/blobs/mosaic-fallback-blob",
      );
    });
    expect(screen.queryByTestId("placement-highlight")).toBeNull();
  });
});
