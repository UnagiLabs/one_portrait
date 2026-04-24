// @vitest-environment happy-dom

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GalleryEntryView, OwnedKakera } from "../../lib/sui";

const {
  connectModalMock,
  useCurrentAccountMock,
  useCurrentWalletMock,
  useWalletsMock,
  useConnectWalletMock,
  getSuiClientMock,
  listOwnedKakeraMock,
  getGalleryEntryMock,
} = vi.hoisted(() => ({
  connectModalMock: vi.fn(),
  useCurrentAccountMock: vi.fn(),
  useCurrentWalletMock: vi.fn(),
  useWalletsMock: vi.fn(),
  useConnectWalletMock: vi.fn(),
  getSuiClientMock: vi.fn(),
  listOwnedKakeraMock: vi.fn(),
  getGalleryEntryMock: vi.fn(),
}));

vi.mock("@mysten/dapp-kit", () => ({
  ConnectModal: (props: { readonly trigger: React.ReactNode }) => {
    connectModalMock(props);
    return <>{props.trigger}</>;
  },
  useCurrentAccount: () => useCurrentAccountMock(),
  useCurrentWallet: () => useCurrentWalletMock(),
  useWallets: () => useWalletsMock(),
  useConnectWallet: () => useConnectWalletMock(),
}));

vi.mock("@mysten/enoki", () => ({
  isGoogleWallet: (wallet: { id?: string }) => wallet.id === "google-wallet",
}));

vi.mock("../../lib/sui", () => ({
  getSuiClient: getSuiClientMock,
  listOwnedKakera: listOwnedKakeraMock,
  getGalleryEntry: getGalleryEntryMock,
}));

import { GalleryClient } from "./gallery-client";

const CATALOG = [
  {
    unitId: "0xunit-1",
    slug: "demo-athlete-one",
    displayName: "Demo Athlete One",
    thumbnailUrl: "https://placehold.co/512x512/png?text=Athlete+1",
  },
] as const;
const WALRUS_AGGREGATOR = "https://aggregator.example.com";
const OPAQUE_MOSAIC_BLOB_ID = "Bm7qyNqV3RcP6td9XSk4LeF0aZuH5Wj8GxYp1sMn";

function ownedKakera(overrides: Partial<OwnedKakera> = {}): OwnedKakera {
  return {
    objectId: "0xkakera-1",
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
    displayName: "Demo Athlete One",
    walrusBlobId: "walrus-original-1",
    kakeraObjectId: "0xkakera-1",
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
    displayName: "Demo Athlete One",
    walrusBlobId: "walrus-original-1",
    kakeraObjectId: "0xkakera-1",
    submissionNo: 17,
    mintedAtMs: 1700000000000,
    masterId: "0xmaster-1",
    mosaicWalrusBlobId: OPAQUE_MOSAIC_BLOB_ID,
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
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR = WALRUS_AGGREGATOR;
  useCurrentAccountMock.mockReturnValue(null);
  useCurrentWalletMock.mockReturnValue({
    connectionStatus: "disconnected",
  });
  useWalletsMock.mockReturnValue([
    { id: "google-wallet" },
    { id: "sui-wallet" },
  ]);
  useConnectWalletMock.mockReturnValue({ mutateAsync: vi.fn() });
  getSuiClientMock.mockReturnValue({ network: "testnet" });
  listOwnedKakeraMock.mockResolvedValue([]);
  getGalleryEntryMock.mockResolvedValue(pendingEntry());
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_DEMO_MODE;
  delete process.env.NEXT_PUBLIC_E2E_STUB_WALLET;
  delete process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR;
  connectModalMock.mockReset();
  useCurrentAccountMock.mockReset();
  useCurrentWalletMock.mockReset();
  useWalletsMock.mockReset();
  useConnectWalletMock.mockReset();
  getSuiClientMock.mockReset();
  listOwnedKakeraMock.mockReset();
  getGalleryEntryMock.mockReset();
});

