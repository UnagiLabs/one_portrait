// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  useEnokiConfigStateMock,
  useSubmitPhotoMock,
  useWalletsMock,
  useCurrentAccountMock,
  useCurrentWalletMock,
  useConnectWalletMock,
  useDisconnectWalletMock,
} = vi.hoisted(() => ({
  useEnokiConfigStateMock: vi.fn(),
  useSubmitPhotoMock: vi.fn(),
  useWalletsMock: vi.fn(),
  useCurrentAccountMock: vi.fn(),
  useCurrentWalletMock: vi.fn(),
  useConnectWalletMock: vi.fn(),
  useDisconnectWalletMock: vi.fn(),
}));

vi.mock("../../../lib/enoki/provider", () => ({
  useEnokiConfigState: () => useEnokiConfigStateMock(),
}));

vi.mock("../../../lib/enoki/client-submit", () => ({
  EnokiSubmitClientError: class extends Error {
    code: string;
    status: number;

    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  useSubmitPhoto: () => useSubmitPhotoMock(),
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

const FILE_INPUT_LABEL = "写真を選択";

function makeFile(name = "photo.jpg", size = 1024): File {
  const blob = new Blob([new Uint8Array(size)], { type: "image/jpeg" });
  return new File([blob], name, { type: "image/jpeg" });
}

function setupSignedInEnv(): void {
  useEnokiConfigStateMock.mockReturnValue({
    submitEnabled: true,
    config: {},
  });
  useWalletsMock.mockReturnValue([{ id: "google-wallet" }]);
  useCurrentAccountMock.mockReturnValue({ address: "0xabc123" });
  useCurrentWalletMock.mockReturnValue({ connectionStatus: "connected" });
  useConnectWalletMock.mockReturnValue({ mutateAsync: vi.fn() });
  useDisconnectWalletMock.mockReturnValue({ mutate: vi.fn() });
  useSubmitPhotoMock.mockReturnValue({
    isSubmitting: false,
    submitPhoto: vi.fn(),
  });
}

afterEach(() => {
  useEnokiConfigStateMock.mockReset();
  useSubmitPhotoMock.mockReset();
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

    render(<ParticipationAccess unitId="0xunit-1" />);

    expect(screen.getByText(/進捗の確認だけ使えます/)).toBeTruthy();
  });

  it("shows the Google login button when the user is not signed in", () => {
    useEnokiConfigStateMock.mockReturnValue({
      submitEnabled: true,
      config: {},
    });
    useWalletsMock.mockReturnValue([{ id: "google-wallet" }]);
    useCurrentAccountMock.mockReturnValue(null);
    useCurrentWalletMock.mockReturnValue({
      connectionStatus: "disconnected",
    });
    useConnectWalletMock.mockReturnValue({ mutateAsync: vi.fn() });
    useDisconnectWalletMock.mockReturnValue({ mutate: vi.fn() });
    useSubmitPhotoMock.mockReturnValue({
      isSubmitting: false,
      submitPhoto: vi.fn(),
    });

    render(<ParticipationAccess unitId="0xunit-1" />);

    expect(
      screen.getByRole("button", { name: "Google でログイン" }),
    ).toBeTruthy();
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
    useDisconnectWalletMock.mockReturnValue({ mutate: vi.fn() });
    useSubmitPhotoMock.mockReturnValue({
      isSubmitting: false,
      submitPhoto: vi.fn(),
    });

    render(<ParticipationAccess unitId="0xunit-1" />);

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

  it("disables the file selector until the consent box is checked", () => {
    setupSignedInEnv();

    render(<ParticipationAccess unitId="0xunit-1" />);

    const fileInput = screen.getByLabelText(
      FILE_INPUT_LABEL,
    ) as HTMLInputElement;
    expect(fileInput.disabled).toBe(true);

    const consent = screen.getByRole("checkbox", {
      name: /同意/,
    }) as HTMLInputElement;
    expect(consent.checked).toBe(false);
    fireEvent.click(consent);
    expect(consent.checked).toBe(true);
    expect(fileInput.disabled).toBe(false);
  });

  it("calls preprocessPhoto with the chosen file and renders the preview URL", async () => {
    setupSignedInEnv();

    const preprocessPhoto = vi.fn().mockResolvedValue({
      blob: new Blob(["encoded"], { type: "image/jpeg" }),
      width: 1024,
      height: 768,
      contentType: "image/jpeg",
      sha256: "deadbeef",
      previewUrl: "blob:preview-abc",
    });

    render(
      <ParticipationAccess
        preprocessPhoto={preprocessPhoto}
        unitId="0xunit-1"
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /同意/ }));

    const file = makeFile();
    const fileInput = screen.getByLabelText(
      FILE_INPUT_LABEL,
    ) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(preprocessPhoto).toHaveBeenCalledTimes(1);
    });
    expect(preprocessPhoto.mock.calls[0][0]).toBe(file);

    await waitFor(() => {
      const preview = screen.getByAltText("投稿プレビュー") as HTMLImageElement;
      expect(preview.src).toContain("blob:preview-abc");
    });
  });

  it("shows a processing indicator while preprocessPhoto is pending", async () => {
    setupSignedInEnv();

    let resolvePreprocess: (value: unknown) => void = () => {};
    const preprocessPhoto = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePreprocess = resolve;
        }),
    );

    render(
      <ParticipationAccess
        preprocessPhoto={preprocessPhoto}
        unitId="0xunit-1"
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /同意/ }));

    fireEvent.change(screen.getByLabelText(FILE_INPUT_LABEL), {
      target: { files: [makeFile()] },
    });

    await waitFor(() => {
      expect(screen.getByText(/処理中/)).toBeTruthy();
    });

    resolvePreprocess({
      blob: new Blob(["encoded"], { type: "image/jpeg" }),
      width: 100,
      height: 100,
      contentType: "image/jpeg",
      sha256: "abc",
      previewUrl: "blob:preview-done",
    });

    await waitFor(() => {
      expect(screen.getByAltText("投稿プレビュー")).toBeTruthy();
    });
  });

  it("surfaces preprocessing errors as a UI message", async () => {
    setupSignedInEnv();

    const preprocessPhoto = vi
      .fn()
      .mockRejectedValue(
        new Error("写真のサイズが上限（10MB）を超えています。"),
      );

    render(
      <ParticipationAccess
        preprocessPhoto={preprocessPhoto}
        unitId="0xunit-1"
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /同意/ }));
    fireEvent.change(screen.getByLabelText(FILE_INPUT_LABEL), {
      target: { files: [makeFile("big.jpg", 11 * 1024 * 1024)] },
    });

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "写真のサイズが上限",
      );
    });
  });
});
