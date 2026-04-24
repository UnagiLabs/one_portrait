import { appMeta } from "@one-portrait/shared";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppWalletProvider } from "../lib/enoki/provider";
import { AppShell } from "./app-shell";

import "@mysten/dapp-kit/dist/index.css";
import "./globals.css";

export const metadata: Metadata = {
  title: appMeta.name,
  description: appMeta.tagline,
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/site/apple-icon.png",
  },
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          crossOrigin="anonymous"
          href="https://fonts.gstatic.com"
          rel="preconnect"
        />
      </head>
      <body>
        <AppWalletProvider>
          <AppShell>{children}</AppShell>
        </AppWalletProvider>
      </body>
    </html>
  );
}
