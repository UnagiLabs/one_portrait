"use client";

import {
  useConnectWallet,
  useCurrentAccount,
  useCurrentWallet,
  useDisconnectWallet,
  useWallets,
} from "@mysten/dapp-kit";
import { isGoogleWallet } from "@mysten/enoki";
import { useEffect, useRef, useState } from "react";

import {
  EnokiSubmitClientError,
  type SubmitPhotoRecoveryContext,
  type SubmitPhotoSuccess,
  useSubmitPhoto,
} from "../../../lib/enoki/client-submit";
import { useEnokiConfigState } from "../../../lib/enoki/provider";
import { getPublicEnvSource, loadPublicEnv } from "../../../lib/env";
import {
  preprocessPhoto as defaultPreprocessPhoto,
  type PreprocessedPhoto,
} from "../../../lib/image/preprocess";
import { checkSubmissionExecution, getSuiClient } from "../../../lib/sui";
import { useOwnedKakera } from "../../../lib/sui/react";
import {
  putBlobToWalrus as defaultPutBlobToWalrus,
  type WalrusEnv,
  WalrusPutError,
  type WalrusPutResult,
} from "../../../lib/walrus/put";

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
  walrusEnv,
}: {
  readonly unitId: string;
  readonly preprocessPhoto?: PreprocessPhotoFn;
  readonly putBlob?: PutBlobFn;
  readonly walrusEnv?: WalrusEnv;
}): React.ReactElement {
  const state = useEnokiConfigState();

  if (!state.submitEnabled) {
    return (
      <section className="grid gap-3 rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Submit access
        </p>
        <p className="text-sm text-slate-300">
          投稿ログインは未設定です。今は進捗の確認だけ使えます。
        </p>
      </section>
    );
  }

  return (
    <ParticipationAccessEnabled
      preprocessPhoto={preprocessPhoto ?? defaultPreprocessPhoto}
      putBlob={putBlob ?? defaultPutBlobToWalrus}
      unitId={unitId}
      walrusEnv={walrusEnv ?? readWalrusEnvFromProcess()}
    />
  );
}

