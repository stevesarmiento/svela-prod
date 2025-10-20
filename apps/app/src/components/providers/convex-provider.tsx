"use client";

import React, { useEffect, useState, type ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexProvider as BaseConvexProvider, useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "../../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured");
}

const convexClient = new ConvexReactClient(convexUrl, {
  unsavedChangesWarning: false,
});

interface ConvexProviderProps {
  children: ReactNode;
}

function AuthenticatedUserSync({ children }: ConvexProviderProps) {
  const { user, isLoaded } = useUser();
  const createUser = useMutation(api.users.createUser);
  const [hasSynced, setHasSynced] = useState(false);

  useEffect(() => {
    if (!isLoaded || !user || hasSynced) return;

    const syncUser = async () => {
      try {
        await createUser({
          clerkId: user.id,
          email: user.emailAddresses[0]?.emailAddress ?? "",
          fullName: user.fullName ?? undefined,
          avatarUrl: user.imageUrl ?? undefined,
        });
        setHasSynced(true);
      } catch (error) {
        console.error("[Convex] Failed to sync user", error);
      }
    };

    void syncUser();
  }, [user, isLoaded, hasSynced, createUser]);

  return <>{children}</>;
}

export function ConvexProvider({ children }: ConvexProviderProps) {
  const Provider = BaseConvexProvider as React.FC<{ client: ConvexReactClient; children: ReactNode }>;
  return (
    <Provider client={convexClient}>
      <AuthenticatedUserSync>{children}</AuthenticatedUserSync>
    </Provider>
  );
}

