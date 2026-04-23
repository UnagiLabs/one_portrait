"use client";

import {
  useConnectWallet,
  useCurrentAccount,
  useCurrentWallet,
  useDisconnectWallet,
  useWallets,
} from "@mysten/dapp-kit";
import { isGoogleWallet } from "@mysten/enoki";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  EnokiSubmitClientError,
  type SubmitPhotoRecoveryContext,
  type SubmitPhotoSuccess,
  useSubmitPhoto,
} from "../../../lib/enoki/client-submit";
import { useEnokiConfigState } from "../../../lib/enoki/provider";
import {
  preprocessPhoto as defaultPreprocessPhoto,
  type PreprocessedPhoto,
} from "../../../lib/image/preprocess";
import {
  checkSubmissionExecution,
  getSuiClient,
  type KakeraOwnedClient,
} from "../../../lib/sui";
import { useOwnedKakera } from "../../../lib/sui/react";
import {
  putBlobToWalrus as defaultPutBlobToWalrus,
  type WalrusEnv,
  WalrusPutError,
  type WalrusPutResult,
} from "../../../lib/walrus/put";
import { SuiWalletConnectModal } from "../../sui-wallet-connect-modal";

/**
 * Waiting-room submission access.
 *
 * Phase 2 / STEP 4 scope: the UI walks the participant through the full
 * submission line:
 *
 *   idle (not signed in)
 *     -> ready (signed in; consent + file picker)
 *     -> processing (client-side preprocess in flight)
 *     -> previewing (preprocessed blob rendered)
 *     -> uploading (Walrus PUT in flight)
 *     -> submitting (Sponsored Tx `submit_photo` in flight)
 *     -> done (digest displayed)
 *     -> error (any of the above branches surface a UI message)
 *
 * `putBlobToWalrus` and `useSubmitPhoto` are both injected through props so the
 * test harness can drive the orchestration directly. The `moveCallTargets`
 * constraint (see `CLAUDE.md`: only `PACKAGE_ID::accessors::submit_photo`) is
 * enforced server-side inside `useSubmitPhoto`; we do not re-thread it here.
 *
 * Consent wording follows `docs/spec.md` §3.5 (Kakera is a Soulbound NFT) and
 * §3.7 (the original image becomes retrievable by anyone who knows the
 * Walrus `blob_id`).
 */

type PreprocessPhotoFn = (file: File) => Promise<PreprocessedPhoto>;
type PutBlobFn = (
  photo: PreprocessedPhoto,
  deps: { readonly env: WalrusEnv },
) => Promise<WalrusPutResult>;

/**
 * Recoverable error context.
 *
 * `retry.kind === "upload"` means the Walrus PUT failed after our internal
 * retries were exhausted, but the locally preprocessed photo is still valid.
 * The UI can offer a "もう一度送信する" button that jumps straight back to
 * the uploading phase with the same {@link PreprocessedPhoto}, skipping
 * preprocessing.
 */
type RetryContext = {
  readonly kind: "upload" | "submit";
  readonly photo: PreprocessedPhoto;
};

type UploadPhase =
  | { readonly kind: "ready" }
  | { readonly kind: "processing" }
  | { readonly kind: "previewing"; readonly photo: PreprocessedPhoto }
  | { readonly kind: "uploading"; readonly photo: PreprocessedPhoto }
  | {
      readonly kind: "submitting";
      readonly photo: PreprocessedPhoto;
      readonly blobId: string;
    }
  | {
      readonly kind: "recovering";
      readonly photo: PreprocessedPhoto;
      readonly recovery: SubmitPhotoRecoveryContext;
    }
  | {
      readonly kind: "done";
      readonly result: SubmitPhotoSuccess;
      readonly photo: PreprocessedPhoto;
      readonly blobId: string;
    }
  | {
      readonly kind: "error";
      readonly message: string;
      readonly retry?: RetryContext;
    };

