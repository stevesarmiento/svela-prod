"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ConvexProvider } from "./convex-provider";
import { WatchlistProvider } from "@/app/[locale]/(dashboard)/watchlist/_components/watchlist-context"; // cspell:disable-line
import { ThemeProvider } from "./theme-provider";
import { NotifToaster } from "@v1/ui/sonner-notif";

const ReactQueryDevtools =
  process.env.NODE_ENV === "development"
    ? dynamic(
        () =>
          import("@tanstack/react-query-devtools").then(
            (module) => module.ReactQueryDevtools,
          ),
        { ssr: false },
      )
    : null;

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
                <NotifToaster position="top-center" offset={-10} />
                {ReactQueryDevtools ? (
                  <ReactQueryDevtools initialIsOpen={false} />
                ) : null}
              </ThemeProvider>
            </WatchlistProvider>
          </ConvexProvider>
        </NuqsAdapter>
      </QueryClientProvider>
    </ClerkProvider>
  );
}