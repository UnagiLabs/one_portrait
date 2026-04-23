// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  registerEnokiWalletsMock,
  queryClientProviderMock,
  suiClientProviderMock,
  walletProviderMock,
  useSuiClientContextMock,
} = vi.hoisted(() => ({
  registerEnokiWalletsMock: vi.fn(() => ({ unregister: vi.fn(), wallets: {} })),
  queryClientProviderMock: vi.fn(),
  suiClientProviderMock: vi.fn(),
  walletProviderMock: vi.fn(),
  useSuiClientContextMock: vi.fn(() => ({
    client: { network: "testnet" },
    network: "testnet",
  })),
}));

vi.mock("@mysten/enoki", () => ({
  isEnokiNetwork: (network: string) => network === "testnet",
  registerEnokiWallets: registerEnokiWalletsMock,
}));

vi.mock("@tanstack/react-query", () => ({
  QueryClient: class {},
  QueryClientProvider: ({
    children,
  }: {
    readonly children: React.ReactNode;
  }) => {
    queryClientProviderMock();
    return <>{children}</>;
  },
}));

vi.mock("@mysten/dapp-kit", () => ({
  SuiClientProvider: ({ children }: { readonly children: React.ReactNode }) => {
    suiClientProviderMock();
    return <>{children}</>;
  },
  WalletProvider: ({ children }: { readonly children: React.ReactNode }) => {
    walletProviderMock();
    return <>{children}</>;
  },
  useSuiClientContext: () => useSuiClientContextMock(),
}));

import { AppWalletProvider, useEnokiConfigState } from "./provider";

function StateProbe(): React.ReactElement {
  const state = useEnokiConfigState();

  return (
    <div
      data-submit-enabled={String(state.submitEnabled)}
      data-testid="enoki-state"
      data-wallet-provider={String(state.walletProviderAvailable)}
    />
  );
}

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  registerEnokiWalletsMock.mockClear();
  queryClientProviderMock.mockClear();
  suiClientProviderMock.mockClear();
  walletProviderMock.mockClear();
  useSuiClientContextMock.mockClear();
});

describe("AppWalletProvider", () => {
  it("registers the Google Enoki wallet when submit env is present", () => {
    process.env.NEXT_PUBLIC_SUI_NETWORK = "testnet";
    process.env.NEXT_PUBLIC_REGISTRY_OBJECT_ID = "0xreg";
    process.env.NEXT_PUBLIC_PACKAGE_ID = "0xpkg";
    process.env.NEXT_PUBLIC_ENOKI_API_KEY = "public-key";
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "google-client-id";

    render(
      <AppWalletProvider>
        <StateProbe />
      </AppWalletProvider>,
    );

    expect(registerEnokiWalletsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "public-key",
        network: "testnet",
        providers: {
          google: {
            clientId: "google-client-id",
            redirectUrl: "http://localhost:3000/auth/enoki/callback",
          },
        },
      }),
    );
    expect(screen.getByTestId("enoki-state").getAttribute("data-wallet-provider")).toBe(
      "true",
    );
  });

  it("keeps the provider mounted without registering wallets when submit env is missing", () => {
    process.env.NEXT_PUBLIC_SUI_NETWORK = "testnet";
    process.env.NEXT_PUBLIC_REGISTRY_OBJECT_ID = "0xreg";
    process.env.NEXT_PUBLIC_PACKAGE_ID = "";
    process.env.NEXT_PUBLIC_ENOKI_API_KEY = "";
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "";

    render(
      <AppWalletProvider>
        <StateProbe />
      </AppWalletProvider>,
    );

    expect(queryClientProviderMock).toHaveBeenCalled();
    expect(suiClientProviderMock).toHaveBeenCalled();
    expect(walletProviderMock).toHaveBeenCalled();
    expect(registerEnokiWalletsMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("enoki-state").getAttribute("data-submit-enabled")).toBe(
      "false",
    );
    expect(screen.getByTestId("enoki-state").getAttribute("data-wallet-provider")).toBe(
      "true",
    );
  });

  it("skips the wallet provider when public env is missing", () => {
    process.env.NEXT_PUBLIC_SUI_NETWORK = "";
    process.env.NEXT_PUBLIC_REGISTRY_OBJECT_ID = "";
    process.env.NEXT_PUBLIC_PACKAGE_ID = "0xpkg";
    process.env.NEXT_PUBLIC_ENOKI_API_KEY = "public-key";
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "google-client-id";

    render(
      <AppWalletProvider>
        <StateProbe />
      </AppWalletProvider>,
    );

    expect(queryClientProviderMock).not.toHaveBeenCalled();
    expect(suiClientProviderMock).not.toHaveBeenCalled();
    expect(walletProviderMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("enoki-state").getAttribute("data-submit-enabled")).toBe(
      "false",
    );
    expect(screen.getByTestId("enoki-state").getAttribute("data-wallet-provider")).toBe(
      "false",
    );
  });
});
