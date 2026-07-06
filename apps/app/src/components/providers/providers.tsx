"use client";

import { ClerkProvider, useUser } from "@clerk/nextjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type React from "react";
import { useMemo } from "react";
import { ConvexProvider } from "./convex-provider";

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

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function ScopedQueryProvider({ children }: ProvidersProps) {
  const { user } = useUser();
  const userId = user?.id ?? "anonymous";

  const queryClient = useMemo(() => {
    return new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000,
          refetchOnWindowFocus: true,
          // One retry is enough for transient blips; 4xx responses will
          // not improve on retry, so skip them entirely.
          retry: (failureCount, error) => {
            const message = error instanceof Error ? error.message : "";
            if (/\b4\d\d\b/.test(message)) return false;
            return failureCount < 1;
          },
          gcTime: ONE_DAY_MS,
        },
      },
    });
  }, [userId]);

  return (
    // Remount per user to avoid any cross-user cache bleed.
    <QueryClientProvider key={userId} client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      appearance={{
        variables: {
          colorPrimary: "#000000",
        },
      }}
    >
      <ScopedQueryProvider>
        <NuqsAdapter>
          <ConvexProvider>
            {children}
            <LazyNotifToaster />
            {ReactQueryDevtools ? <ReactQueryDevtools initialIsOpen={false} /> : null}
          </ConvexProvider>
        </NuqsAdapter>
      </ScopedQueryProvider>
    </ClerkProvider>
  );
}

const LazyNotifToaster = dynamic(
  () =>
    import("./notif-toaster-idle").then(
      (module) => module.NotifToasterIdle,
    ),
  { ssr: false, loading: () => null },
);