function ParticipationAccessEnabled({
  unitId,
  preprocessPhoto,
  putBlob,
  walrusEnv,
}: {
  readonly unitId: string;
  readonly preprocessPhoto: PreprocessPhotoFn;
  readonly putBlob: PutBlobFn;
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

  // Kakera polling kicks in only once we know the Walrus blob id and the
  // zkLogin address. The hook stays idle while any of the inputs are
  // missing (`ownerAddress: null` branch inside `useOwnedKakera`).
  const doneBlobId = phase.kind === "done" ? phase.blobId : "";
  const packageId = safeReadPackageId();
  const ownedKakera = useOwnedKakera({
    suiClient: getSuiClient(),
    ownerAddress:
      phase.kind === "done" ? (currentAccount?.address ?? null) : null,
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
    if (phase.kind !== "recovering") {
      return;
    }

    let cancelled = false;
    let pending: ReturnType<typeof setTimeout> | null = null;

    const verifyExecution = async (): Promise<void> => {
      let result;
      try {
        result = await checkSubmissionExecution({
          suiClient: getSuiClient(),
          digest: phase.recovery.digest,
          ownerAddress: currentAccount?.address ?? phase.recovery.sender,
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

      pending = setTimeout(() => {
        pending = null;
        void verifyExecution();
      }, RECOVERY_RETRY_INTERVAL_MS);
    };

    void verifyExecution();

    return () => {
      cancelled = true;
      if (pending !== null) {
        clearTimeout(pending);
      }
    };
  }, [currentAccount?.address, packageId, phase, unitId]);

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

  return (
    <section className="grid gap-4 rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
      <div className="grid gap-1">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">
          Submit access
        </p>
        <h2 className="font-serif text-2xl text-white">Google login</h2>
      </div>

      {currentAccount ? (
        <>
          <p className="text-sm text-slate-200">
            zkLogin アドレスを確認できました。投稿の署名に使うのはこの住所です。
          </p>
          <p className="font-mono text-xs break-all text-cyan-100">
            {currentAccount.address}
          </p>

          {showConsentAndFilePicker ? (
            <>
              <label className="flex items-start gap-2 text-sm text-slate-200">
                <input
                  checked={consented}
                  className="mt-1"
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

              <label className="grid gap-2 text-sm text-slate-200">
                <span>写真を選択</span>
                <input
                  accept="image/*"
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
            <p className="text-sm text-slate-300" role="status">
              処理中…
            </p>
          ) : null}

          {previewPhoto ? (
            // biome-ignore lint: client-side object URL preview, next/image not applicable.
            <img
              alt="投稿プレビュー"
              className="max-w-full rounded-2xl border border-white/10"
              src={previewPhoto.previewUrl}
            />
          ) : null}

          {isUploading ? (
            <p className="text-sm text-slate-300" role="status">
              Walrus に保存しています…
            </p>
          ) : null}

          {isSubmitting ? (
            <p className="text-sm text-slate-300" role="status">
              オンチェーンに投稿しています…
            </p>
          ) : null}

          {isRecovering ? (
            <p className="text-sm text-slate-300" role="status">
              投稿結果を確認しています。しばらくお待ちください。
            </p>
          ) : null}

          {showSubmitButton ? (
            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-200"
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
              className="grid gap-3 rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-4 text-sm text-emerald-100"
              role="status"
            >
              <p className="text-base">投稿が完了しました。</p>

              {/* biome-ignore lint: local object URL preview, next/image N/A. */}
              <img
                alt="投稿プレビュー"
                className="max-w-full rounded-xl border border-white/10"
                src={donePhase.photo.previewUrl}
              />

              <dl className="grid gap-2">
                <div className="grid gap-0.5">
                  <dt className="text-xs uppercase tracking-[0.3em] text-emerald-200/70">
                    送信アドレス
                  </dt>
                  <dd className="font-mono text-xs break-all">
                    {donePhase.result.sender}
                  </dd>
                </div>

                <div className="grid gap-0.5">
                  <dt className="text-xs uppercase tracking-[0.3em] text-emerald-200/70">
                    submission_no
                  </dt>
                  <dd className="font-mono text-sm">
                    {ownedKakera.kakera
                      ? `#${ownedKakera.kakera.submissionNo}`
                      : "確認中…"}
                  </dd>
                </div>

                <div className="grid gap-0.5">
                  <dt className="text-xs uppercase tracking-[0.3em] text-emerald-200/70">
                    digest
                  </dt>
                  <dd className="font-mono text-xs break-all">
                    {donePhase.result.digest}
                  </dd>
                </div>
              </dl>

              <p aria-live="polite" className="text-xs text-emerald-100/90">
                {describeKakeraStatus(ownedKakera.status)}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-full border border-cyan-300/40 px-4 py-2 text-sm text-cyan-100 hover:border-cyan-200"
              onClick={() => disconnectWallet.mutate()}
              type="button"
            >
              ログイン解除
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-300">
            先に Google でログインすると、zkLogin の参加用アドレスを作れます。
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-200"
              disabled={isConnecting}
              onClick={() => {
                void handleLogin();
              }}
              type="button"
            >
              {connectError ? "もう一度ログイン" : "Google でログイン"}
            </button>
          </div>
        </>
      )}

      {connectError ? (
        <p
          aria-live="polite"
          className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
          role="alert"
        >
          {connectError}
        </p>
      ) : null}

      {phaseErrorMessage ? (
        <p
          aria-live="polite"
          className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
          role="alert"
        >
          {phaseErrorMessage}
        </p>
      ) : null}

      {phaseRetry ? (
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-200"
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

function isSubmitRecovering(
  error: unknown,
): error is EnokiSubmitClientError & {
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

function readWalrusEnvFromProcess(): WalrusEnv {
  // Next.js inlines `process.env.NEXT_PUBLIC_*` at build time on the client;
  // on the server the same access pattern works. `putBlobToWalrus` throws a
  // `config_missing` error if either value is empty, which the UI then
  // surfaces through {@link classifyWalrusError}.
  return {
    NEXT_PUBLIC_WALRUS_PUBLISHER: process.env.NEXT_PUBLIC_WALRUS_PUBLISHER,
    NEXT_PUBLIC_WALRUS_AGGREGATOR: process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR,
  };
}

function safeReadPackageId(): string | null {
  try {
    return loadPublicEnv(getPublicEnvSource()).packageId;
  } catch {
    return null;
  }
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
