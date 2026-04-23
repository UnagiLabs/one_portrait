// @vitest-environment happy-dom

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  connectModalMock,
  connectModalWalletSelectMock,
  useEnokiConfigStateMock,
  useWalletsMock,
  useCurrentAccountMock,
  useCurrentWalletMock,
  useConnectWalletMock,
  useDisconnectWalletMock,
} = vi.hoisted(() => ({
  connectModalMock: vi.fn(),
  connectModalWalletSelectMock: vi.fn(),
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
  ConnectModal: (props: {
    readonly onOpenChange?: (open: boolean) => void;
    readonly open?: boolean;
    readonly trigger: React.ReactNode;
    readonly walletFilter?: (wallet: { id?: string }) => boolean;
  }) => {
    connectModalMock(props);
    return (
      <>
        {props.trigger}
        {props.open ? (
          <div aria-label="Connect a Wallet" role="dialog">
            <button
              onClick={() => {
                connectModalWalletSelectMock();
              }}
              type="button"
            >
              ONE Portrait E2E Sui Stub
            </button>
          </div>
        ) : null}
      </>
    );
  },
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
  connectModalMock.mockReset();
  connectModalWalletSelectMock.mockReset();
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

  it("keeps the Sui wallet connect modal controlled", async () => {
    render(<GlobalWalletEntry />);

    fireEvent.click(screen.getByRole("button", { name: "ログイン" }));

    const initialProps = connectModalMock.mock.calls.at(-1)?.[0];
    expect(initialProps?.open).toBe(false);
    expect(initialProps?.walletFilter({ id: "google-wallet" })).toBe(false);
    expect(initialProps?.walletFilter({ id: "sui-wallet" })).toBe(true);

    act(() => {
      initialProps?.onOpenChange(true);
    });

    await waitFor(() => {
      expect(connectModalMock.mock.calls.at(-1)?.[0]?.open).toBe(true);
    });
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

  it("closes the login menu and keeps the Sui wallet modal open", () => {
    render(<GlobalWalletEntry />);

    fireEvent.click(screen.getByRole("button", { name: "ログイン" }));
    fireEvent.click(screen.getByRole("button", { name: "Sui wallet" }));

    expect(screen.queryByRole("button", { name: "Google zkLogin" })).toBeNull();
    expect(
      screen.getByRole("dialog", { name: "Connect a Wallet" }),
    ).toBeTruthy();
  });

  it("keeps the Sui wallet modal mounted through wallet selection pointer flow", () => {
    render(<GlobalWalletEntry />);

    fireEvent.click(screen.getByRole("button", { name: "ログイン" }));
    fireEvent.click(screen.getByRole("button", { name: "Sui wallet" }));

    const walletOption = screen.getByRole("button", {
      name: "ONE Portrait E2E Sui Stub",
    });

    fireEvent.mouseDown(walletOption);
    expect(
      screen.getByRole("dialog", { name: "Connect a Wallet" }),
    ).toBeTruthy();

    fireEvent.click(walletOption);

    expect(connectModalWalletSelectMock).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("dialog", { name: "Connect a Wallet" }),
    ).toBeTruthy();
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
