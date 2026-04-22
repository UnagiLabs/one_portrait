import { appMeta } from "@one-portrait/shared";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "./app-shell";
import { AppWalletProvider } from "../lib/enoki/provider";

import "./globals.css";

export const metadata: Metadata = {
  title: appMeta.name,
  description: appMeta.tagline,
  icons: {
    icon: "/icon.jpg",
    shortcut: "/icon.jpg",
    apple: "/apple-icon.jpg",
  },
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ja">
      <body>
        <AppWalletProvider>
          <AppShell>{children}</AppShell>
        </AppWalletProvider>
      </body>
    </html>
  );
}
