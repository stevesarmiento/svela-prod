"use client";

import { ClerkProvider, useUser } from "@clerk/nextjs";
import { isRetryableQueryError } from "@/lib/effect/query-errors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, domMax } from "motion/react";
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
          // One retry is enough for transient blips; deterministic failures
          // (4xx, decode errors, already-rate-limited) will not improve on
          // retry, so skip them entirely. Typed on Effect error tags with a
          // message-regex fallback for legacy untyped errors.
          retry: (failureCount, error) => {
            if (!isRetryableQueryError(error)) return false;
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
            {/* domMax (not domAnimation): navigation-dock uses layoutId layout projection. */}
            <LazyMotion features={domMax}>
              {children}
              <LazyNotifToaster />
            </LazyMotion>
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
