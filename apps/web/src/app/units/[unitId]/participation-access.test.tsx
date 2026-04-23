// @vitest-environment happy-dom

import { unitTileCount } from "@one-portrait/shared";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SubmittedEvent } from "../../../lib/sui";
import type { UseUnitEventsArgs } from "../../../lib/sui/react";

const {
  useEnokiConfigStateMock,
  useSubmitPhotoMock,
  useWalletsMock,
  useCurrentAccountMock,
  useCurrentWalletMock,
  useConnectWalletMock,
  useDisconnectWalletMock,
  useOwnedKakeraMock,
  getSuiClientMock,
  useUnitEventsMock,
  checkSubmissionExecutionMock,
} = vi.hoisted(() => ({
  useEnokiConfigStateMock: vi.fn(),
  useSubmitPhotoMock: vi.fn(),
  useWalletsMock: vi.fn(),
  useCurrentAccountMock: vi.fn(),
  useCurrentWalletMock: vi.fn(),
  useConnectWalletMock: vi.fn(),
  useDisconnectWalletMock: vi.fn(),
  useOwnedKakeraMock: vi.fn(),
  getSuiClientMock: vi.fn(),
  useUnitEventsMock: vi.fn(),
  checkSubmissionExecutionMock: vi.fn(),
}));

vi.mock("../../../lib/enoki/provider", () => ({
  useEnokiConfigState: () => useEnokiConfigStateMock(),
}));

vi.mock("../../../lib/enoki/client-submit", () => ({
  EnokiSubmitClientError: class extends Error {
    code: string;
    status: number;
    submissionStatus: "recovering" | "failed";
    recovery: {
      readonly digest: string;
      readonly sender: string;
      readonly blobId: string;
    } | null;

    constructor(
      status: number,
      code: string,
      message: string,
      options?: {
        readonly submissionStatus?: "recovering" | "failed";
        readonly recovery?: {
          readonly digest: string;
          readonly sender: string;
          readonly blobId: string;
        } | null;
      },
    ) {
      super(message);
      this.status = status;
      this.code = code;
      this.submissionStatus = options?.submissionStatus ?? "failed";
      this.recovery = options?.recovery ?? null;
    }
  },
  useSubmitPhoto: () => useSubmitPhotoMock(),
}));

