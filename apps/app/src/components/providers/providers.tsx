"use client";

import { ClerkProvider, useUser } from "@clerk/nextjs";
import {
  QueryClient,
  type Query,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
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

function shouldPersistQuery(query: Query): boolean {
  if (query.state.status !== "success") return false;
  const key0 = query.queryKey[0];
  if (key0 === "watchlists") return true;
  if (key0 === "coingecko-quotes") return true;
  if (key0 === "coingecko-quote") return true;
  return false;
}

function PersistedQueryProvider({ children }: ProvidersProps) {
  const { user } = useUser();
  const userId = user?.id ?? "anonymous";

  const queryClient = useMemo(() => {
    return new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000,
          refetchOnWindowFocus: true,
          retry: 3,
          gcTime: ONE_DAY_MS,
        },
      },
    });
  }, [userId]);

  const persister = useMemo(() => {
    const storage = typeof window !== "undefined" ? window.localStorage : undefined;
    return createAsyncStoragePersister({
      storage,
      key: `REACT_QUERY_OFFLINE_CACHE:${userId}`,
    });
  }, [userId]);

  const buster =
    process.env.NEXT_PUBLIC_APP_BUSTER ??
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
    process.env.NEXT_PUBLIC_BUILD_ID ??
    "local";

  return (
    <PersistQueryClientProvider
      // Remount per user to avoid any cross-user cache bleed.
      key={userId}
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: ONE_DAY_MS,
        buster,
        dehydrateOptions: {
          shouldDehydrateQuery: shouldPersistQuery,
        },
      }}
      onSuccess={() => {
        void queryClient.resumePausedMutations();
      }}
    >
      {children}
    </PersistQueryClientProvider>
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
      <PersistedQueryProvider>
        <NuqsAdapter>
          <ConvexProvider>
            {children}
            <LazyNotifToaster />
            {ReactQueryDevtools ? <ReactQueryDevtools initialIsOpen={false} /> : null}
          </ConvexProvider>
        </NuqsAdapter>
      </PersistedQueryProvider>
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
