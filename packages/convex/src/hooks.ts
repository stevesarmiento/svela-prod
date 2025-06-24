"use client";

import { useUser, useClerk } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../apps/app/convex/_generated/api.js";

// Auth hooks using Clerk
export function useAuth() {
  const { user, isLoaded } = useUser();
  const { signOut, openSignIn } = useClerk();
  
  return {
    user: user ? {
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress,
      fullName: user.fullName,
      avatarUrl: user.imageUrl,
    } : null,
    signIn: (provider?: string) => {
      openSignIn({
        appearance: {
          baseTheme: undefined,
        }
      });
    },
    signOut: () => signOut(),
    isLoading: !isLoaded,
    isAuthenticated: !!user,
  };
}

// User hooks - now passing clerkId manually
export function useCurrentUser() {
  const { user } = useUser();
  return useQuery(api.users.getCurrentUser, 
    user?.id ? { clerkId: user.id } : "skip"
  );
}

export function useUpdateUser() {
  return useMutation(api.users.updateUser);
}

export function useCreateUser() {
  return useMutation(api.users.createUser);
}

// Watchlist hooks - now passing clerkId manually
export function useWatchlist() {
  const { user } = useUser();
  return useQuery(api.watchlists.getWatchlist,
    user?.id ? { clerkId: user.id } : "skip"
  );
}

export function useAddToWatchlist() {
  const { user } = useUser();
  const mutation = useMutation(api.watchlists.addToWatchlist);
  
  return (coinId: string) => {
    if (!user?.id) throw new Error("User not authenticated");
    return mutation({ clerkId: user.id, coinId });
  };
}

export function useRemoveFromWatchlist() {
  const { user } = useUser();
  const mutation = useMutation(api.watchlists.removeFromWatchlist);
  
  return (coinId: string) => {
    if (!user?.id) throw new Error("User not authenticated");
    return mutation({ clerkId: user.id, coinId });
  };
}

export function useRemoveBulkFromWatchlist() {
  const { user } = useUser();
  const mutation = useMutation(api.watchlists.removeBulkFromWatchlist);
  
  return (coinIds: string[]) => {
    if (!user?.id) throw new Error("User not authenticated");
    return mutation({ clerkId: user.id, coinIds });
  };
}