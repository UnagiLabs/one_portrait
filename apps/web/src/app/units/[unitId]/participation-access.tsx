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

import { useEnokiConfigState } from "../../../lib/enoki/provider";

export function ParticipationAccess(): React.ReactElement {
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

  return <ParticipationAccessEnabled />;
}

function ParticipationAccessEnabled(): React.ReactElement {
  const wallets = useWallets();
  const currentAccount = useCurrentAccount();
  const currentWallet = useCurrentWallet();
  const connectWallet = useConnectWallet();
  const disconnectWallet = useDisconnectWallet();
  const [connectError, setConnectError] = useState<string | null>(null);

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
    </section>
  );
}

function toMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "ログインに失敗しました。時間をおいて、もう一度お試しください。";
}
