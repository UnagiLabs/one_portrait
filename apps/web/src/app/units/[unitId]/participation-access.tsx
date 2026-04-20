"use client";

import { isGoogleWallet } from "@mysten/enoki";
import {
  useConnectWallet,
  useCurrentAccount,
  useCurrentWallet,
  useDisconnectWallet,
  useWallets,
} from "@mysten/dapp-kit";
import { useState } from "react";

import { EnokiSubmitClientError, useSubmitPhoto } from "../../../lib/enoki/client-submit";
import { useEnokiConfigState } from "../../../lib/enoki/provider";

export function ParticipationAccess({
  unitId,
}: {
  readonly unitId: string;
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

  return <ParticipationAccessEnabled unitId={unitId} />;
}

function ParticipationAccessEnabled({
  unitId,
}: {
  readonly unitId: string;
}): React.ReactElement {
  const wallets = useWallets();
  const currentAccount = useCurrentAccount();
  const currentWallet = useCurrentWallet();
  const connectWallet = useConnectWallet();
  const disconnectWallet = useDisconnectWallet();
  const { isSubmitting, submitPhoto } = useSubmitPhoto(unitId);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [blobId, setBlobId] = useState("");
  const [submitFeedback, setSubmitFeedback] = useState<string | null>(null);

  const googleWallet = wallets.find(isGoogleWallet) ?? null;
  const isConnecting = currentWallet.connectionStatus === "connecting";

  async function handleLogin(): Promise<void> {
    if (!googleWallet) {
      setConnectError("Google ログインの設定が見つかりません。");
      return;
    }

    setConnectError(null);

    try {
      await connectWallet.mutateAsync({
        wallet: googleWallet,
      });
    } catch (error) {
      setConnectError(toMessage(error));
    }
  }

  async function handleSubmit(): Promise<void> {
    setSubmitFeedback(null);

    try {
      const result = await submitPhoto(blobId);
      setSubmitFeedback(`送信を開始しました。digest: ${result.digest}`);
      setBlobId("");
    } catch (error) {
      if (error instanceof EnokiSubmitClientError && error.code === "auth_expired") {
        disconnectWallet.mutate();
        setConnectError(error.message);
        return;
      }

      setSubmitFeedback(toMessage(error));
    }
  }

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
          <label className="grid gap-2 text-sm text-slate-200">
            <span>仮の blob id</span>
            {/* TODO(issue-next): replace this temporary blob input with Walrus upload output. */}
            <input
              className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 font-mono text-sm text-white outline-none placeholder:text-slate-500"
              onChange={(event) => {
                setBlobId(event.target.value);
              }}
              placeholder="walrus-blob-id"
              type="text"
              value={blobId}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-full bg-amber-300 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-200"
              disabled={blobId.trim().length === 0 || isSubmitting}
              onClick={() => {
                void handleSubmit();
              }}
              type="button"
            >
              {isSubmitting ? "送信中..." : "投稿用 Tx を試す"}
            </button>
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
      {submitFeedback ? (
        <p
          aria-live="polite"
          className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-50"
        >
          {submitFeedback}
        </p>
      ) : null}
    </section>
  );
}

function toMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "ログインに失敗しました。時間をおいて、もう一度お試しください。";
}
