"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useMemo, useState } from "react";
import { createProvider, ArmaProvider } from "@armadura/sdk";
import { createJupiter } from "@armadura/jupiter";
import { 
  AppProvider, 
  getDefaultConfig, 
  getDefaultMobileConfig,
  useConnectorClient
} from "@connector-kit/connector";
import { ClerkProvider } from "@clerk/nextjs";
import { ConvexProvider } from "./convex-provider";
import { WatchlistProvider } from "@/app/[locale]/(dashboard)/watchlist/_components/watchlist-context"; // cspell:disable-line
import { ThemeProvider } from "./theme-provider";
import { NotifToaster } from "@v1/ui/sonner-notif";
import { ChatToast } from "@/components/chat/chat-toast";
import { isAlphaFeaturesEnabled } from "@/lib/feature-flags";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            refetchInterval: 60 * 1000,
            refetchOnWindowFocus: true,
            retry: 3,
          },
        },
      })
  );

  // Single network config (accepts both 'mainnet' and 'mainnet-beta' formats)
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'mainnet-beta';
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;

  // ConnectorKit config (handles wallet UI)
  const connectorConfig = useMemo(() => getDefaultConfig({
    appName: 'Svela',
    appUrl: 'https://svela.so',
    network: network as 'mainnet-beta' | 'devnet' | 'testnet',
    enableMobile: true,
  }), [network]);

  const mobile = useMemo(() => getDefaultMobileConfig({
    appName: 'Svela',
    appUrl: 'https://svela.so',
    network: network as 'mainnet-beta' | 'devnet' | 'testnet',
  }), [network]);

  // Armadura protocol providers
  const providers = useMemo(() => [
    createProvider({
      swap: [
        createJupiter({
          slippageBps: 50,
          onlyDirectRoutes: false,
          excludeDexes: [],
          maxAccounts: 64,
          asLegacyTransaction: 'auto',
          walletSupportsVersioned: true,
          dynamicComputeUnitLimit: true,
          computeUnitPriceMicroLamports: 10_000,
          dynamicSlippage: true,
          timeoutMs: 15_000,
          retries: 2,
          debug: process.env.NODE_ENV === 'development',
          corsProxy: true,
        }),
      ],
    }),
  ], []);

  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      appearance={{
        variables: {
          colorPrimary: "#000000",
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <AppProvider connectorConfig={connectorConfig} mobile={mobile}>
          {/* Armadura uses ConnectorKit via manual hook (more reliable than auto-detection) */}
          <ArmaProvider 
            config={{
              network: network as 'mainnet' | 'devnet' | 'testnet',
              rpcUrl,
              autoConnect: true,
              providers,
              debug: process.env.NODE_ENV === 'development',
            }}
            queryClient={queryClient}
            // @ts-expect-error - connector type mismatch between @connector-kit and @armadura types
            useConnector={useConnectorClient}
          >
            <ConvexProvider>
              <WatchlistProvider>
                <ThemeProvider>
                  {children}
                  {isAlphaFeaturesEnabled() && <ChatToast />}
                  <NotifToaster position="top-center" offset={-10} />
                  <ReactQueryDevtools initialIsOpen={false} />
                </ThemeProvider>
              </WatchlistProvider>
            </ConvexProvider>
          </ArmaProvider>
        </AppProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}