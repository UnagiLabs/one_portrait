import { appMeta } from "@one-portrait/shared";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppWalletProvider } from "../lib/enoki/provider";

import "./globals.css";

export const metadata: Metadata = {
  title: appMeta.name,
  description: appMeta.tagline,
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ja">
      <body>
        <AppWalletProvider>{children}</AppWalletProvider>
      </body>
    </html>
  );
}
