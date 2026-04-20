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

  describe("submission flow (Walrus PUT + Sponsored Tx)", () => {
    const SUBMIT_BUTTON_NAME = /投稿を確定/;

    type PreprocessedLike = {
      readonly blob: Blob;
      readonly width: number;
      readonly height: number;
      readonly contentType: "image/jpeg";
      readonly sha256: string;
      readonly previewUrl: string;
    };
    type PreprocessMock = (file: File) => Promise<PreprocessedLike>;
    type SubmitMock = (
      blobId: string,
    ) => Promise<{ readonly digest: string; readonly sender: string }>;
    type PutMock = (
      photo: PreprocessedLike,
      deps: {
        readonly env: {
          readonly NEXT_PUBLIC_WALRUS_PUBLISHER: string | undefined;
          readonly NEXT_PUBLIC_WALRUS_AGGREGATOR: string | undefined;
        };
      },
    ) => Promise<{ readonly blobId: string; readonly aggregatorUrl: string }>;

    function setupPreviewingEnv(): {
      readonly preprocessPhoto: ReturnType<typeof vi.fn<PreprocessMock>>;
      readonly submitPhoto: ReturnType<typeof vi.fn<SubmitMock>>;
    } {
      setupSignedInEnv();
      const preprocessPhoto = vi.fn<PreprocessMock>().mockResolvedValue({
        blob: new Blob(["encoded"], { type: "image/jpeg" }),
        width: 1024,
        height: 768,
        contentType: "image/jpeg",
        sha256: "deadbeef",
        previewUrl: "blob:preview-xyz",
      });
      const submitPhoto = vi.fn<SubmitMock>();
      useSubmitPhotoMock.mockReturnValue({
        isSubmitting: false,
        submitPhoto,
      });
      return { preprocessPhoto, submitPhoto };
    }

    async function advanceToPreview(
      preprocessPhoto: ReturnType<typeof vi.fn<PreprocessMock>>,
    ): Promise<void> {
      fireEvent.click(screen.getByRole("checkbox", { name: /同意/ }));
      fireEvent.change(screen.getByLabelText(FILE_INPUT_LABEL), {
        target: { files: [makeFile()] },
      });
      await waitFor(() => {
        expect(preprocessPhoto).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(screen.getByAltText("投稿プレビュー")).toBeTruthy();
      });
    }

    it("shows a submit button on the preview step", async () => {
      const { preprocessPhoto } = setupPreviewingEnv();
      const putBlob = vi.fn<PutMock>();

      render(
        <ParticipationAccess
          preprocessPhoto={preprocessPhoto}
          putBlob={putBlob}
          unitId="0xunit-1"
          walrusEnv={{
            NEXT_PUBLIC_WALRUS_PUBLISHER: "https://publisher.example.com",
            NEXT_PUBLIC_WALRUS_AGGREGATOR: "https://aggregator.example.com",
          }}
        />,
      );

      await advanceToPreview(preprocessPhoto);

      expect(
        screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }),
      ).toBeTruthy();
    });

    it("calls putBlob first, then submitPhoto with the returned blobId", async () => {
      const { preprocessPhoto, submitPhoto } = setupPreviewingEnv();
      const callOrder: string[] = [];
      const putBlob = vi.fn<PutMock>(async () => {
        callOrder.push("put");
        return {
          blobId: "walrus-blob-123",
          aggregatorUrl: "https://aggregator.example.com/v1/blobs/walrus-blob-123",
        };
      });
      submitPhoto.mockImplementation(async (_blobId: string) => {
        callOrder.push("submit");
        return { digest: "tx-digest", sender: "0xabc123" };
      });

      render(
        <ParticipationAccess
          preprocessPhoto={preprocessPhoto}
          putBlob={putBlob}
          unitId="0xunit-1"
          walrusEnv={{
            NEXT_PUBLIC_WALRUS_PUBLISHER: "https://publisher.example.com",
            NEXT_PUBLIC_WALRUS_AGGREGATOR: "https://aggregator.example.com",
          }}
        />,
      );

      await advanceToPreview(preprocessPhoto);

      fireEvent.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));

      await waitFor(() => {
        expect(submitPhoto).toHaveBeenCalledWith("walrus-blob-123");
      });

      expect(callOrder).toEqual(["put", "submit"]);
      expect(putBlob).toHaveBeenCalledTimes(1);
      const firstArg = putBlob.mock.calls[0][0];
      expect(firstArg.previewUrl).toBe("blob:preview-xyz");
    });

    it("does not call submitPhoto while putBlob is pending", async () => {
      const { preprocessPhoto, submitPhoto } = setupPreviewingEnv();
      let resolvePut: (value: {
        readonly blobId: string;
        readonly aggregatorUrl: string;
      }) => void = () => {};
      const putBlob = vi.fn<PutMock>(
        () =>
          new Promise((resolve) => {
            resolvePut = resolve;
          }),
      );

      render(
        <ParticipationAccess
          preprocessPhoto={preprocessPhoto}
          putBlob={putBlob}
          unitId="0xunit-1"
          walrusEnv={{
            NEXT_PUBLIC_WALRUS_PUBLISHER: "https://publisher.example.com",
            NEXT_PUBLIC_WALRUS_AGGREGATOR: "https://aggregator.example.com",
          }}
        />,
      );

      await advanceToPreview(preprocessPhoto);

      fireEvent.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));

      await waitFor(() => {
        expect(putBlob).toHaveBeenCalledTimes(1);
      });
      expect(submitPhoto).not.toHaveBeenCalled();

      resolvePut({
        blobId: "walrus-blob-789",
        aggregatorUrl: "https://aggregator.example.com/v1/blobs/walrus-blob-789",
      });

      await waitFor(() => {
        expect(submitPhoto).toHaveBeenCalledWith("walrus-blob-789");
      });
    });

    it("shows a Walrus failure message and skips submitPhoto when putBlob rejects with a final error", async () => {
      const { preprocessPhoto, submitPhoto } = setupPreviewingEnv();
      const { WalrusPutError } = await import("../../../lib/walrus/put");
      const putBlob = vi
        .fn<PutMock>()
        .mockRejectedValue(
          new WalrusPutError(
            "final",
            "Walrus への写真の保存に失敗しました。もう一度お試しください。",
          ),
        );

      render(
        <ParticipationAccess
          preprocessPhoto={preprocessPhoto}
          putBlob={putBlob}
          unitId="0xunit-1"
          walrusEnv={{
            NEXT_PUBLIC_WALRUS_PUBLISHER: "https://publisher.example.com",
            NEXT_PUBLIC_WALRUS_AGGREGATOR: "https://aggregator.example.com",
          }}
        />,
      );

      await advanceToPreview(preprocessPhoto);

      fireEvent.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));

      await waitFor(() => {
        expect(screen.getByRole("alert").textContent).toContain(
          "Walrus への写真の保存に失敗",
        );
      });
      expect(submitPhoto).not.toHaveBeenCalled();
    });

    it("disconnects and returns to the login step when submitPhoto fails with auth_expired", async () => {
      const { preprocessPhoto, submitPhoto } = setupPreviewingEnv();
      const disconnectMutate = vi.fn();
      useDisconnectWalletMock.mockReturnValue({ mutate: disconnectMutate });
      const { EnokiSubmitClientError } = await import(
        "../../../lib/enoki/client-submit"
      );
      const putBlob = vi.fn<PutMock>(async () => ({
        blobId: "walrus-blob-xyz",
        aggregatorUrl: "https://aggregator.example.com/v1/blobs/walrus-blob-xyz",
      }));
      submitPhoto.mockRejectedValue(
        new EnokiSubmitClientError(
          401,
          "auth_expired",
          "ログインが切れました。Google でもう一度ログインしてください。",
        ),
      );

      render(
        <ParticipationAccess
          preprocessPhoto={preprocessPhoto}
          putBlob={putBlob}
          unitId="0xunit-1"
          walrusEnv={{
            NEXT_PUBLIC_WALRUS_PUBLISHER: "https://publisher.example.com",
            NEXT_PUBLIC_WALRUS_AGGREGATOR: "https://aggregator.example.com",
          }}
        />,
      );

      await advanceToPreview(preprocessPhoto);

      fireEvent.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));

      await waitFor(() => {
        expect(disconnectMutate).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(screen.getByRole("alert").textContent).toContain(
          "ログインが切れました",
        );
      });
    });

    it("shows a completion message with the transaction digest on success", async () => {
      const { preprocessPhoto, submitPhoto } = setupPreviewingEnv();
      const putBlob = vi.fn<PutMock>(async () => ({
        blobId: "walrus-blob-ok",
        aggregatorUrl: "https://aggregator.example.com/v1/blobs/walrus-blob-ok",
      }));
      submitPhoto.mockResolvedValue({
        digest: "final-digest-XYZ",
        sender: "0xabc123",
      });

      render(
        <ParticipationAccess
          preprocessPhoto={preprocessPhoto}
          putBlob={putBlob}
          unitId="0xunit-1"
          walrusEnv={{
            NEXT_PUBLIC_WALRUS_PUBLISHER: "https://publisher.example.com",
            NEXT_PUBLIC_WALRUS_AGGREGATOR: "https://aggregator.example.com",
          }}
        />,
      );

      await advanceToPreview(preprocessPhoto);

      fireEvent.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));

      await waitFor(() => {
        expect(screen.getByText(/投稿が完了しました/)).toBeTruthy();
      });
      expect(screen.getByText(/final-digest-XYZ/)).toBeTruthy();
    });
  });
});
