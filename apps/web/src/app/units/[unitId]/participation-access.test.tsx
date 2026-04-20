// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

vi.mock("../../../lib/enoki/provider", () => ({
  useEnokiConfigState: () => useEnokiConfigStateMock(),
}));

vi.mock("@mysten/enoki", () => ({
  isGoogleWallet: (wallet: { id?: string }) => wallet.id === "google-wallet",
}));

vi.mock("@mysten/dapp-kit", () => ({
  useWallets: () => useWalletsMock(),
  useCurrentAccount: () => useCurrentAccountMock(),
  useCurrentWallet: () => useCurrentWalletMock(),
  useConnectWallet: () => useConnectWalletMock(),
  useDisconnectWallet: () => useDisconnectWalletMock(),
}));

import { ParticipationAccess } from "./participation-access";

afterEach(() => {
  useEnokiConfigStateMock.mockReset();
  useWalletsMock.mockReset();
  useCurrentAccountMock.mockReset();
  useCurrentWalletMock.mockReset();
  useConnectWalletMock.mockReset();
  useDisconnectWalletMock.mockReset();
});

describe("ParticipationAccess", () => {
  it("shows a read-only message when submit env is not configured", () => {
    useEnokiConfigStateMock.mockReturnValue({
      submitEnabled: false,
      reason: "submit-env-missing",
    });

    render(<ParticipationAccess />);

    expect(screen.getByText(/進捗の確認だけ使えます/)).toBeTruthy();
  });

  it("shows the zkLogin address after login", () => {
    const disconnectMutate = vi.fn();
    useEnokiConfigStateMock.mockReturnValue({
      submitEnabled: true,
      config: {},
    });
    useWalletsMock.mockReturnValue([{ id: "google-wallet" }]);
    useCurrentAccountMock.mockReturnValue({
      address: "0xabc123",
    });
    useCurrentWalletMock.mockReturnValue({
      connectionStatus: "connected",
    });
    useConnectWalletMock.mockReturnValue({
      mutateAsync: vi.fn(),
    });
    useDisconnectWalletMock.mockReturnValue({
      mutate: disconnectMutate,
    });

    render(<ParticipationAccess />);

    expect(screen.getByText("0xabc123")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ログイン解除" }));
    expect(disconnectMutate).toHaveBeenCalled();
  });

  it("shows a retry message when login fails", async () => {
    useEnokiConfigStateMock.mockReturnValue({
      submitEnabled: true,
      config: {},
    });
    useWalletsMock.mockReturnValue([{ id: "google-wallet" }]);
    useCurrentAccountMock.mockReturnValue(null);
    useCurrentWalletMock.mockReturnValue({
      connectionStatus: "disconnected",
    });
    useConnectWalletMock.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Google login failed")),
    });
    useDisconnectWalletMock.mockReturnValue({
      mutate: vi.fn(),
    });

    render(<ParticipationAccess />);

    fireEvent.click(screen.getByRole("button", { name: "Google でログイン" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Google login failed",
      );
    });
    expect(
      screen.getByRole("button", { name: "もう一度ログイン" }),
    ).toBeTruthy();
  });
});