vi.mock("@mysten/enoki", () => ({
  isGoogleWallet: (wallet: { id?: string }) => wallet.id === "google-wallet",
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

vi.mock("../../../lib/sui/react", () => ({
  useOwnedKakera: (args: unknown) => useOwnedKakeraMock(args),
  useUnitEvents: (args: UseUnitEventsArgs) => useUnitEventsMock(args),
}));

vi.mock("../../../lib/sui", () => ({
  getSuiClient: getSuiClientMock,
  checkSubmissionExecution: (args: unknown) =>
    checkSubmissionExecutionMock(args),
}));

import { LiveProgress } from "./live-progress";
import { ParticipationAccess } from "./participation-access";

const FILE_INPUT_LABEL = "写真を選択";

function makeFile(name = "photo.jpg", size = 1024): File {
  const blob = new Blob([new Uint8Array(size)], { type: "image/jpeg" });
  return new File([blob], name, { type: "image/jpeg" });
}

function setupSignedInEnv({
  accountAddress = "0xabc123",
  currentWalletId = "google-wallet",
}: {
  readonly accountAddress?: string;
  readonly currentWalletId?: string;
} = {}): void {
  useEnokiConfigStateMock.mockReturnValue({
    submitEnabled: true,
    config: {},
  });
  useWalletsMock.mockReturnValue([
    { id: "google-wallet" },
    { id: "sui-wallet" },
  ]);
  useCurrentAccountMock.mockReturnValue({ address: accountAddress });
  useCurrentWalletMock.mockReturnValue({
    connectionStatus: "connected",
    currentWallet: { id: currentWalletId },
  });
  useConnectWalletMock.mockReturnValue({ mutateAsync: vi.fn() });
  useDisconnectWalletMock.mockReturnValue({ mutate: vi.fn() });
  useSubmitPhotoMock.mockReturnValue({
    isSubmitting: false,
    submitPhoto: vi.fn(),
  });
  useOwnedKakeraMock.mockReturnValue({
    status: "idle",
    kakera: null,
  });
}

afterEach(() => {
  vi.useRealTimers();
  useEnokiConfigStateMock.mockReset();
  useSubmitPhotoMock.mockReset();
  useWalletsMock.mockReset();
  useCurrentAccountMock.mockReset();
  useCurrentWalletMock.mockReset();
  useConnectWalletMock.mockReset();
  useDisconnectWalletMock.mockReset();
  useOwnedKakeraMock.mockReset();
  getSuiClientMock.mockReset();
  useUnitEventsMock.mockReset();
  checkSubmissionExecutionMock.mockReset();
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

  it("uses the server-provided packageId for Kakera lookup", () => {
    setupSignedInEnv();

    render(
      <ParticipationAccess
        packageId="0xserver-pkg"
        unitId="0xunit-1"
      />,
    );

    expect(useOwnedKakeraMock).toHaveBeenCalledWith(
      expect.objectContaining({
        packageId: "0xserver-pkg",
      }),
    );
  });

  it("does not start Kakera RPC work when startup is disabled", () => {
    setupSignedInEnv();

    render(
      <ParticipationAccess
        packageId="0xserver-pkg"
        startupEnabled={false}
        unitId="0xunit-1"
      />,
    );

    expect(getSuiClientMock).not.toHaveBeenCalled();
  });

  it("shows both wallet choices when the user is not signed in", () => {
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
    });
    useConnectWalletMock.mockReturnValue({ mutateAsync: vi.fn() });
    useDisconnectWalletMock.mockReturnValue({ mutate: vi.fn() });
    useSubmitPhotoMock.mockReturnValue({
      isSubmitting: false,
      submitPhoto: vi.fn(),
    });

    render(<ParticipationAccess unitId="0xunit-1" />);

    expect(
      screen.getByText(
        /Google zkLogin または Sui wallet を接続すると、この待機室から投稿できます。/,
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Google zkLogin" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sui wallet" })).toBeTruthy();
  });

  it("allows a connected Sui wallet to continue into the submit form", () => {
    setupSignedInEnv({
      accountAddress: "0xsui123",
      currentWalletId: "sui-wallet",
    });

    render(<ParticipationAccess unitId="0xunit-1" />);

    expect(
      screen.getByText(/Sui wallet アドレスを確認できました/),
    ).toBeTruthy();
    expect(screen.getByLabelText(FILE_INPUT_LABEL)).toBeTruthy();
    expect(
      screen.queryByText(/履歴ギャラリーの確認だけ利用できます。/),
    ).toBeNull();
  });

  it("shows a retry message when login fails", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Google zkLogin" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Google login failed",
      );
    });
    expect(
      screen.getByRole("button", { name: "Google zkLogin をやり直す" }),
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
          aggregatorUrl:
            "https://aggregator.example.com/v1/blobs/walrus-blob-123",
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
        aggregatorUrl:
          "https://aggregator.example.com/v1/blobs/walrus-blob-789",
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

    it("offers a retry button after a Walrus final error that reuses the preprocessed photo", async () => {
      const { preprocessPhoto, submitPhoto } = setupPreviewingEnv();
      const { WalrusPutError } = await import("../../../lib/walrus/put");
      const putBlob = vi
        .fn<PutMock>()
        .mockRejectedValueOnce(
          new WalrusPutError(
            "final",
            "Walrus への写真の保存に失敗しました。もう一度お試しください。",
          ),
        )
        .mockResolvedValueOnce({
          blobId: "walrus-blob-retry",
          aggregatorUrl:
            "https://aggregator.example.com/v1/blobs/walrus-blob-retry",
        });
      submitPhoto.mockResolvedValue({
        digest: "retry-digest",
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
        expect(screen.getByRole("alert").textContent).toContain(
          "Walrus への写真の保存に失敗",
        );
      });

      const retryButton = screen.getByRole("button", {
        name: /もう一度送信する/,
      });
      expect(retryButton).toBeTruthy();

      // preprocessPhoto should not be called again: the previously preprocessed
      // photo is reused and we jump straight back to the Walrus upload step.
      const preprocessCallsBefore = preprocessPhoto.mock.calls.length;

      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(putBlob).toHaveBeenCalledTimes(2);
      });
      expect(preprocessPhoto.mock.calls.length).toBe(preprocessCallsBefore);

      // Retry should carry the same preprocessed photo that the first attempt
      // used (same previewUrl proves identity).
      expect(putBlob.mock.calls[1][0].previewUrl).toBe("blob:preview-xyz");

      await waitFor(() => {
        expect(submitPhoto).toHaveBeenCalledWith("walrus-blob-retry");
      });
      await waitFor(() => {
        expect(screen.getByText(/投稿が完了しました/)).toBeTruthy();
      });
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
        aggregatorUrl:
          "https://aggregator.example.com/v1/blobs/walrus-blob-xyz",
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
      expect(
        screen.getByText(/次は履歴ギャラリーで参加記録を確認できます。/),
      ).toBeTruthy();
      expect(
        screen
          .getByRole("link", { name: "履歴ギャラリーを見る" })
          .getAttribute("href"),
      ).toBe("/gallery");
    });

    it("keeps showing a recovery message while execution confirmation is still pending, then offers retry only after confirmed failure", async () => {
      const { preprocessPhoto, submitPhoto } = setupPreviewingEnv();
      const { EnokiSubmitClientError } = await import(
        "../../../lib/enoki/client-submit"
      );
      const putBlob = vi.fn<PutMock>(async () => ({
        blobId: "walrus-blob-recovery",
        aggregatorUrl:
          "https://aggregator.example.com/v1/blobs/walrus-blob-recovery",
      }));
      let resolveExecutionCheck: (value: {
        readonly status: "failed";
        readonly kakera: null;
      }) => void = () => {};
      checkSubmissionExecutionMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveExecutionCheck = resolve;
          }),
      );
      submitPhoto.mockRejectedValue(
        new EnokiSubmitClientError(503, "sponsor_failed", "execute failed", {
          submissionStatus: "recovering",
          recovery: {
            digest: "recover-digest",
            sender: "0xabc123",
            blobId: "walrus-blob-recovery",
          },
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
        expect(checkSubmissionExecutionMock).toHaveBeenCalledWith(
          expect.objectContaining({
            digest: "recover-digest",
            ownerAddress: "0xabc123",
            unitId: "0xunit-1",
            walrusBlobId: "walrus-blob-recovery",
          }),
        );
      });

      expect(
        screen.getByText(/投稿結果を確認しています。しばらくお待ちください。/),
      ).toBeTruthy();
      expect(
        screen.queryByRole("button", { name: /もう一度送信する/ }),
      ).toBeNull();

      resolveExecutionCheck({
        status: "failed",
        kakera: null,
      });

      await waitFor(() => {
        expect(screen.getByRole("alert").textContent).toContain(
          "投稿を完了できませんでした",
        );
      });
      expect(
        screen.getByRole("button", { name: /もう一度送信する/ }),
      ).toBeTruthy();
    });

    it("re-queries recovering execution and merges into the participation card once recovery succeeds", async () => {
      const { preprocessPhoto, submitPhoto } = setupPreviewingEnv();
      const { EnokiSubmitClientError } = await import(
        "../../../lib/enoki/client-submit"
      );
      const putBlob = vi.fn<PutMock>(async () => ({
        blobId: "walrus-blob-recovery",
        aggregatorUrl:
          "https://aggregator.example.com/v1/blobs/walrus-blob-recovery",
      }));
      checkSubmissionExecutionMock
        .mockResolvedValueOnce({
          status: "recovering",
          kakera: null,
        })
        .mockResolvedValueOnce({
          status: "success",
          kakera: null,
        });
      submitPhoto.mockRejectedValue(
        new EnokiSubmitClientError(503, "sponsor_failed", "execute failed", {
          submissionStatus: "recovering",
          recovery: {
            digest: "recover-digest",
            sender: "0xabc123",
            blobId: "walrus-blob-recovery",
          },
        }),
      );

      const view = render(
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
        expect(checkSubmissionExecutionMock).toHaveBeenCalledTimes(1);
      });
      expect(
        screen.queryByRole("button", { name: /もう一度送信する/ }),
      ).toBeNull();

      await waitFor(
        () => {
          expect(checkSubmissionExecutionMock).toHaveBeenCalledTimes(2);
        },
        { timeout: 3_000 },
      );

      await waitFor(() => {
        expect(screen.getByText(/投稿が完了しました/)).toBeTruthy();
      });
      expect(screen.getByText(/recover-digest/)).toBeTruthy();
      expect(useOwnedKakeraMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          ownerAddress: "0xabc123",
          walrusBlobId: "walrus-blob-recovery",
        }),
      );

      useCurrentAccountMock.mockReturnValue({ address: "0xother999" });
      view.rerender(
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

      expect(useOwnedKakeraMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          ownerAddress: "0xabc123",
          walrusBlobId: "walrus-blob-recovery",
        }),
      );
    });

    it("falls back to retry after the recovery poll budget is exhausted", async () => {
      const { preprocessPhoto, submitPhoto } = setupPreviewingEnv();
      const { EnokiSubmitClientError } = await import(
        "../../../lib/enoki/client-submit"
      );
      const putBlob = vi.fn<PutMock>(async () => ({
        blobId: "walrus-blob-recovery",
        aggregatorUrl:
          "https://aggregator.example.com/v1/blobs/walrus-blob-recovery",
      }));
      checkSubmissionExecutionMock.mockResolvedValue({
        status: "recovering",
        kakera: null,
      });
      submitPhoto.mockRejectedValue(
        new EnokiSubmitClientError(503, "sponsor_failed", "execute failed", {
          submissionStatus: "recovering",
          recovery: {
            digest: "recover-digest",
            sender: "0xabc123",
            blobId: "walrus-blob-recovery",
          },
        }),
      );

      render(
        <ParticipationAccess
          preprocessPhoto={preprocessPhoto}
          putBlob={putBlob}
          recoveryMaxAttempts={2}
          recoveryRetryIntervalMs={10}
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
        expect(checkSubmissionExecutionMock).toHaveBeenCalled();
      });

      await waitFor(
        () => {
          expect(checkSubmissionExecutionMock).toHaveBeenCalledTimes(2);
        },
        { timeout: 1_000 },
      );
      await waitFor(
        () => {
          expect(screen.getByRole("alert").textContent).toContain(
            "投稿結果を確認できませんでした",
          );
        },
        { timeout: 1_000 },
      );
      expect(
        screen.getByRole("button", { name: /もう一度送信する/ }),
      ).toBeTruthy();
    });

    it("renders the participation card with preview, sender, and a pending submission_no while Kakera is being confirmed", async () => {
      const { preprocessPhoto, submitPhoto } = setupPreviewingEnv();
      useOwnedKakeraMock.mockReturnValue({
        status: "searching",
        kakera: null,
      });
      const putBlob = vi.fn<PutMock>(async () => ({
        blobId: "walrus-blob-card",
        aggregatorUrl:
          "https://aggregator.example.com/v1/blobs/walrus-blob-card",
      }));
      submitPhoto.mockResolvedValue({
        digest: "digest-card",
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

      // 参加証 card shows the locally-preprocessed preview image.
      const previews = screen.getAllByAltText(
        "投稿プレビュー",
      ) as HTMLImageElement[];
      expect(previews.some((img) => img.src.includes("blob:preview-xyz"))).toBe(
        true,
      );

      // Sender address is visible (appears both in the login strip and
      // inside the participation card, so just assert at least one).
      expect(screen.getAllByText(/0xabc123/).length).toBeGreaterThan(0);

      // submission_no is still being confirmed: show a pending indicator.
      const submissionHeading = screen.getByText(/submission_no/i);
      const submissionValue = submissionHeading.nextElementSibling;
      expect(submissionValue?.textContent).toMatch(/確認中/);
      expect(
        screen.getByText(/Kakera.*確認しています|Kakera を確認しています/),
      ).toBeTruthy();
    });

    it("shows the Kakera submission_no once the hook reports 'found'", async () => {
      const { preprocessPhoto, submitPhoto } = setupPreviewingEnv();
      useOwnedKakeraMock.mockReturnValue({
        status: "found",
        kakera: {
          objectId: "0xkakera-7",
          unitId: "0xunit-1",
          walrusBlobId: "walrus-blob-card",
          submissionNo: 128,
        },
      });
      const putBlob = vi.fn<PutMock>(async () => ({
        blobId: "walrus-blob-card",
        aggregatorUrl:
          "https://aggregator.example.com/v1/blobs/walrus-blob-card",
      }));
      submitPhoto.mockResolvedValue({
        digest: "digest-card",
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
      await waitFor(() => {
        expect(screen.getByText(/#128/)).toBeTruthy();
      });
      expect(screen.getByText(/Kakera を受け取りました/)).toBeTruthy();
    });

    it("shows a timeout notice when the Kakera lookup hits its retry budget", async () => {
      const { preprocessPhoto, submitPhoto } = setupPreviewingEnv();
      useOwnedKakeraMock.mockReturnValue({
        status: "timeout",
        kakera: null,
      });
      const putBlob = vi.fn<PutMock>(async () => ({
        blobId: "walrus-blob-card",
        aggregatorUrl:
          "https://aggregator.example.com/v1/blobs/walrus-blob-card",
      }));
      submitPhoto.mockResolvedValue({
        digest: "digest-card",
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
      await waitFor(() => {
        expect(screen.getByText(/確認できませんでした/)).toBeTruthy();
      });
    });
  });

  /**
   * End-to-end waiting-room integration: renders both `ParticipationAccess`
   * and `LiveProgress` together, walks the user through a full submission,
   * and asserts the contract that:
   *   - After `submit_photo` succeeds the progress counter stays flat
   *     (no optimistic update).
   *   - Only a `SubmittedEvent` observation increments the counter.
   */
  describe("integration with LiveProgress (SubmittedEvent is source of truth)", () => {
    const SUBMIT_BUTTON_NAME = /投稿を確定/;

    it("keeps the counter flat after submit success, then increments on SubmittedEvent", async () => {
      setupSignedInEnv();

      let capturedOnSubmitted: ((event: SubmittedEvent) => void) | undefined;
      useUnitEventsMock.mockImplementation((args: UseUnitEventsArgs) => {
        capturedOnSubmitted = args.onSubmitted;
      });

      const preprocessPhoto = vi.fn().mockResolvedValue({
        blob: new Blob(["encoded"], { type: "image/jpeg" }),
        width: 1024,
        height: 768,
        contentType: "image/jpeg",
        sha256: "deadbeef",
        previewUrl: "blob:preview-integration",
      });
      const submitPhoto = vi.fn().mockResolvedValue({
        digest: "integration-digest",
        sender: "0xabc123",
      });
      useSubmitPhotoMock.mockReturnValue({
        isSubmitting: false,
        submitPhoto,
      });
      const putBlob = vi.fn().mockResolvedValue({
        blobId: "walrus-blob-int",
        aggregatorUrl:
          "https://aggregator.example.com/v1/blobs/walrus-blob-int",
      });

      render(
        <div>
          <LiveProgress
            initialSubmittedCount={41}
            maxSlots={unitTileCount}
            packageId="0xpkg"
            unitId="0xunit-1"
          />
          <ParticipationAccess
            preprocessPhoto={preprocessPhoto}
            putBlob={putBlob}
            unitId="0xunit-1"
            walrusEnv={{
              NEXT_PUBLIC_WALRUS_PUBLISHER: "https://publisher.example.com",
              NEXT_PUBLIC_WALRUS_AGGREGATOR: "https://aggregator.example.com",
            }}
          />
        </div>,
      );

      expect(
        screen.getByText(new RegExp(`41\\s*/\\s*${unitTileCount}`)),
      ).toBeTruthy();

      fireEvent.click(screen.getByRole("checkbox", { name: /同意/ }));
      fireEvent.change(screen.getByLabelText(FILE_INPUT_LABEL), {
        target: { files: [makeFile()] },
      });
      await waitFor(() => {
        expect(screen.getByAltText("投稿プレビュー")).toBeTruthy();
      });

      fireEvent.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));

      await waitFor(() => {
        expect(screen.getByText(/投稿が完了しました/)).toBeTruthy();
      });

      // Progress counter MUST still be at its initial value — no optimistic
      // increment is allowed. This is the STEP 6 contract.
      expect(
        screen.getByText(new RegExp(`41\\s*/\\s*${unitTileCount}`)),
      ).toBeTruthy();
      expect(
        screen.queryByText(new RegExp(`42\\s*/\\s*${unitTileCount}`)),
      ).toBeNull();

      // Deliver the SubmittedEvent through the captured hook and verify the
      // counter catches up.
      act(() => {
        capturedOnSubmitted?.({
          kind: "submitted",
          unitId: "0xunit-1",
          athletePublicId: "1",
          submitter: "0xabc123",
          walrusBlobId: [],
          submissionNo: 42,
          submittedCount: 42,
          maxSlots: unitTileCount,
        });
      });

      expect(
        screen.getByText(new RegExp(`42\\s*/\\s*${unitTileCount}`)),
      ).toBeTruthy();
    });
  });
});
