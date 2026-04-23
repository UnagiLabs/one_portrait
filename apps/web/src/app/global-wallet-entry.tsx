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

import { useEnokiConfigState } from "../lib/enoki/provider";
import { SuiWalletConnectModal } from "./sui-wallet-connect-modal";

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
  const state = useEnokiConfigState();

  if (!state.submitEnabled) {
    return (
      <button className="op-btn-outline" disabled type="button">
        ログイン準備中
      </button>
    );
  }

  return <GlobalWalletEntryEnabled />;
}

function GlobalWalletEntryEnabled(): React.ReactElement {
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
          className="op-btn-outline"
          onClick={() => {
            setOpen((current) => !current);
          }}
          type="button"
        >
          <GoogleGlyph />
          <span className="ml-2">Sign In</span>
        </button>

        {open ? (
          <div
            className="absolute right-0 top-[calc(100%+0.75rem)] z-50 grid min-w-64 gap-3 border border-[var(--rule-strong)] bg-[#0a0604] p-5 shadow-2xl shadow-black/60"
            style={{
              boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            }}
          >
            <p className="op-eyebrow">
              <span className="bar" />
              <span>Connect</span>
            </p>
            <button
              className="op-btn-primary"
              onClick={() => {
                void handleGoogleLogin();
              }}
              type="button"
            >
              Google zkLogin
            </button>
            <SuiWalletConnectModal
              trigger={
                <button className="op-btn-ghost" type="button">
                  Sui wallet
                </button>
              }
            />

            {connectError ? (
              <p aria-live="polite" className="op-alert-warn text-sm" role="alert">
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
        className="op-btn-outline"
        onClick={() => {
          setOpen((current) => !current);
        }}
        type="button"
      >
        <span className="font-mono-op text-[11px] tracking-[0.08em]">
          {shortenAddress(currentAccount.address)}
        </span>
      </button>

      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+0.75rem)] z-50 grid min-w-80 gap-4 border border-[var(--rule-strong)] bg-[#0a0604] p-5 shadow-2xl shadow-black/60"
          style={{
            boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          }}
        >
          <div className="grid gap-1">
            <p className="font-mono-op text-[10px] uppercase tracking-[0.2em] text-[var(--ink-dim)]">
              {isGoogleConnected ? "Google zkLogin" : "Sui wallet"}
            </p>
            <p className="font-mono-op text-xs break-all text-[var(--ember)]">
              {currentAccount.address}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="op-btn-outline"
              onClick={() => {
                void handleCopy(currentAccount.address);
              }}
              type="button"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <a
              className="op-btn-outline"
              href={buildExplorerUrl(currentAccount.address)}
              rel="noreferrer"
              target="_blank"
            >
              Explorer
            </a>
            <button
              className="op-btn-outline"
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

function GoogleGlyph(): React.ReactElement {
  return (
    <svg height={14} viewBox="0 0 18 18" width={14}>
      <title>Google</title>
      <path
        d="M17.64 9.2c0-.63-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z"
        fill="#FFC107"
      />
      <path
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.6-5.05-3.74H.95v2.34A9 9 0 0 0 9 18Z"
        fill="#4CAF50"
      />
      <path
        d="M3.95 10.68a5.4 5.4 0 0 1 0-3.36V4.98H.95a9 9 0 0 0 0 8.04l3-2.34Z"
        fill="#FFC107"
      />
      <path
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .95 4.98l3 2.34C4.66 5.18 6.65 3.58 9 3.58Z"
        fill="#F44336"
      />
    </svg>
  );
}

function toMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "接続に失敗しました。時間をおいて、もう一度お試しください。";
}
