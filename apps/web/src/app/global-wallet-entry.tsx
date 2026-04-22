"use client";

import {
  ConnectModal,
  useConnectWallet,
  useCurrentAccount,
  useCurrentWallet,
  useDisconnectWallet,
  useWallets,
} from "@mysten/dapp-kit";
import { isGoogleWallet } from "@mysten/enoki";
import { useEffect, useRef, useState } from "react";

function shortenAddress(address: string): string {
  if (address.length <= 12) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function buildExplorerUrl(address: string): string {
  return `https://suiexplorer.com/address/${address}`;
}

export function GlobalWalletEntry(): React.ReactElement {
  const wallets = useWallets();
  const currentAccount = useCurrentAccount();
  const currentWallet = useCurrentWallet();
  const connectWallet = useConnectWallet();
  const disconnectWallet = useDisconnectWallet();
  const [open, setOpen] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const googleWallet = wallets.find(isGoogleWallet) ?? null;
  const connectedWallet = currentWallet.currentWallet ?? null;
  const isGoogleConnected =
    connectedWallet !== null && isGoogleWallet(connectedWallet);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  async function handleGoogleLogin(): Promise<void> {
    if (!googleWallet) {
      setConnectError("Google zkLogin の設定が見つかりません。");
      return;
    }

    setConnectError(null);

    try {
      await connectWallet.mutateAsync({ wallet: googleWallet });
      setOpen(false);
    } catch (error) {
      setConnectError(toMessage(error));
    }
  }

  async function handleCopy(address: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      setCopied(false);
    }
  }

  if (!currentAccount) {
    return (
      <div className="relative" ref={containerRef}>
        <button
          className="rounded-full border border-cyan-300/40 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:border-cyan-200 hover:text-white"
          onClick={() => {
            setOpen((current) => !current);
          }}
          type="button"
        >
          ログイン
        </button>

        {open ? (
          <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 grid min-w-56 gap-3 rounded-3xl border border-white/10 bg-slate-950/95 p-4 shadow-2xl shadow-black/40">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Connect
            </p>
            <button
              className="rounded-2xl bg-cyan-300 px-4 py-3 text-left text-sm font-medium text-slate-950 transition hover:bg-cyan-200"
              onClick={() => {
                void handleGoogleLogin();
              }}
              type="button"
            >
              Google zkLogin
            </button>
            <ConnectModal
              trigger={
                <button
                  className="rounded-2xl border border-white/10 px-4 py-3 text-left text-sm font-medium text-white transition hover:border-cyan-200/60"
                  type="button"
                >
                  Sui wallet
                </button>
              }
              walletFilter={(wallet) => !isGoogleWallet(wallet)}
            />

            {connectError ? (
              <p
                aria-live="polite"
                className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100"
                role="alert"
              >
                {connectError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-cyan-200/60"
        onClick={() => {
          setOpen((current) => !current);
        }}
        type="button"
      >
        {shortenAddress(currentAccount.address)}
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 grid min-w-72 gap-3 rounded-3xl border border-white/10 bg-slate-950/95 p-4 shadow-2xl shadow-black/40">
          <div className="grid gap-1">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              {isGoogleConnected ? "Google zkLogin" : "Sui wallet"}
            </p>
            <p className="font-mono text-xs break-all text-cyan-100">
              {currentAccount.address}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-full border border-white/10 px-3 py-2 text-sm text-white transition hover:border-cyan-200/60"
              onClick={() => {
                void handleCopy(currentAccount.address);
              }}
              type="button"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <a
              className="rounded-full border border-white/10 px-3 py-2 text-sm text-white transition hover:border-cyan-200/60"
              href={buildExplorerUrl(currentAccount.address)}
              rel="noreferrer"
              target="_blank"
            >
              Explorer
            </a>
            <button
              className="rounded-full border border-white/10 px-3 py-2 text-sm text-white transition hover:border-cyan-200/60"
              onClick={() => {
                disconnectWallet.mutate();
                setOpen(false);
              }}
              type="button"
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function toMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "接続に失敗しました。時間をおいて、もう一度お試しください。";
}