export function ParticipationAccess({
  unitId,
  preprocessPhoto,
  putBlob,
  recoveryMaxAttempts,
  recoveryRetryIntervalMs,
  packageId,
  startupEnabled = true,
  walrusEnv,
}: {
  readonly unitId: string;
  readonly preprocessPhoto?: PreprocessPhotoFn;
  readonly putBlob?: PutBlobFn;
  readonly recoveryMaxAttempts?: number;
  readonly recoveryRetryIntervalMs?: number;
  readonly packageId?: string | null;
  readonly startupEnabled?: boolean;
  readonly walrusEnv?: WalrusEnv;
}): React.ReactElement {
  const state = useEnokiConfigState();

  if (!state.submitEnabled) {
    return (
      <section className="grid gap-3 border border-[var(--rule)] bg-[rgba(245,239,227,0.03)] p-5">
        <p className="op-eyebrow">
          <span className="bar" />
          <span>Submit access</span>
        </p>
        <p className="text-sm text-[var(--ink-dim)]">
          投稿ログインは未設定です。今は進捗の確認だけ使えます。
        </p>
      </section>
    );
  }

  return (
    <ParticipationAccessEnabled
      preprocessPhoto={preprocessPhoto ?? defaultPreprocessPhoto}
      putBlob={putBlob ?? defaultPutBlobToWalrus}
      recoveryMaxAttempts={recoveryMaxAttempts ?? RECOVERY_MAX_ATTEMPTS}
      recoveryRetryIntervalMs={
        recoveryRetryIntervalMs ?? RECOVERY_RETRY_INTERVAL_MS
      }
      packageId={packageId ?? ""}
      startupEnabled={startupEnabled}
      unitId={unitId}
      walrusEnv={walrusEnv ?? EMPTY_WALRUS_ENV}
    />
  );
}

