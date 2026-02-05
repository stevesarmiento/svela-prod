"use client";

import { ReactNode, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";

// Component to handle user storage after authentication
function AuthenticatedUserHandler({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const [userSynced, setUserSynced] = useState(false);

  useEffect(() => {
    setUserSynced(false);
  }, [user?.id]);

  useEffect(() => {
    const syncUser = async () => {
      if (!isLoaded || !user || userSynced) {
        console.log("Skipping user sync:", { isLoaded, hasUser: !!user, userSynced });
        return;
      }

      try {
        console.log("Syncing user to Convex:", user.id);

        const response = await fetch("/api/internal/users/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (!response.ok) throw new Error("User sync failed");
        
        console.log("User synced successfully");
        setUserSynced(true);
      } catch (error) {
        console.error("Error syncing user:", error);
        // Don't set userSynced to true on error, allow retry
      }
    };

    syncUser();
  }, [user, isLoaded, userSynced]);

  return <>{children}</>;
}

export function ConvexProvider({ children }: { children: ReactNode }) {
  return <AuthenticatedUserHandler>{children}</AuthenticatedUserHandler>;
}