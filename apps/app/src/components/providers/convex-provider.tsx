"use client";

import React, { useEffect, useState, type ReactNode } from "react";
import { useUser } from "@clerk/nextjs";

interface ConvexProviderProps {
  children: ReactNode;
}

function AuthenticatedUserSync({ children }: ConvexProviderProps) {
  const { user, isLoaded } = useUser();
  const [hasSynced, setHasSynced] = useState(false);

  useEffect(() => {
    // Reset sync state when the user changes.
    setHasSynced(false);
  }, [user?.id]);

  useEffect(() => {
    if (!isLoaded || !user || hasSynced) return;

    const syncUser = async () => {
      try {
        const response = await fetch("/api/internal/users/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(
            `User sync failed (${response.status} ${response.statusText})${body ? `: ${body}` : ""}`,
          );
        }
        setHasSynced(true);
      } catch (error) {
        console.error("[Convex] Failed to sync user", error);
      }
    };

    void syncUser();
  }, [user?.id, isLoaded, hasSynced]);

  return <>{children}</>;
}

export function ConvexProvider({ children }: ConvexProviderProps) {
  return (
    <AuthenticatedUserSync>{children}</AuthenticatedUserSync>
  );
}

