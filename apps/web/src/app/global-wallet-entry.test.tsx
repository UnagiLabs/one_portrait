// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useEnokiConfigStateMock,
  useWalletsMock,
  useCurrentAccountMock,
  useCurrentWalletMock,
  useConnectWalletMock,
  useDisconnectWalletMock,
} = vi.hoisted(() => ({
  useEnokiConfigStateMock: vi.fn(),
  useWalletsMock: vi.fn(),
  useCurrentAccountMock: vi.fn(),
  useCurrentWalletMock: vi.fn(),
  useConnectWalletMock: vi.fn(),
  useDisconnectWalletMock: vi.fn(),
}));

vi.mock("../lib/enoki/provider", () => ({
  useEnokiConfigState: () => useEnokiConfigStateMock(),
}));

vi.mock("@mysten/dapp-kit", () => ({
  ConnectModal: ({ trigger }: { readonly trigger: React.ReactNode }) => (
    <>{trigger}</>
  ),
  useWallets: () => useWalletsMock(),
  useCurrentAccount: () => useCurrentAccountMock(),
  useCurrentWallet: () => useCurrentWalletMock(),
  useConnectWallet: () => useConnectWalletMock(),
  useDisconnectWallet: () => useDisconnectWalletMock(),
}));

vi.mock("@mysten/enoki", () => ({
  isGoogleWallet: (wallet: { id?: string }) => wallet.id === "google-wallet",
}));

import { GlobalWalletEntry } from "./global-wallet-entry";

beforeEach(() => {
  useEnokiConfigStateMock.mockReturnValue({
    submitEnabled: true,
    config: {},
  });
  useWalletsMock.mockReturnValue([
    { id: "google-wallet" },
    { id: "sui-wallet" },
  ]);
  useCurrentAccountMock.mockReturnValue(null);
  useCurrentWalletMock.mockReturnValue({
    connectionStatus: "disconnected",
    currentWallet: null,
  });
  useConnectWalletMock.mockReturnValue({ mutateAsync: vi.fn() });
  useDisconnectWalletMock.mockReturnValue({ mutate: vi.fn() });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

afterEach(() => {
  useEnokiConfigStateMock.mockReset();
  useWalletsMock.mockReset();
  useCurrentAccountMock.mockReset();
  useCurrentWalletMock.mockReset();
  useConnectWalletMock.mockReset();
  useDisconnectWalletMock.mockReset();
});

describe("GlobalWalletEntry", () => {
  it("renders a disabled placeholder when submit config is unavailable", () => {
    useEnokiConfigStateMock.mockReturnValue({
      submitEnabled: false,
      reason: "submit-env-missing",
    });

    render(<GlobalWalletEntry />);

    const button = screen.getByRole("button", { name: "ログイン準備中" });
    expect(button.getAttribute("disabled")).not.toBeNull();
  });

  it("shows Google zkLogin and Sui wallet choices from the login menu", () => {
    render(<GlobalWalletEntry />);

    fireEvent.click(screen.getByRole("button", { name: "ログイン" }));

    expect(screen.getByRole("button", { name: "Google zkLogin" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sui wallet" })).toBeTruthy();
  });

  it("starts Google login from the shared menu", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    useConnectWalletMock.mockReturnValue({ mutateAsync });

    render(<GlobalWalletEntry />);

    fireEvent.click(screen.getByRole("button", { name: "ログイン" }));
    fireEvent.click(screen.getByRole("button", { name: "Google zkLogin" }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        wallet: { id: "google-wallet" },
      });
    });
  });

  it("shows copy, explorer, and disconnect actions after connection", async () => {
    const disconnectMutate = vi.fn();
    useCurrentAccountMock.mockReturnValue({ address: "0x1234567890abcdef" });
    useCurrentWalletMock.mockReturnValue({
      connectionStatus: "connected",
      currentWallet: { id: "sui-wallet" },
    });
    useDisconnectWalletMock.mockReturnValue({ mutate: disconnectMutate });

    render(<GlobalWalletEntry />);

    fireEvent.click(screen.getByRole("button", { name: /0x1234/i }));

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "0x1234567890abcdef",
      );
    });

    expect(
      screen.getByRole("link", { name: "Explorer" }).getAttribute("href"),
    ).toBe("https://suiexplorer.com/address/0x1234567890abcdef");

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(disconnectMutate).toHaveBeenCalled();
  });
});
