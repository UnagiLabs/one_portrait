/**
 * Test-only Wallet Standard stub used when
 * `NEXT_PUBLIC_E2E_STUB_WALLET === "1"` is set. The flag is only injected by
 * the Playwright `webServer` block, never by production deploys.
 *
 * Why this exists: Playwright cannot drive the real Google OAuth popup that
 * zkLogin uses, so the E2E run fakes the wallet side entirely. All outbound
 * HTTP (Enoki sponsor/execute, Walrus PUT, Sui RPC) is separately mocked via
 * `page.route()` in `apps/web/tests/e2e/fixtures/mock-network.ts`; the stub
 * below only has to satisfy `@mysten/dapp-kit`'s `WalletProvider` and the
 * `enoki:getSession` surface consumed by `client-submit.ts`.
 */

import type {
  StandardConnectFeature,
  StandardDisconnectFeature,
  StandardEventsFeature,
  StandardEventsListeners,
  Wallet,
  WalletAccount,
} from "@mysten/wallet-standard";
import { getWallets, SUI_TESTNET_CHAIN } from "@mysten/wallet-standard";

export const E2E_STUB_WALLET_NAME = "ONE Portrait E2E Stub";
export const E2E_STUB_SUI_WALLET_NAME = "ONE Portrait E2E Sui Stub";
export const E2E_STUB_ACCOUNT_ADDRESS =
  "0xe2e0000000000000000000000000000000000000000000000000000000000001";
/** Opaque JWT shipped with the intercepted sponsor/execute requests. */
export const E2E_STUB_JWT = "e2e-stub-jwt";

const ENOKI_GET_METADATA = "enoki:getMetadata" as const;
const ENOKI_GET_SESSION = "enoki:getSession" as const;

type EnokiGetMetadataFeature = {
  readonly [ENOKI_GET_METADATA]: {
    readonly version: "1.0.0";
    readonly getMetadata: () => { readonly provider: "google" };
  };
};

type EnokiGetSessionFeature = {
  readonly [ENOKI_GET_SESSION]: {
    readonly version: "1.0.0";
    readonly getSession: () => Promise<{ readonly jwt: string }>;
  };
};

type SuiSignTransactionFeature = {
  readonly "sui:signTransaction": {
    readonly version: "2.0.0";
    readonly signTransaction: (input: {
      readonly transaction: { readonly toJSON: () => Promise<string> };
    }) => Promise<{ readonly bytes: string; readonly signature: string }>;
  };
};

type SuiSignPersonalMessageFeature = {
  readonly "sui:signPersonalMessage": {
    readonly version: "1.1.0";
    readonly signPersonalMessage: (input: {
      readonly message: Uint8Array;
    }) => Promise<{ readonly bytes: string; readonly signature: string }>;
  };
};

const DUMMY_SIGNATURE = toBase64(new Uint8Array(97));

const ICON_DATA_URL = ("data:image/svg+xml;base64," +
  toBase64(
    new TextEncoder().encode(
      "<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><rect width='32' height='32' fill='#64748b'/></svg>",
    ),
  )) as Wallet["icon"];

function makeStubAccount(): WalletAccount {
  return {
    address: E2E_STUB_ACCOUNT_ADDRESS,
    publicKey: new Uint8Array(32),
    chains: [SUI_TESTNET_CHAIN],
    features: ["sui:signTransaction", "sui:signPersonalMessage"],
    label: "E2E Stub",
  };
}

type StubFeatures = StandardConnectFeature &
  StandardDisconnectFeature &
  StandardEventsFeature &
  SuiSignTransactionFeature &
  SuiSignPersonalMessageFeature &
  EnokiGetMetadataFeature &
  EnokiGetSessionFeature;

type PlainStubFeatures = StandardConnectFeature &
  StandardDisconnectFeature &
  StandardEventsFeature &
  SuiSignTransactionFeature &
  SuiSignPersonalMessageFeature;

type EventListeners = {
  [K in keyof StandardEventsListeners]: Set<StandardEventsListeners[K]>;
};

function makeStubWallet(): Wallet {
  return makeWallet({
    features: makeGoogleFeatures(),
    name: E2E_STUB_WALLET_NAME,
  });
}

function makePlainStubWallet(): Wallet {
  return makeWallet({
    features: makePlainFeatures(),
    name: E2E_STUB_SUI_WALLET_NAME,
  });
}

function makeWallet({
  features,
  name,
}: {
  readonly features: StubFeatures | PlainStubFeatures;
  readonly name: string;
}): Wallet {
  const account = makeStubAccount();

  return {
    version: "1.0.0",
    name,
    icon: ICON_DATA_URL,
    chains: [SUI_TESTNET_CHAIN],
    accounts: [account],
    features,
  };
}

function makeGoogleFeatures(): StubFeatures {
  const account = makeStubAccount();
  const listeners: EventListeners = {
    change: new Set(),
  };

  return {
    "standard:connect": {
      version: "1.0.0",
      connect: async () => ({ accounts: [account] }),
    },
    "standard:disconnect": {
      version: "1.0.0",
      disconnect: async () => {},
    },
    "standard:events": {
      version: "1.0.0",
      on: (event, listener) => {
        const bucket = listeners[event];
        if (!bucket) {
          return () => {};
        }
        bucket.add(listener);
        return () => {
          bucket.delete(listener);
        };
      },
    },
    "sui:signTransaction": {
      version: "2.0.0",
      signTransaction: async ({ transaction }) => {
        const bytes = await transaction.toJSON().catch(() => "AAAA");
        return { bytes, signature: DUMMY_SIGNATURE };
      },
    },
    "sui:signPersonalMessage": {
      version: "1.1.0",
      signPersonalMessage: async ({ message }) => ({
        bytes: toBase64(message),
        signature: DUMMY_SIGNATURE,
      }),
    },
    [ENOKI_GET_METADATA]: {
      version: "1.0.0",
      getMetadata: () => ({ provider: "google" }),
    },
    [ENOKI_GET_SESSION]: {
      version: "1.0.0",
      getSession: async () => ({ jwt: E2E_STUB_JWT }),
    },
  };
}

function makePlainFeatures(): PlainStubFeatures {
  const account = makeStubAccount();
  const listeners: EventListeners = {
    change: new Set(),
  };

  return {
    "standard:connect": {
      version: "1.0.0",
      connect: async () => ({ accounts: [account] }),
    },
    "standard:disconnect": {
      version: "1.0.0",
      disconnect: async () => {},
    },
    "standard:events": {
      version: "1.0.0",
      on: (event, listener) => {
        const bucket = listeners[event];
        if (!bucket) {
          return () => {};
        }
        bucket.add(listener);
        return () => {
          bucket.delete(listener);
        };
      },
    },
    "sui:signTransaction": {
      version: "2.0.0",
      signTransaction: async ({ transaction }) => {
        const bytes = await transaction.toJSON().catch(() => "AAAA");
        return { bytes, signature: DUMMY_SIGNATURE };
      },
    },
    "sui:signPersonalMessage": {
      version: "1.1.0",
      signPersonalMessage: async ({ message }) => ({
        bytes: toBase64(message),
        signature: DUMMY_SIGNATURE,
      }),
    },
  };
}

/**
 * Register the stub with the browser-wide Wallet Standard registry.
 * Returns the unregister callback (mirrors the `registerEnokiWallets` shape).
 */
export function registerE2EStubWallet(): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const api = getWallets();
  const unregisterGoogle = api.register(makeStubWallet());
  const unregisterSui = api.register(makePlainStubWallet());
  return () => {
    unregisterSui();
    unregisterGoogle();
  };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  if (typeof btoa === "function") {
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}
