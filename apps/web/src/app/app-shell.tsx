"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { GlobalWalletEntry } from "./global-wallet-entry";

type AppShellProps = {
  readonly children: ReactNode;
};

const HIDDEN_HEADER_PATHS = new Set(["/auth/enoki/callback"]);

export function AppShell({ children }: AppShellProps): React.ReactElement {
  const pathname = usePathname();
  const showHeader = !HIDDEN_HEADER_PATHS.has(pathname);

  return (
    <>
      {showHeader ? <GlobalHeader /> : null}
      {children}
    </>
  );
}

function GlobalHeader(): React.ReactElement {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-6 py-3 text-slate-50">
        <Link
          className="text-sm uppercase tracking-[0.35em] text-cyan-200/90 hover:text-cyan-100"
          href="/"
        >
          one portrait
        </Link>
        <nav className="flex items-center gap-4 text-sm text-slate-200">
          <Link className="hover:text-white" href="/gallery">
            Gallery
          </Link>
        </nav>
        <GlobalWalletEntry />
      </div>
    </header>
  );
}
