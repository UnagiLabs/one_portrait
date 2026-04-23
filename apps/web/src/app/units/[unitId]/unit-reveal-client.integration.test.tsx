// @vitest-environment happy-dom

import { unitTileCount } from "@one-portrait/shared";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useCurrentAccountMock,
  getMasterPlacementMock,
  getSuiClientMock,
  findOwnedKakeraForUnitMock,
  getGalleryEntryMock,
} = vi.hoisted(() => ({
  useCurrentAccountMock: vi.fn(),
  getMasterPlacementMock: vi.fn(),
  getSuiClientMock: vi.fn(),
  findOwnedKakeraForUnitMock: vi.fn(),
  getGalleryEntryMock: vi.fn(),
}));

vi.mock("@mysten/dapp-kit", () => ({
  SuiClientProvider: ({ children }: { readonly children: React.ReactNode }) => {
    return <>{children}</>;
  },
  WalletProvider: ({ children }: { readonly children: React.ReactNode }) => {
    return <>{children}</>;
  },
  useCurrentAccount: () => useCurrentAccountMock(),
  useSuiClientContext: () => ({
    client: { network: "testnet" },
    network: "testnet",
  }),
}));

vi.mock("../../../lib/sui", () => ({
  findOwnedKakeraForUnit: findOwnedKakeraForUnitMock,
  getGalleryEntry: getGalleryEntryMock,
  getMasterPlacement: getMasterPlacementMock,
  getSuiClient: getSuiClientMock,
}));

import { AppWalletProvider } from "../../../lib/enoki/provider";
import { UnitRevealClient } from "./unit-reveal-client";

const AGGREGATOR_BASE = "https://aggregator.example.com";

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUI_NETWORK;
  delete process.env.NEXT_PUBLIC_REGISTRY_OBJECT_ID;
  delete process.env.NEXT_PUBLIC_PACKAGE_ID;
  useCurrentAccountMock.mockImplementation(() => {
    throw new Error(
      "wallet hooks must not be read when the wallet provider is unavailable",
    );
  });
  getSuiClientMock.mockReturnValue({ network: "testnet" });
  findOwnedKakeraForUnitMock.mockResolvedValue(null);
  getGalleryEntryMock.mockResolvedValue(null);
  getMasterPlacementMock.mockResolvedValue({
    masterId: "0xmaster-1",
    mosaicWalrusBlobId: "mosaic-revisit-blob",
    placement: null,
  });
});

afterEach(() => {
  useCurrentAccountMock.mockReset();
  getMasterPlacementMock.mockReset();
  getSuiClientMock.mockReset();
  findOwnedKakeraForUnitMock.mockReset();
  getGalleryEntryMock.mockReset();
});

describe("UnitRevealClient with missing public env", () => {
  it("hydrates the waiting-room progress UI without a wallet provider", () => {
    render(
      <AppWalletProvider>
        <UnitRevealClient
          aggregatorBase={AGGREGATOR_BASE}
          displayName="Demo Athlete One"
          initialMasterId={null}
          initialSubmittedCount={42}
          maxSlots={unitTileCount}
          packageId=""
          unitId="0xunit-1"
        />
      </AppWalletProvider>,
    );

    expect(screen.getByText(new RegExp(`42\\s*\\/\\s*${unitTileCount}`))).toBeTruthy();
    expect(screen.queryByTestId("reveal-panel")).toBeNull();
  });

  it("still reveals the completed mosaic on revisit without reading wallet hooks", async () => {
    render(
      <AppWalletProvider>
        <UnitRevealClient
          aggregatorBase={AGGREGATOR_BASE}
          displayName="Demo Athlete One"
          initialMasterId="0xmaster-1"
          initialSubmittedCount={unitTileCount}
          maxSlots={unitTileCount}
          packageId=""
          unitId="0xunit-1"
        />
      </AppWalletProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("reveal-image").getAttribute("src")).toContain(
        "/v1/blobs/mosaic-revisit-blob",
      );
    });
    expect(screen.queryByTestId("placement-highlight")).toBeNull();
  });

  it("does not start reveal RPC work when startup is disabled", () => {
    getSuiClientMock.mockImplementation(() => {
      throw new Error("reveal RPC should not start when startup is disabled");
    });

    render(
      <AppWalletProvider>
        <UnitRevealClient
          aggregatorBase={AGGREGATOR_BASE}
          displayName="Demo Athlete One"
          initialMasterId="0xmaster-1"
          initialSubmittedCount={unitTileCount}
          maxSlots={unitTileCount}
          packageId=""
          startupEnabled={false}
          unitId="0xunit-1"
        />
      </AppWalletProvider>,
    );

    expect(getSuiClientMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("reveal-panel")).toBeNull();
  });
});
