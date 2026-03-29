"use client";

import React, { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { api } from "../../../convex/_generated/api";

interface ConvexProviderProps {
  children: ReactNode;
}

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured");

const convex = new ConvexReactClient(convexUrl);

function UserBootstrap({ children }: ConvexProviderProps) {
  const { user, isLoaded: isClerkLoaded } = useUser();
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const upsertCurrentUser = useMutation(api.users.upsertCurrentUser);

  const lastBootstrappedUserId = useRef<string | null>(null);

  const bootstrapPayload = useMemo(() => {
    if (!user) return null;
    const email = user.emailAddresses[0]?.emailAddress ?? "";
    return {
      userId: user.id,
      email,
      fullName: user.fullName ?? undefined,
      avatarUrl: user.imageUrl ?? undefined,
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
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <UserBootstrap>{children}</UserBootstrap>
    </ConvexProviderWithClerk>
  );
}

