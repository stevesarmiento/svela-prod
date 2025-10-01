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
import { ConvexProvider } from "@v1/convex/provider";
import { WatchlistProvider } from "@/app/[locale]/(dashboard)/watchlist/_components/watchlist-context";
import { ThemeProvider } from "./theme-provider";
import { NotifToaster } from "@v1/ui/sonner-notif";
import { ChatToast } from "@/components/chat/chat-toast";

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

  const arcConfig = useMemo(() => ({
    network: (process.env.NEXT_PUBLIC_SOLANA_NETWORK as 'mainnet' | 'devnet' | 'testnet' | undefined) || 'mainnet',
    rpcUrl:
      (process.env.NEXT_PUBLIC_SOLANA_RPC_URL && process.env.NEXT_PUBLIC_SOLANA_RPC_URL.trim()) ||
      ((process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'devnet')
        ? 'https://api.devnet.solana.com'
        : (process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'testnet')
          ? 'https://api.testnet.solana.com'
          : 'https://api.mainnet-beta.solana.com'),
    autoConnect: true,
    providers: [
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
    ],
  }), []);

  const connectorConfig = useMemo(() => getDefaultConfig({
    appName: 'Svela',
    appUrl: 'https://svela.so',
    network: (process.env.NEXT_PUBLIC_SOLANA_NETWORK as 'mainnet-beta' | 'devnet' | 'testnet') || 'mainnet-beta',
    enableMobile: true,
  }), []);

  const mobile = useMemo(() => getDefaultMobileConfig({
    appName: 'Svela',
    appUrl: 'https://svela.so',
    network: (process.env.NEXT_PUBLIC_SOLANA_NETWORK as 'mainnet-beta' | 'devnet' | 'testnet') || 'mainnet-beta',
  }), []);

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
          <ArmaProvider config={arcConfig} queryClient={queryClient} useConnector={useConnectorClient}>
            <ConvexProvider>
              <WatchlistProvider>
                <ThemeProvider>
                  {children}
                  
                  <ChatToast />
                  <NotifToaster 
                    position="top-center" 
                    offset={-10}
                  />
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