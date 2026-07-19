"use client";

import { useAuth as useClerkAuth, useUser } from "@clerk/nextjs";
import { ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import React, { useEffect, useMemo, useRef, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";

interface ConvexProviderProps {
  children: ReactNode;
}

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured");

const convex = new ConvexReactClient(convexUrl);

function useAuthWithConvexTokenFallback(): ReturnType<typeof useClerkAuth> {
  const clerk = useClerkAuth();

  const getToken = React.useCallback<
    ReturnType<typeof useClerkAuth>["getToken"]
  >(
    async (options) => {
      const skipCache = options?.skipCache;

      // Try the Convex JWT template first (classic setup), then fall back to the
      // default token (Convex integration setup).
      const templated = await clerk
        .getToken({ template: "convex", skipCache })
        .catch(() => null);
      if (templated) return templated;

      return await clerk.getToken({ skipCache }).catch(() => null);
    },
    [clerk],
  );

  return React.useMemo(
    () => ({ ...clerk, getToken }) as ReturnType<typeof useClerkAuth>,
    [clerk, getToken],
  );
}

function UserBootstrap({ children }: ConvexProviderProps) {
  const { user, isLoaded: isClerkLoaded } = useUser();
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const upsertCurrentUser = useMutation(api.users.upsertCurrentUser);

  const lastBootstrappedUserId = useRef<string | null>(null);

  const bootstrapPayload = useMemo(() => {
    if (!user) return null;
    const email = user.emailAddresses[0]?.emailAddress?.trim() || undefined;
    const walletAddress =
      user.primaryWeb3Wallet?.web3Wallet ??
      user.web3Wallets[0]?.web3Wallet ??
      undefined;
    return {
      userId: user.id,
      email,
      fullName: user.fullName ?? undefined,
      avatarUrl: user.imageUrl ?? undefined,
      walletAddress,
    } as const;
  }, [user]);

  useEffect(() => {
    if (!isClerkLoaded) return;
    if (!bootstrapPayload) return;
    if (!isAuthenticated || isConvexAuthLoading) return;

    if (lastBootstrappedUserId.current === bootstrapPayload.userId) return;
    lastBootstrappedUserId.current = bootstrapPayload.userId;

    void upsertCurrentUser({
      email: bootstrapPayload.email,
      fullName: bootstrapPayload.fullName,
      avatarUrl: bootstrapPayload.avatarUrl,
      walletAddress: bootstrapPayload.walletAddress,
    });
  }, [
    isClerkLoaded,
    bootstrapPayload,
    isAuthenticated,
    isConvexAuthLoading,
    upsertCurrentUser,
  ]);

  return <>{children}</>;
}

export function ConvexProvider({ children }: ConvexProviderProps) {
  return (
    <ConvexProviderWithClerk
      client={convex}
      useAuth={useAuthWithConvexTokenFallback}
    >
      <UserBootstrap>{children}</UserBootstrap>
    </ConvexProviderWithClerk>
  );
}
