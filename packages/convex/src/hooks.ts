"use client";

import { useUser, useClerk, useSignIn } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../apps/app/convex/_generated/api.js";

// Auth hooks using Clerk
export function useAuth() {
  const { user, isLoaded } = useUser();
  const clerk = useClerk();
  const { signIn: clerkSignIn } = useSignIn();
  
  return {
    user: user ? {
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress,
      fullName: user.fullName,
      avatarUrl: user.imageUrl,
    } : null,
    signIn: (provider?: string) => {
      if (provider === 'google' && clerkSignIn) {
        // Direct redirect to Google OAuth without modal using authenticateWithRedirect
        clerkSignIn.authenticateWithRedirect({
          strategy: "oauth_google",
          redirectUrl: "/sso-callback",
          redirectUrlComplete: "/watchlist"
        });
      } else {
        // Fallback to modal for other providers or no provider specified
        clerk.openSignIn({
          appearance: {
            baseTheme: undefined,
          }
        });
      }
    },
    signOut: () => clerk.signOut(),
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

// Watchlist Groups hooks
export function useWatchlistGroups() {
  const { user } = useUser();
  return useQuery(api.watchlists.getWatchlistGroups,
    user?.id ? { clerkId: user.id } : "skip"
  );
}

export function useWatchlistByGroup(groupId?: string) {
  const { user } = useUser();
  return useQuery(api.watchlists.getWatchlistByGroup,
    user?.id && groupId ? { clerkId: user.id, groupId: groupId as any } : "skip"
  );
}

export function useWatchlistBySlug(slug?: string) {
  const { user } = useUser();
  return useQuery(api.watchlists.getWatchlistBySlug,
    user?.id && slug ? { clerkId: user.id, slug } : "skip"
  );
}

export function useWatchlistGroupBySlug(slug?: string) {
  const { user } = useUser();
  return useQuery(api.watchlists.getWatchlistGroupBySlug,
    user?.id && slug ? { clerkId: user.id, slug } : "skip"
  );
}

export function useCreateWatchlistGroup() {
  const { user } = useUser();
  const mutation = useMutation(api.watchlists.createWatchlistGroup);
  
  return (name: string, description?: string, icon?: string, color?: string) => {
    if (!user?.id) throw new Error("User not authenticated");
    return mutation({ clerkId: user.id, name, description, icon, color });
  };
}

export function useUpdateWatchlistGroup() {
  const { user } = useUser();
  const mutation = useMutation(api.watchlists.updateWatchlistGroup);
  
  return (groupId: string, name?: string, description?: string, icon?: string, color?: string) => {
    if (!user?.id) throw new Error("User not authenticated");
    return mutation({ clerkId: user.id, groupId: groupId as any, name, description, icon, color });
  };
}

export function useDeleteWatchlistGroup() {
  const { user } = useUser();
  const mutation = useMutation(api.watchlists.deleteWatchlistGroup);
  
  return (groupId: string) => {
    if (!user?.id) throw new Error("User not authenticated");
    return mutation({ clerkId: user.id, groupId: groupId as any });
  };
}

export function useAddToWatchlistGroup() {
  const { user } = useUser();
  const mutation = useMutation(api.watchlists.addToWatchlist);
  
  return (coinId: string, groupId?: string) => {
    if (!user?.id) throw new Error("User not authenticated");
    return mutation({ clerkId: user.id, coinId, groupId: groupId as any });
  };
}

export function useRemoveFromWatchlistGroup() {
  const { user } = useUser();
  const mutation = useMutation(api.watchlists.removeFromWatchlist);
  
  return (coinId: string, groupId?: string) => {
    if (!user?.id) throw new Error("User not authenticated");
    return mutation({ clerkId: user.id, coinId, groupId: groupId as any });
  };
}