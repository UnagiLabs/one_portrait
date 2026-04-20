"use client";

import {
  useConnectWallet,
  useCurrentAccount,
  useCurrentWallet,
  useDisconnectWallet,
  useWallets,
} from "@mysten/dapp-kit";
import { isGoogleWallet } from "@mysten/enoki";
import { useState } from "react";

import {
  EnokiSubmitClientError,
  type SubmitPhotoSuccess,
  useSubmitPhoto,
} from "../../../lib/enoki/client-submit";
import { useEnokiConfigState } from "../../../lib/enoki/provider";
import {
  type PreprocessedPhoto,
  preprocessPhoto as defaultPreprocessPhoto,
} from "../../../lib/image/preprocess";
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
  | { readonly kind: "done"; readonly result: SubmitPhotoSuccess }
  | { readonly kind: "error"; readonly message: string };

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

  const googleWallet = wallets.find(isGoogleWallet) ?? null;
  const isConnecting = currentWallet.connectionStatus === "connecting";

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
    setPhase({ kind: "processing" });

    try {
      const photo = await preprocessPhoto(file);
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
      });
      return;
    }

    setPhase({ kind: "submitting", photo, blobId: putResult.blobId });

    try {
      const result = await submitPhoto(putResult.blobId);
      setPhase({ kind: "done", result });
    } catch (error) {
      if (isAuthExpired(error)) {
        // 認証切れは再ログイン導線へ戻す。wallet を切断して
        // <Google でログイン> ボタンが再表示される状態にする。
        disconnectWallet.mutate();
        setConnectError(toMessage(error));
        setPhase({ kind: "ready" });
        return;
      }
      setPhase({ kind: "error", message: toSubmitErrorMessage(error) });
    }
  }

  const isProcessing = phase.kind === "processing";
  const isUploading = phase.kind === "uploading";
  const isSubmitting = phase.kind === "submitting";
  const fileInputDisabled =
    !consented || isProcessing || isUploading || isSubmitting;
  const previewPhoto =
    phase.kind === "previewing" ||
    phase.kind === "uploading" ||
    phase.kind === "submitting"
      ? phase.photo
      : null;
  const submitButtonDisabled = isUploading || isSubmitting;
  const showSubmitButton =
    phase.kind === "previewing" ||
    phase.kind === "uploading" ||
    phase.kind === "submitting";
  const phaseErrorMessage =
    phase.kind === "error" ? phase.message : null;
  const doneResult = phase.kind === "done" ? phase.result : null;

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
              を知る人は誰でも取得できます。
              また、参加の証として Soulbound（譲渡不可）の Kakera NFT
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

          {doneResult ? (
            <div
              className="grid gap-1 rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100"
              role="status"
            >
              <p>投稿が完了しました。</p>
              <p className="font-mono text-xs break-all">
                digest: {doneResult.digest}
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

function isAuthExpired(error: unknown): boolean {
  return (
    error instanceof EnokiSubmitClientError && error.code === "auth_expired"
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
