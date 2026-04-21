"use client";

import {
  SuiClientProvider,
  useSuiClientContext,
  WalletProvider,
} from "@mysten/dapp-kit";
import { isEnokiNetwork, registerEnokiWallets } from "@mysten/enoki";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getPublicEnvSource, loadPublicEnv } from "../env";
import { resolveFullnodeUrl } from "../sui/client";

import {
  canEnableSubmit,
  loadSubmitPublicEnv,
  type SubmitPublicEnv,
} from "./env";
import { registerE2EStubWallet } from "./stub-wallet";

const ENOKI_GOOGLE_REDIRECT_PATH = "/auth/enoki/callback";

function isE2EStubWalletEnabled(): boolean {
  return process.env.NEXT_PUBLIC_E2E_STUB_WALLET === "1";
}

export type EnokiConfigState =
  | { readonly submitEnabled: true; readonly config: SubmitPublicEnv }
  | { readonly submitEnabled: false; readonly reason: string };

const EnokiConfigContext = createContext<EnokiConfigState>({
  submitEnabled: false,
  reason: "wallet-provider-disabled",
});

export function AppWalletProvider({
  children,
}: {
  readonly children: ReactNode;
}): React.ReactElement {
  // Read each NEXT_PUBLIC_* value individually so Next.js can statically
  // inline them into the client bundle. Passing `process.env` wholesale leaks
  // an empty object after hydration and flips `submitEnabled` to false.
  const envSource = getPublicEnvSource();
  const readEnv = safeLoadPublicEnv(envSource);
  const [queryClient] = useState(() => new QueryClient());
  const state = useMemo<EnokiConfigState>(() => {
    if (!canEnableSubmit(envSource)) {
      return {
        submitEnabled: false,
        reason: "submit-env-missing",
      };
    }

    return {
      submitEnabled: true,
      config: loadSubmitPublicEnv(envSource),
    };
  }, [envSource]);

  const networks = useMemo(
    () =>
      readEnv
        ? {
            [readEnv.suiNetwork]: {
              network: readEnv.suiNetwork,
              url: resolveFullnodeUrl(readEnv.suiNetwork),
            },
          }
        : null,
    [readEnv],
  );

  if (!readEnv || !networks) {
    return (
      <EnokiConfigContext.Provider value={state}>
        {children}
      </EnokiConfigContext.Provider>
    );
  }

  return (
    <EnokiConfigContext.Provider value={state}>
      <QueryClientProvider client={queryClient}>
        <SuiClientProvider
          defaultNetwork={readEnv.suiNetwork}
          networks={networks}
        >
          <EnokiWalletRegistrar state={state} />
          <WalletProvider autoConnect>{children}</WalletProvider>
        </SuiClientProvider>
      </QueryClientProvider>
    </EnokiConfigContext.Provider>
  );
}

export function useEnokiConfigState(): EnokiConfigState {
  return useContext(EnokiConfigContext);
}

export function EnokiWalletRegistrar({
  state,
}: {
  readonly state: EnokiConfigState;
}): null {
  const { client, network } = useSuiClientContext();

  useEffect(() => {
    if (isE2EStubWalletEnabled()) {
      // Test-only path: swap the real Enoki wallet for a Wallet Standard
      // stub so Playwright can drive the submit flow without a real Google
      // OAuth popup. The flag is only injected by the Playwright webServer.
      return registerE2EStubWallet();
    }

    if (!state.submitEnabled || !isEnokiNetwork(network)) {
      return;
    }

    const { unregister } = registerEnokiWallets({
      apiKey: state.config.enokiApiKey,
      client,
      network,
      providers: {
        google: {
          clientId: state.config.googleClientId,
          redirectUrl: buildGoogleRedirectUrl(),
        },
      },
    });

    return unregister;
  }, [client, network, state]);

  return null;
}

function safeLoadPublicEnv(
  source: Readonly<Record<string, string | undefined>>,
) {
  try {
    return loadPublicEnv(source);
  } catch {
    return null;
  }
}

function buildGoogleRedirectUrl(): string {
  return new URL(ENOKI_GOOGLE_REDIRECT_PATH, window.location.origin).toString();
}
