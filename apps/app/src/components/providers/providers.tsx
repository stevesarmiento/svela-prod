"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { NuqsAdapter } from "nuqs/adapters/next/app";
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
        <NuqsAdapter>
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
        </NuqsAdapter>
      </QueryClientProvider>
    </ClerkProvider>
  );
}