function ParticipationAccessEnabled({
  unitId,
  preprocessPhoto,
  putBlob,
  recoveryMaxAttempts,
  recoveryRetryIntervalMs,
  packageId,
  startupEnabled,
  walrusEnv,
}: {
  readonly unitId: string;
  readonly preprocessPhoto: PreprocessPhotoFn;
  readonly putBlob: PutBlobFn;
  readonly recoveryMaxAttempts: number;
  readonly recoveryRetryIntervalMs: number;
  readonly packageId: string;
  readonly startupEnabled: boolean;
  readonly walrusEnv: WalrusEnv;
}): React.ReactElement {
  const wallets = useWallets();
  const currentAccount = useCurrentAccount();
  const currentWallet = useCurrentWallet();
  const connectWallet = useConnectWallet();
  const disconnectWallet = useDisconnectWallet();
  const { submitPhoto } = useSubmitPhoto(unitId);

  const [connectError, setConnectError] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>({ kind: "ready" });

  // Tracks every object URL we have handed out so we can reliably
  // `URL.revokeObjectURL` it when the user picks a different file or the
  // component unmounts. Without this, re-selecting a photo (or sitting on a
  // long-running session) leaks the encoded JPEG Blob inside the browser.
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const registerPreviewUrl = (url: string): void => {
    previewUrlsRef.current.add(url);
  };
  const revokePreviewUrls = (): void => {
    const set = previewUrlsRef.current;
    for (const url of Array.from(set)) {
      if (
        typeof URL !== "undefined" &&
        typeof URL.revokeObjectURL === "function"
      ) {
        URL.revokeObjectURL(url);
      }
      set.delete(url);
    }
  };

  // Final cleanup on unmount so the page-level navigation away from the
  // waiting room does not leave preview blobs pinned. The cleanup reads
  // the ref directly so it has no external dependencies — React hooks
  // lint is satisfied with an empty dep list.
  useEffect(() => {
    const set = previewUrlsRef.current;
    return () => {
      for (const url of Array.from(set)) {
        if (
          typeof URL !== "undefined" &&
          typeof URL.revokeObjectURL === "function"
        ) {
          URL.revokeObjectURL(url);
        }
        set.delete(url);
      }
    };
  }, []);

  const googleWallet = wallets.find(isGoogleWallet) ?? null;
  const isConnecting = currentWallet.connectionStatus === "connecting";
  const connectedWallet =
    currentWallet.currentWallet ?? (currentAccount ? googleWallet : null);
  const isGoogleConnected =
    connectedWallet !== null && isGoogleWallet(connectedWallet);

  // Kakera polling kicks in only once we know the Walrus blob id and the
  // zkLogin address. The hook stays idle while any of the inputs are
  // missing (`ownerAddress: null` branch inside `useOwnedKakera`).
  const doneBlobId = phase.kind === "done" ? phase.blobId : "";
  const suiClient = startupEnabled ? getSuiClient() : EMPTY_KAKERA_CLIENT;
  const ownedKakera = useOwnedKakera({
    suiClient,
    ownerAddress:
      startupEnabled && phase.kind === "done" ? phase.result.sender : null,
    unitId,
    walrusBlobId: doneBlobId,
    packageId: packageId ?? "",
  });

  async function handleLogin(): Promise<void> {
    if (!googleWallet) {
      setConnectError("Google ログインの設定が見つかりません。");
      return;
    }

    setConnectError(null);

    try {
      await connectWallet.mutateAsync({ wallet: googleWallet });
    } catch (error) {
      setConnectError(toMessage(error));
    }
  }

  async function handleFileChange(file: File): Promise<void> {
    // Revoke any preview from an earlier attempt before kicking off a new
    // preprocess run — the old Blob/object URL is no longer referenced by
    // the UI once we enter "processing".
    revokePreviewUrls();
    setPhase({ kind: "processing" });

    try {
      const photo = await preprocessPhoto(file);
      registerPreviewUrl(photo.previewUrl);
      setPhase({ kind: "previewing", photo });
    } catch (error) {
      setPhase({ kind: "error", message: toMessage(error) });
    }
  }

  async function handleSubmit(photo: PreprocessedPhoto): Promise<void> {
    setPhase({ kind: "uploading", photo });

    let putResult: WalrusPutResult;
    try {
      putResult = await putBlob(photo, { env: walrusEnv });
    } catch (error) {
      setPhase({
        kind: "error",
        message: classifyWalrusError(error),
        // Keep the preprocessed photo so the "もう一度送信する" button can
        // retry the Walrus PUT without re-running preprocessing.
        retry: isWalrusRetryable(error) ? { kind: "upload", photo } : undefined,
      });
      return;
    }

    setPhase({ kind: "submitting", photo, blobId: putResult.blobId });

    try {
      const result = await submitPhoto(putResult.blobId);
      setPhase({
        kind: "done",
        result,
        photo,
        blobId: putResult.blobId,
      });
    } catch (error) {
      if (isAuthExpired(error)) {
        // 認証切れは再ログイン導線へ戻す。wallet を切断して
        // <Google でログイン> ボタンが再表示される状態にする。
        disconnectWallet.mutate();
        setConnectError(toMessage(error));
        setPhase({ kind: "ready" });
        return;
      }

      if (isSubmitRecovering(error)) {
        setPhase({
          kind: "recovering",
          photo,
          recovery: error.recovery,
        });
        return;
      }

      setPhase({ kind: "error", message: toSubmitErrorMessage(error) });
    }
  }

  useEffect(() => {
    if (!startupEnabled || phase.kind !== "recovering") {
      return;
    }

    let cancelled = false;
    let pending: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const verifyExecution = async (): Promise<void> => {
      attempts += 1;
      let result: Awaited<ReturnType<typeof checkSubmissionExecution>>;
      try {
        result = await checkSubmissionExecution({
          suiClient: getSuiClient(),
          digest: phase.recovery.digest,
          ownerAddress: phase.recovery.sender,
          unitId,
          walrusBlobId: phase.recovery.blobId,
          packageId: packageId ?? "",
        });
      } catch {
        result = { status: "recovering", kakera: null } as const;
      }

      if (cancelled) {
        return;
      }

      if (result.status === "success") {
        setPhase({
          kind: "done",
          result: {
            digest: phase.recovery.digest,
            sender: phase.recovery.sender,
          },
          photo: phase.photo,
          blobId: phase.recovery.blobId,
        });
        return;
      }

      if (result.status === "failed") {
        setPhase({
          kind: "error",
          message: "投稿を完了できませんでした。もう一度送信してください。",
          retry: { kind: "submit", photo: phase.photo },
        });
        return;
      }

      if (attempts >= recoveryMaxAttempts) {
        setPhase({
          kind: "error",
          message: "投稿結果を確認できませんでした。もう一度送信してください。",
          retry: { kind: "submit", photo: phase.photo },
        });
        return;
      }

      pending = setTimeout(() => {
        pending = null;
        void verifyExecution();
      }, recoveryRetryIntervalMs);
    };

    void verifyExecution();

    return () => {
      cancelled = true;
      if (pending !== null) {
        clearTimeout(pending);
      }
    };
  }, [
    packageId,
    phase,
    recoveryMaxAttempts,
    recoveryRetryIntervalMs,
    startupEnabled,
    unitId,
  ]);

  const isProcessing = phase.kind === "processing";
  const isUploading = phase.kind === "uploading";
  const isSubmitting = phase.kind === "submitting";
  const isRecovering = phase.kind === "recovering";
  const isDone = phase.kind === "done";
  // Submission is one-shot: once the on-chain `submit_photo` lands, the Move
  // side rejects any further attempt from the same sender, but the UI must
  // also stop offering an input that would let the user overwrite the
  // participation card with an error state. Gate every interactive control
  // on `isDone` so the success card is the terminal view for this unit.
  const fileInputDisabled =
    !consented ||
    isProcessing ||
    isUploading ||
    isSubmitting ||
    isRecovering ||
    isDone;
  const previewPhoto =
    phase.kind === "previewing" ||
    phase.kind === "uploading" ||
    phase.kind === "submitting" ||
    phase.kind === "recovering"
      ? phase.photo
      : null;
  const submitButtonDisabled = isUploading || isSubmitting || isRecovering;
  const showSubmitButton =
    phase.kind === "previewing" ||
    phase.kind === "uploading" ||
    phase.kind === "submitting";
  const showConsentAndFilePicker = !isDone && !isRecovering;
  const phaseErrorMessage = phase.kind === "error" ? phase.message : null;
  const phaseRetry = phase.kind === "error" ? (phase.retry ?? null) : null;
  const donePhase = phase.kind === "done" ? phase : null;
  const connectedWalletLabel = isGoogleConnected ? "zkLogin" : "Sui wallet";
  const connectedWalletMessage = isGoogleConnected
    ? "zkLogin アドレスを確認できました。投稿の署名に使うのはこの住所です。"
    : "Sui wallet アドレスを確認できました。Sponsored Tx の署名に使うのはこの住所です。";

  return (
    <section className="grid gap-4 border border-[var(--rule)] bg-[rgba(245,239,227,0.03)] p-5">
      <div className="grid gap-2">
        <p className="op-eyebrow">
          <span className="bar" />
          <span>Submit access</span>
        </p>
        <h2 className="font-display text-[24px] leading-[0.95] tracking-[-0.01em] text-[var(--ink)]">
          Participation wallet
        </h2>
      </div>

      {currentAccount ? (
        <>
          <p className="text-sm text-[var(--ink-dim)]">
            {connectedWalletMessage}
          </p>
          <p className="font-mono-op text-[11px] break-all text-[var(--ember)]">
            {currentAccount.address}
          </p>

          {showConsentAndFilePicker ? (
            <>
              <label className="flex items-start gap-2 text-sm text-[var(--ink-dim)]">
                <input
                  checked={consented}
                  className="mt-1 accent-[var(--ember)]"
                  onChange={(event) => {
                    setConsented(event.target.checked);
                  }}
                  type="checkbox"
                />
                <span>
                  投稿した原画像は Walrus に保存され、blob_id
                  を知る人は誰でも取得できます。 また、参加の証として
                  Soulbound（譲渡不可）の Kakera NFT
                  が自分のウォレットに発行されることに同意します。
                </span>
              </label>

              <label className="grid gap-2 font-mono-op text-[11px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                <span>写真を選択</span>
                <input
                  accept="image/*"
                  className="op-file-input block w-full font-mono-op text-[11px] text-[var(--ink)]"
                  disabled={fileInputDisabled}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleFileChange(file);
                    }
                  }}
                  type="file"
                />
              </label>
            </>
          ) : null}

          {isProcessing ? (
            <p
              className="font-mono-op text-[11px] uppercase tracking-[0.14em] text-[var(--ink-dim)]"
              role="status"
            >
              処理中…
            </p>
          ) : null}

          {previewPhoto ? (
            // biome-ignore lint: client-side object URL preview, next/image not applicable.
            <img
              alt="投稿プレビュー"
              className="max-w-full border border-[var(--rule-strong)]"
              src={previewPhoto.previewUrl}
            />
          ) : null}

          {isUploading ? (
            <p
              className="font-mono-op text-[11px] uppercase tracking-[0.14em] text-[var(--ember)]"
              role="status"
            >
              Walrus に保存しています…
            </p>
          ) : null}

          {isSubmitting ? (
            <p
              className="font-mono-op text-[11px] uppercase tracking-[0.14em] text-[var(--ember)]"
              role="status"
            >
              オンチェーンに投稿しています…
            </p>
          ) : null}

          {isRecovering ? (
            <p
              className="font-mono-op text-[11px] uppercase tracking-[0.14em] text-[var(--ink-dim)]"
              role="status"
            >
              投稿結果を確認しています。しばらくお待ちください。
            </p>
          ) : null}

          {showSubmitButton ? (
            <div className="flex flex-wrap gap-3">
              <button
                className="op-btn-primary"
                disabled={submitButtonDisabled}
                onClick={() => {
                  if (phase.kind === "previewing") {
                    void handleSubmit(phase.photo);
                  }
                }}
                type="button"
              >
                投稿を確定
              </button>
            </div>
          ) : null}

          {donePhase ? (
            <div
              className="grid gap-3 border border-[rgba(20,184,138,0.35)] bg-[rgba(20,184,138,0.08)] px-4 py-4 text-sm text-[var(--ink)]"
              role="status"
            >
              <p className="font-display text-[20px] tracking-[0.02em] text-[var(--ok)]">
                投稿が完了しました。
              </p>
              <p className="text-sm text-[var(--ink-dim)]">
                次は履歴ギャラリーで参加記録を確認できます。
              </p>

              {/* biome-ignore lint: local object URL preview, next/image N/A. */}
              <img
                alt="投稿プレビュー"
                className="max-w-full border border-[var(--rule-strong)]"
                src={donePhase.photo.previewUrl}
              />

              <dl className="grid gap-3">
                <div className="grid gap-0.5">
                  <dt className="font-mono-op text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                    送信アドレス
                  </dt>
                  <dd className="font-mono-op text-[11px] break-all text-[var(--ember)]">
                    {donePhase.result.sender}
                  </dd>
                </div>

                <div className="grid gap-0.5">
                  <dt className="font-mono-op text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                    submission_no
                  </dt>
                  <dd className="font-display text-[22px] tracking-[0.02em]">
                    {ownedKakera.kakera
                      ? `#${ownedKakera.kakera.submissionNo}`
                      : "確認中…"}
                  </dd>
                </div>

                <div className="grid gap-0.5">
                  <dt className="font-mono-op text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                    digest
                  </dt>
                  <dd className="font-mono-op text-[11px] break-all text-[var(--sui)]">
                    {donePhase.result.digest}
                  </dd>
                </div>
              </dl>

              <p
                aria-live="polite"
                className="font-mono-op text-[11px] uppercase tracking-[0.14em] text-[var(--ok)]"
              >
                {describeKakeraStatus(ownedKakera.status)}
              </p>

              <div className="flex flex-wrap gap-3">
                <Link className="op-btn-primary" href="/gallery">
                  履歴ギャラリーを見る
                </Link>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              className="op-btn-outline"
              onClick={() => disconnectWallet.mutate()}
              type="button"
            >
              {connectedWalletLabel} を解除する
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-[var(--ink-dim)]">
            Google zkLogin または Sui wallet
            を接続すると、この待機室から投稿できます。
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className="op-btn-primary"
              disabled={isConnecting}
              onClick={() => {
                void handleLogin();
              }}
              type="button"
            >
              {isConnecting
                ? "Google zkLogin 接続中…"
                : connectError
                  ? "Google zkLogin をやり直す"
                  : "Google zkLogin"}
            </button>
            <SuiWalletConnectModal
              trigger={
                <button className="op-btn-ghost" type="button">
                  Sui wallet
                </button>
              }
            />
          </div>
        </>
      )}

      {connectError ? (
        <p
          aria-live="polite"
          className="op-alert-warn font-mono-op text-[11px] tracking-[0.08em]"
          role="alert"
        >
          {connectError}
        </p>
      ) : null}

      {phaseErrorMessage ? (
        <p
          aria-live="polite"
          className="op-alert-warn font-mono-op text-[11px] tracking-[0.08em]"
          role="alert"
        >
          {phaseErrorMessage}
        </p>
      ) : null}

      {phaseRetry ? (
        <div className="flex flex-wrap gap-3">
          <button
            className="op-btn-primary"
            onClick={() => {
              // Jump straight back into the Walrus upload step with the same
              // PreprocessedPhoto; the user does not have to re-select or
              // re-preprocess the image.
              void handleSubmit(phaseRetry.photo);
            }}
            type="button"
          >
            もう一度送信する
          </button>
        </div>
      ) : null}
    </section>
  );
}

function toMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "処理に失敗しました。時間をおいて、もう一度お試しください。";
}

/**
 * Normalize {@link WalrusPutError} to a UI-friendly message. `transient` only
 * surfaces here after the internal retry loop has exhausted 3 attempts, so we
 * treat it the same as `final`. `config_missing` keeps its own wording because
 * it signals an operator misconfiguration rather than a retryable failure.
 */
function classifyWalrusError(error: unknown): string {
  if (error instanceof WalrusPutError) {
    return error.message;
  }
  return toMessage(error);
}

/**
 * Whether a Walrus PUT failure is worth offering a "retry" button for.
 *
 * `config_missing` is a deploy-time misconfiguration (missing publisher /
 * aggregator URL), so clicking retry will only produce the same error. The
 * internal retry loop in `putBlobToWalrus` already surfaces `transient` only
 * after exhausting 3 attempts — but the user may still recover by getting to
 * a better network, so we treat it as retryable. `final` covers genuine
 * Walrus-side failures and is likewise retryable from the user's perspective.
 */
function isWalrusRetryable(error: unknown): boolean {
  if (!(error instanceof WalrusPutError)) {
    // Non-Walrus errors (e.g. a thrown string from a test fixture) are not
    // something the retry path can fix; be conservative and hide the button.
    return false;
  }
  return error.kind === "final" || error.kind === "transient";
}

