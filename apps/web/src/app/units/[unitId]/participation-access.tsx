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

import { useSubmitPhoto } from "../../../lib/enoki/client-submit";
import { useEnokiConfigState } from "../../../lib/enoki/provider";
import {
  type PreprocessedPhoto,
  preprocessPhoto as defaultPreprocessPhoto,
} from "../../../lib/image/preprocess";

/**
 * Waiting-room submission access.
 *
 * Phase 2 / STEP 3 scope: the UI walks the participant through
 *
 *   idle (not signed in)
 *     -> ready (signed in; consent + file picker)
 *     -> processing (client-side preprocess in flight)
 *     -> previewing (preprocessed blob rendered)
 *     -> error (preprocess failed)
 *
 * Walrus upload and `submit_photo` wiring land in STEP 4 — we intentionally
 * stop at previewing for now. `useSubmitPhoto` is still instantiated so the
 * hook contract stays warm and we can plug it in without re-threading props.
 *
 * Consent wording follows `docs/spec.md` §3.5 (Kakera is a Soulbound NFT) and
 * §3.7 (the original image becomes retrievable by anyone who knows the
 * Walrus `blob_id`).
 */

type PreprocessPhotoFn = (file: File) => Promise<PreprocessedPhoto>;

type UploadPhase =
  | { readonly kind: "ready" }
  | { readonly kind: "processing" }
  | { readonly kind: "previewing"; readonly photo: PreprocessedPhoto }
  | { readonly kind: "error"; readonly message: string };

export function ParticipationAccess({
  unitId,
  preprocessPhoto,
}: {
  readonly unitId: string;
  readonly preprocessPhoto?: PreprocessPhotoFn;
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
      unitId={unitId}
    />
  );
}

function ParticipationAccessEnabled({
  unitId,
  preprocessPhoto,
}: {
  readonly unitId: string;
  readonly preprocessPhoto: PreprocessPhotoFn;
}): React.ReactElement {
  const wallets = useWallets();
  const currentAccount = useCurrentAccount();
  const currentWallet = useCurrentWallet();
  const connectWallet = useConnectWallet();
  const disconnectWallet = useDisconnectWallet();
  // Keep the hook mounted so STEP 4 can wire it to the preprocessed blob
  // without restructuring the component. Not invoked in STEP 3.
  useSubmitPhoto(unitId);

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

  const isProcessing = phase.kind === "processing";
  const fileInputDisabled = !consented || isProcessing;
  const previewPhoto = phase.kind === "previewing" ? phase.photo : null;
  const preprocessErrorMessage =
    phase.kind === "error" ? phase.message : null;

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

      {preprocessErrorMessage ? (
        <p
          aria-live="polite"
          className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
          role="alert"
        >
          {preprocessErrorMessage}
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
