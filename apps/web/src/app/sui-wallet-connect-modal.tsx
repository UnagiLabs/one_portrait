"use client";

import { ConnectModal } from "@mysten/dapp-kit";
import { isGoogleWallet } from "@mysten/enoki";
import type { ReactNode } from "react";
import { useState } from "react";

export function SuiWalletConnectModal({
  trigger,
}: {
  readonly trigger: NonNullable<ReactNode>;
}): React.ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <ConnectModal
      onOpenChange={setOpen}
      open={open}
      trigger={trigger}
      walletFilter={(wallet) => !isGoogleWallet(wallet)}
    />
  );
}
