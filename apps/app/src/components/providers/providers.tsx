"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useMemo, useState } from "react";
import { createProvider, ArmaProvider } from "@armadura/sdk";
import { createTitan } from "@armadura/titan";
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
        createTitan({
          // apiKey automatically loaded from NEXT_PUBLIC_TITAN_API_KEY env var
          slippageBps: 50,
          strategy: 'best-price',
          onlyDirectRoutes: false,
          excludeDexes: [],
          accountsLimitTotal: 64,
          quoteTimeoutMs: 15_000,
          intervalMs: 1000,
          numQuotes: 5,
          debug: process.env.NODE_ENV === 'development',
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
          <ArmaProvider 
            config={{
              network: network as 'mainnet' | 'devnet' | 'testnet',
              rpcUrl,
              autoConnect: true,
              providers,
              debug: process.env.NODE_ENV === 'development',
            }}
            queryClient={queryClient}
            useConnector={useConnectorClient}
          >
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