function isAuthExpired(error: unknown): boolean {
  return (
    error instanceof EnokiSubmitClientError && error.code === "auth_expired"
  );
}

function isSubmitRecovering(error: unknown): error is EnokiSubmitClientError & {
  readonly recovery: SubmitPhotoRecoveryContext;
} {
  return (
    error instanceof EnokiSubmitClientError &&
    error.submissionStatus === "recovering" &&
    error.recovery !== null
  );
}

function toSubmitErrorMessage(error: unknown): string {
  if (error instanceof EnokiSubmitClientError) {
    return error.message;
  }
  return toMessage(error);
}

/**
 * User-facing narration of the Kakera polling state. The `idle` case only
 * appears while we don't yet have an owner + blob id pair, so the card
 * uses empty wording; the rest map to the three visible states listed in
 * the STEP 5 spec.
 */
function describeKakeraStatus(
  status: "idle" | "searching" | "found" | "timeout",
): string {
  switch (status) {
    case "found":
      return "Kakera を受け取りました。";
    case "timeout":
      return "Kakera を確認できませんでした（タイムアウト）。時間を置いてから再読み込みしてください。";
    case "searching":
      return "Kakera を確認しています…";
    default:
      return "";
  }
}

const RECOVERY_RETRY_INTERVAL_MS = 1_500;
const RECOVERY_MAX_ATTEMPTS = 20;

const EMPTY_WALRUS_ENV: WalrusEnv = {
  NEXT_PUBLIC_WALRUS_PUBLISHER: undefined,
  NEXT_PUBLIC_WALRUS_AGGREGATOR: undefined,
};

const EMPTY_KAKERA_CLIENT: KakeraOwnedClient = {
  getOwnedObjects: async () => ({
    data: [],
    hasNextPage: false,
  }),
};
