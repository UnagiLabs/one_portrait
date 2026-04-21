// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GalleryEntryView, OwnedKakera } from "../../lib/sui";

const {
  useCurrentAccountMock,
  getSuiClientMock,
  listOwnedKakeraMock,
  getGalleryEntryMock,
} = vi.hoisted(() => ({
  useCurrentAccountMock: vi.fn(),
  getSuiClientMock: vi.fn(),
  listOwnedKakeraMock: vi.fn(),
  getGalleryEntryMock: vi.fn(),
}));

vi.mock("@mysten/dapp-kit", () => ({
  useCurrentAccount: () => useCurrentAccountMock(),
}));

vi.mock("../../lib/sui", () => ({
  getSuiClient: getSuiClientMock,
  listOwnedKakera: listOwnedKakeraMock,
  getGalleryEntry: getGalleryEntryMock,
}));

import { GalleryClient } from "./gallery-client";

const CATALOG = [
  {
    athletePublicId: "1",
    slug: "demo-athlete-one",
    displayName: "Demo Athlete One",
    thumbnailUrl: "https://placehold.co/512x512/png?text=Athlete+1",
  },
] as const;

function ownedKakera(overrides: Partial<OwnedKakera> = {}): OwnedKakera {
  return {
    objectId: "0xkakera-1",
    athletePublicId: "1",
    unitId: "0xunit-1",
    walrusBlobId: "walrus-original-1",
    submissionNo: 17,
    mintedAtMs: 1700000000000,
    ...overrides,
  };
}

function pendingEntry(
  overrides: Partial<
    Extract<GalleryEntryView, { status: { kind: "pending" } }>
  > = {},
): Extract<GalleryEntryView, { status: { kind: "pending" } }> {
  return {
    unitId: "0xunit-1",
    athletePublicId: "1",
    walrusBlobId: "walrus-original-1",
    submissionNo: 17,
    mintedAtMs: 1700000000000,
    masterId: null,
    mosaicWalrusBlobId: null,
    placement: null,
    status: { kind: "pending" },
    ...overrides,
  };
}

function completedEntry(
  overrides: Partial<
    Extract<GalleryEntryView, { status: { kind: "completed" } }>
  > = {},
): Extract<GalleryEntryView, { status: { kind: "completed" } }> {
  return {
    unitId: "0xunit-1",
    athletePublicId: "1",
    walrusBlobId: "walrus-original-1",
    submissionNo: 17,
    mintedAtMs: 1700000000000,
    masterId: "0xmaster-1",
    mosaicWalrusBlobId: "walrus-mosaic-1",
    placement: {
      x: 12,
      y: 8,
      submitter: "0xviewer",
      submissionNo: 17,
    },
    status: { kind: "completed" },
    ...overrides,
  };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR = "https://aggregator.example.com";
  useCurrentAccountMock.mockReturnValue(null);
  getSuiClientMock.mockReturnValue({ network: "testnet" });
  listOwnedKakeraMock.mockResolvedValue([]);
  getGalleryEntryMock.mockResolvedValue(pendingEntry());
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR;
  useCurrentAccountMock.mockReset();
  getSuiClientMock.mockReset();
  listOwnedKakeraMock.mockReset();
  getGalleryEntryMock.mockReset();
});

