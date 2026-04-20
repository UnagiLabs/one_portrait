"use client";

import { registerEnokiWallets, isEnokiNetwork } from "@mysten/enoki";
import {
  SuiClientProvider,
  WalletProvider,
  useSuiClientContext,
} from "@mysten/dapp-kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { loadPublicEnv } from "../env";
import { resolveFullnodeUrl } from "../sui/client";

import { canEnableSubmit, loadSubmitPublicEnv, type SubmitPublicEnv } from "./env";

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
  const readEnv = loadPublicEnv(process.env);
  const [queryClient] = useState(() => new QueryClient());
  const state = useMemo<EnokiConfigState>(() => {
    if (!canEnableSubmit(process.env)) {
      return {
        submitEnabled: false,
        reason: "submit-env-missing",
      };
    }

    return {
      submitEnabled: true,
      config: loadSubmitPublicEnv(process.env),
    };
  }, []);

  const networks = useMemo(
    () => ({
      [readEnv.suiNetwork]: {
        network: readEnv.suiNetwork,
        url: resolveFullnodeUrl(readEnv.suiNetwork),
      },
    }),
    [readEnv.suiNetwork],
  );

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
        },
      },
    });

    return unregister;
  }, [client, network, state]);

  return null;
}
