"use client";

import { ReactNode, useEffect, useState } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexProvider as BaseConvexProvider } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";

if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
  throw new Error("Missing NEXT_PUBLIC_CONVEX_URL in your .env file");
}

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL);

// Component to handle user storage after authentication
function AuthenticatedUserHandler({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const createUser = useMutation(api.users.createUser);
  const [userSynced, setUserSynced] = useState(false);

  useEffect(() => {
    const syncUser = async () => {
      if (!isLoaded || !user || userSynced) {
        console.log("Skipping user sync:", { isLoaded, hasUser: !!user, userSynced });
        return;
      }

      try {
        console.log("Syncing user to Convex:", user.id);
        
        await createUser({
          clerkId: user.id,
          email: user.emailAddresses[0]?.emailAddress || "",
          fullName: user.fullName || undefined,
          avatarUrl: user.imageUrl || undefined,
        });
        
        console.log("User synced successfully");
        setUserSynced(true);
      } catch (error) {
        console.error("Error syncing user:", error);
        // Don't set userSynced to true on error, allow retry
      }
    };

    syncUser();
  }, [user, isLoaded, createUser, userSynced]);

  return <>{children}</>;
}

export function ConvexProvider({ children }: { children: ReactNode }) {
  return (
    <BaseConvexProvider client={convex}>
      <AuthenticatedUserHandler>
        {children}
      </AuthenticatedUserHandler>
    </BaseConvexProvider>
  );
}