describe("GalleryClient", () => {
  it("renders the signed-out shell when no wallet is connected", () => {
    render(<GalleryClient catalog={CATALOG} packageId="0xpkg" />);

    expect(
      screen.getByText(
        /Connect Google zkLogin or Sui wallet to load your Kakera history./,
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Google zkLogin" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sui wallet" })).toBeTruthy();
    expect(listOwnedKakeraMock).not.toHaveBeenCalled();
  });

  it("keeps the signed-out Sui wallet modal controlled", async () => {
    render(<GalleryClient catalog={CATALOG} packageId="0xpkg" />);

    const initialProps = connectModalMock.mock.calls.at(-1)?.[0];
    expect(initialProps?.open).toBe(false);

    act(() => {
      initialProps?.onOpenChange(true);
    });

    await waitFor(() => {
      expect(connectModalMock.mock.calls.at(-1)?.[0]?.open).toBe(true);
    });
  });

  it("keeps the signed-out shell until an account becomes available", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    useConnectWalletMock.mockReturnValue({ mutateAsync });

    render(<GalleryClient catalog={CATALOG} packageId="0xpkg" />);

    fireEvent.click(screen.getByRole("button", { name: "Google zkLogin" }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        wallet: { id: "google-wallet" },
      });
    });

    expect(screen.queryByText(/^Loading$/i)).toBeNull();
    expect(listOwnedKakeraMock).not.toHaveBeenCalled();
  });

  it("starts Google login from the signed-out shell", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    useConnectWalletMock.mockReturnValue({ mutateAsync });

    render(<GalleryClient catalog={CATALOG} packageId="0xpkg" />);

    fireEvent.click(screen.getByRole("button", { name: "Google zkLogin" }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        wallet: { id: "google-wallet" },
      });
    });
  });

  it("shows a retry login action when wallet connection fails", async () => {
    useConnectWalletMock.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Login failed.")),
    });

    render(<GalleryClient catalog={CATALOG} packageId="0xpkg" />);

    fireEvent.click(screen.getByRole("button", { name: "Google zkLogin" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Login failed.",
    );
    expect(
      screen.getByRole("button", { name: "Retry Google zkLogin" }),
    ).toBeTruthy();
  });

  it("shows a connecting label while login is in progress", () => {
    useCurrentWalletMock.mockReturnValue({
      connectionStatus: "connecting",
    });

    render(<GalleryClient catalog={CATALOG} packageId="0xpkg" />);

    const button = screen.getByRole("button", {
      name: "Connecting Google zkLogin...",
    });

    expect(button.getAttribute("disabled")).not.toBeNull();
  });

  it("starts loading only after the account address becomes available", async () => {
    let resolveListOwnedKakera: ((value: OwnedKakera[]) => void) | undefined;
    listOwnedKakeraMock.mockImplementation(
      () =>
        new Promise<OwnedKakera[]>((resolve) => {
          resolveListOwnedKakera = resolve;
        }),
    );

    const { rerender } = render(
      <GalleryClient catalog={CATALOG} packageId="0xpkg" />,
    );

    expect(screen.queryByText(/^Loading$/i)).toBeNull();
    expect(listOwnedKakeraMock).not.toHaveBeenCalled();

    useCurrentAccountMock.mockReturnValue({ address: "0xviewer" });
    rerender(<GalleryClient catalog={CATALOG} packageId="0xpkg" />);

    await waitFor(() => {
      expect(screen.getByText(/^Loading$/i)).toBeTruthy();
    });

    expect(
      screen.getByText(/Login confirmed. Reading Kakera from Sui./),
    ).toBeTruthy();
    expect(listOwnedKakeraMock).toHaveBeenCalledWith({
      ownerAddress: "0xviewer",
      packageId: "0xpkg",
      suiClient: { network: "testnet" },
    });

    if (!resolveListOwnedKakera) {
      throw new Error("listOwnedKakera resolver was not set");
    }

    resolveListOwnedKakera([]);
  });

  it("renders demo entries without requiring a connected wallet", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "1";

    render(
      <GalleryClient
        catalog={CATALOG}
        demoEntries={[completedEntry()]}
        packageId="0xpkg"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Demo Athlete One")).toBeTruthy();
    });

    expect(screen.queryByText(/Wallet required/i)).toBeNull();
    expect(screen.getByText(/Placed at 12, 8/i)).toBeTruthy();
    expect(
      screen
        .getByAltText(/Demo Athlete One completed mosaic/i)
        .getAttribute("src"),
    ).toContain("placehold.co");
    expect(listOwnedKakeraMock).not.toHaveBeenCalled();
  });

  it("renders demo entries even when packageId is empty", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "1";

    render(
      <GalleryClient
        catalog={CATALOG}
        demoEntries={[pendingEntry()]}
        packageId=""
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Demo Athlete One")).toBeTruthy();
    });

    expect(screen.queryByText(/Unavailable/i)).toBeNull();
    expect(screen.getByText(/Waiting for reveal/i)).toBeTruthy();
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

    expect(screen.getByText("Empty")).toBeTruthy();
    expect(screen.getByText(/No Kakera found yet./)).toBeTruthy();
    expect(
      screen.getByText(/If you just submitted, wait a moment and check again./),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
  });

  it("loads owned Kakera with only the provided package id", async () => {
    useCurrentAccountMock.mockReturnValue({ address: "0xviewer" });
    listOwnedKakeraMock.mockResolvedValue([]);

    render(<GalleryClient catalog={CATALOG} packageId="0xoriginal-package" />);

    await waitFor(() => {
      expect(listOwnedKakeraMock).toHaveBeenCalledTimes(1);
    });

    expect(listOwnedKakeraMock).toHaveBeenCalledWith({
      ownerAddress: "0xviewer",
      packageId: "0xoriginal-package",
      suiClient: { network: "testnet" },
    });
    expect(
      listOwnedKakeraMock.mock.calls.map(([args]) => args.packageId),
    ).toEqual(["0xoriginal-package"]);
  });

  it("shows a fetch failure shell when Kakera loading fails", async () => {
    useCurrentAccountMock.mockReturnValue({ address: "0xviewer" });
    listOwnedKakeraMock.mockRejectedValue(new Error("rpc down"));

    render(<GalleryClient catalog={CATALOG} packageId="0xpkg" />);

    await waitFor(() => {
      expect(screen.getByText("Unavailable")).toBeTruthy();
    });

    expect(screen.getByText(/Could not load history./)).toBeTruthy();
    expect(screen.getByText(/Wait a moment and check again./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
  });

  it("shows a config-missing shell without a retry action", () => {
    useCurrentAccountMock.mockReturnValue({ address: "0xviewer" });

    render(<GalleryClient catalog={CATALOG} packageId="" />);

    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(
      screen.getByText(/Could not verify public configuration./),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /The Sui connection public configuration is incomplete, so the gallery cannot open./,
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Check again" })).toBeNull();
  });

  it("reloads the gallery when the user asks to check again", async () => {
    useCurrentAccountMock.mockReturnValue({ address: "0xviewer" });
    listOwnedKakeraMock.mockResolvedValue([]);

    render(<GalleryClient catalog={CATALOG} packageId="0xpkg" />);

    await waitFor(() => {
      expect(listOwnedKakeraMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));

    await waitFor(() => {
      expect(listOwnedKakeraMock).toHaveBeenCalledTimes(2);
    });
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
    expect(
      screen
        .getByAltText(/Demo Athlete One original submission/i)
        .getAttribute("src"),
    ).toBe(`${WALRUS_AGGREGATOR}/v1/blobs/walrus-original-1`);
    expect(
      screen.queryByRole("link", { name: /View position on Unit page/i }),
    ).toBeNull();
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
    ).toBe(`${WALRUS_AGGREGATOR}/v1/blobs/${OPAQUE_MOSAIC_BLOB_ID}`);
  });

  it("adds a unit-page CTA link to completed entries", async () => {
    useCurrentAccountMock.mockReturnValue({ address: "0xviewer" });
    listOwnedKakeraMock.mockResolvedValue([ownedKakera()]);
    getGalleryEntryMock.mockResolvedValue(completedEntry());

    render(<GalleryClient catalog={CATALOG} packageId="0xpkg" />);

    const unitLink = await screen.findByRole("link", {
      name: /View position on Unit page/i,
    });

    expect(unitLink.getAttribute("href")).toBe(
      "/units/0xunit-1?athleteName=Demo+Athlete+One",
    );
  });

  it("adds the finalized bootstrap query to the CTA only in stub E2E mode", async () => {
    process.env.NEXT_PUBLIC_E2E_STUB_WALLET = "1";
    useCurrentAccountMock.mockReturnValue({ address: "0xviewer" });
    listOwnedKakeraMock.mockResolvedValue([ownedKakera()]);
    getGalleryEntryMock.mockResolvedValue(completedEntry());

    render(<GalleryClient catalog={CATALOG} packageId="0xpkg" />);

    const unitLink = await screen.findByRole("link", {
      name: /View position on Unit page/i,
    });

    expect(unitLink.getAttribute("href")).toBe(
      "/units/0xunit-1?athleteName=Demo+Athlete+One&op_e2e_unit_progress=finalized",
    );
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