describe("GalleryClient", () => {
  it("renders the signed-out shell when no wallet is connected", () => {
    render(<GalleryClient catalog={CATALOG} packageId="0xpkg" />);

    expect(
      screen.getByText(/Connect a wallet to view your Kakera/i),
    ).toBeTruthy();
    expect(listOwnedKakeraMock).not.toHaveBeenCalled();
  });

  it("renders the no Kakera state when the connected wallet owns none", async () => {
    useCurrentAccountMock.mockReturnValue({ address: "0xviewer" });
    listOwnedKakeraMock.mockResolvedValue([]);

    render(<GalleryClient catalog={CATALOG} packageId="0xpkg" />);

    await waitFor(() => {
      expect(listOwnedKakeraMock).toHaveBeenCalledWith({
        ownerAddress: "0xviewer",
        packageId: "0xpkg",
        suiClient: { network: "testnet" },
      });
    });

    expect(screen.getByText(/No Kakera found for this wallet/i)).toBeTruthy();
  });

  it("renders pending entries with a waiting label", async () => {
    useCurrentAccountMock.mockReturnValue({ address: "0xviewer" });
    listOwnedKakeraMock.mockResolvedValue([ownedKakera()]);
    getGalleryEntryMock.mockResolvedValue(pendingEntry());

    render(<GalleryClient catalog={CATALOG} packageId="0xpkg" />);

    await waitFor(() => {
      expect(screen.getByText("Demo Athlete One")).toBeTruthy();
    });

    expect(screen.getByText(/Waiting for reveal/i)).toBeTruthy();
    expect(screen.getByText(/Submission #17/i)).toBeTruthy();
  });

  it("renders completed entries with mosaic and metadata", async () => {
    useCurrentAccountMock.mockReturnValue({ address: "0xviewer" });
    listOwnedKakeraMock.mockResolvedValue([ownedKakera()]);
    getGalleryEntryMock.mockResolvedValue(completedEntry());

    render(<GalleryClient catalog={CATALOG} packageId="0xpkg" />);

    await waitFor(() => {
      expect(
        screen.getByAltText(/Demo Athlete One completed mosaic/i),
      ).toBeTruthy();
    });

    expect(screen.getAllByText(/Completed/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Placed at 12, 8/i)).toBeTruthy();
    expect(screen.getByText(/Master 0xmaster-1/i)).toBeTruthy();
    expect(
      screen
        .getByAltText(/Demo Athlete One completed mosaic/i)
        .getAttribute("src"),
    ).toContain("/v1/blobs/walrus-mosaic-1");
  });

  it("sorts entries by mintedAtMs across units", async () => {
    useCurrentAccountMock.mockReturnValue({ address: "0xviewer" });
    listOwnedKakeraMock.mockResolvedValue([
      ownedKakera({
        objectId: "0xolder",
        unitId: "0xunit-older",
        walrusBlobId: "walrus-original-older",
        submissionNo: 10,
        mintedAtMs: 1700000000000,
      }),
      ownedKakera({
        objectId: "0xnewer",
        unitId: "0xunit-newer",
        walrusBlobId: "walrus-original-newer",
        submissionNo: 1,
        mintedAtMs: 1800000000000,
      }),
    ]);
    getGalleryEntryMock
      .mockResolvedValueOnce(
        completedEntry({
          unitId: "0xunit-older",
          walrusBlobId: "walrus-original-older",
          submissionNo: 10,
          mintedAtMs: 1700000000000,
        }),
      )
      .mockResolvedValueOnce(
        completedEntry({
          unitId: "0xunit-newer",
          walrusBlobId: "walrus-original-newer",
          submissionNo: 1,
          mintedAtMs: 1800000000000,
        }),
      );

    render(<GalleryClient catalog={CATALOG} packageId="0xpkg" />);

    const headings = await screen.findAllByRole("heading", { level: 2 });
    const unitIds = screen
      .getAllByText(/^0xunit-/)
      .map((element) => element.textContent);

    expect(headings).toHaveLength(2);
    expect(unitIds[0]).toBe("0xunit-newer");
    expect(unitIds[1]).toBe("0xunit-older");
  });

  it("keeps the completed card usable when the original image fails", async () => {
    useCurrentAccountMock.mockReturnValue({ address: "0xviewer" });
    listOwnedKakeraMock.mockResolvedValue([ownedKakera()]);
    getGalleryEntryMock.mockResolvedValue(completedEntry());

    render(<GalleryClient catalog={CATALOG} packageId="0xpkg" />);

    const originalImage = await screen.findByAltText(
      /Demo Athlete One original submission/i,
    );
    fireEvent.error(originalImage);

    await waitFor(() => {
      expect(screen.getByText(/Original photo unavailable/i)).toBeTruthy();
    });

    expect(
      screen.getByAltText(/Demo Athlete One completed mosaic/i),
    ).toBeTruthy();
    expect(screen.getByText(/Placed at 12, 8/i)).toBeTruthy();
  });

  it("keeps an unavailable card when gallery entry hydration fails", async () => {
    useCurrentAccountMock.mockReturnValue({ address: "0xviewer" });
    listOwnedKakeraMock.mockResolvedValue([
      ownedKakera({
        unitId: "0xunit-unavailable",
        submissionNo: 21,
      }),
    ]);
    getGalleryEntryMock.mockRejectedValue(new Error("rpc down"));

    render(<GalleryClient catalog={CATALOG} packageId="0xpkg" />);

    await waitFor(() => {
      expect(screen.getByText(/Entry unavailable right now/i)).toBeTruthy();
    });

    expect(screen.getByText(/Submission #21/i)).toBeTruthy();
    expect(screen.queryByText(/No Kakera found for this wallet/i)).toBeNull();
  });
});
