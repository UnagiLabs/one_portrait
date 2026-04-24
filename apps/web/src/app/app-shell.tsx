"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { GlobalWalletEntry } from "./global-wallet-entry";

type AppShellProps = {
  readonly children: ReactNode;
};

const HIDDEN_HEADER_PATHS = new Set(["/auth/enoki/callback", "/demo"]);

export function AppShell({ children }: AppShellProps): React.ReactElement {
  const pathname = usePathname();
  const showHeader = !HIDDEN_HEADER_PATHS.has(pathname);

  return (
    <>
      {showHeader ? <GlobalHeader pathname={pathname} /> : null}
      {children}
    </>
  );
}

function GlobalHeader({
  pathname,
}: {
  readonly pathname: string;
}): React.ReactElement {
  const isHome = pathname === "/";
  const isGallery = pathname.startsWith("/gallery");
  const isArena = pathname.startsWith("/units") || (!isHome && !isGallery);

  return (
    <header className="op-chrome">
      <div className="op-chrome-left">
        <Link className="op-brand" href="/">
          <BrandMark />
          <div className="op-brand-name">
            <span>ONE PORTRAIT</span>
            <em>Kakera</em>
          </div>
        </Link>
        <nav className="op-chrome-nav">
          <Link className={isHome ? "active" : ""} href="/">
            Home
          </Link>
          <Link className={isArena ? "active" : ""} href="/">
            Arena
          </Link>
          <Link className={isGallery ? "active" : ""} href="/gallery">
            Gallery
          </Link>
        </nav>
      </div>
      <div className="op-chrome-right">
        <div className="flex items-center gap-2">
          <span className="op-status-dot" />
          <span className="op-mono-tag">SUI · TESTNET</span>
        </div>
        <GlobalWalletEntry />
      </div>
    </header>
  );
}

function BrandMark(): React.ReactElement {
  return (
    <div className="op-brand-mark">
      <svg viewBox="0 0 40 40">
        <title>ONE Portrait</title>
        <rect
          fill="none"
          height={36}
          stroke="#FF7A1A"
          strokeWidth={1.5}
          width={36}
          x={2}
          y={2}
        />
        <rect fill="#FF7A1A" height={10} width={10} x={8} y={8} />
        <rect fill="rgba(255,122,26,0.4)" height={10} width={10} x={22} y={8} />
        <rect fill="rgba(255,122,26,0.4)" height={10} width={10} x={8} y={22} />
        <rect fill="#FF7A1A" height={10} width={10} x={22} y={22} />
      </svg>
    </div>
  );
}
