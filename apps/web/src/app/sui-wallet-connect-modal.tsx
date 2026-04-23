"use client";

import { ConnectModal } from "@mysten/dapp-kit";
import { isGoogleWallet } from "@mysten/enoki";
import type { ReactElement, ReactNode } from "react";

type ControlledModalProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly defaultOpen?: never;
};

type UncontrolledModalProps = {
  readonly defaultOpen?: boolean;
  readonly open?: never;
  readonly onOpenChange?: never;
};

type SuiWalletConnectModalProps = {
  readonly trigger?: NonNullable<ReactNode>;
} & (ControlledModalProps | UncontrolledModalProps);

function HiddenTrigger(): ReactElement {
  return (
    <button hidden tabIndex={-1} type="button">
      Open Sui wallet modal
    </button>
  );
}

export function SuiWalletConnectModal({
  trigger,
  ...modalProps
}: SuiWalletConnectModalProps): ReactElement {
  return (
    <ConnectModal
      {...modalProps}
      trigger={trigger ?? <HiddenTrigger />}
      walletFilter={(wallet) => !isGoogleWallet(wallet)}
    />
  );
}
