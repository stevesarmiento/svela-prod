"use client";

import { useUser, useClerk, useSignIn } from "@clerk/nextjs";
import { useMutation, useQuery, useConvexAuth } from "convex/react";
import type { WatchlistGroup, WatchlistItem } from "@/lib/effect/watchlist-models";
import { useCallback } from "react";
import { api } from "../../convex/_generated/api";

interface AuthUser {
  id: string;
  email?: string;
  fullName?: string;
  avatarUrl?: string;
  createdAt?: Date | number | null;
}

export function useAuth() {
  const { user, isLoaded } = useUser();
  const clerk = useClerk();
  const { signIn: clerkSignIn } = useSignIn();

  return {
    user: user
      ? ({
          id: user.id,
          email: user.emailAddresses[0]?.emailAddress,
          fullName: user.fullName ?? undefined,
          avatarUrl: user.imageUrl,
          createdAt: user.createdAt ?? null,
        } satisfies AuthUser)
      : null,
    signIn: (provider?: string) => {
      if (provider === "google" && clerkSignIn) {
        clerkSignIn.authenticateWithRedirect({
          strategy: "oauth_google",
          redirectUrl: "/sso-callback",
          redirectUrlComplete: "/watchlist",
        });
      } else {
        clerk.openSignIn({
          appearance: {
            baseTheme: undefined,
          },
        });
      }
    },
    signOut: () => clerk.signOut(),
    isLoading: !isLoaded,
    isAuthenticated: !!user,
  };
}

export function useWatchlist() {
  const { user, isLoaded } = useUser();
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const enabled = Boolean(isLoaded && user?.id && isAuthenticated && !isConvexAuthLoading);

  const data = useQuery(
    api.watchlists.getMyDefaultWatchlist,
    enabled ? {} : "skip",
  ) as Array<WatchlistItem> | undefined;

  return data;
}

export function useWatchlistGroups() {
  const { user, isLoaded } = useUser();
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const enabled = Boolean(isLoaded && user?.id && isAuthenticated && !isConvexAuthLoading);

  const data = useQuery(
    api.watchlists.listMyWatchlistGroups,
    enabled ? {} : "skip",
  ) as Array<WatchlistGroup> | undefined;

  return data;
}

export function useWatchlistByGroup(groupId?: string) {
  const { user, isLoaded } = useUser();
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const enabled = Boolean(isLoaded && user?.id && groupId && isAuthenticated && !isConvexAuthLoading);

  const data = useQuery(
    api.watchlists.getMyWatchlistByGroup,
    enabled ? { groupId: groupId as any } : "skip",
  ) as Array<WatchlistItem> | undefined;

  return data;
}

export function useWatchlistBySlug(slug?: string) {
  const { user, isLoaded } = useUser();
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const enabled = Boolean(isLoaded && user?.id && slug && isAuthenticated && !isConvexAuthLoading);

  const data = useQuery(
    api.watchlists.getMyWatchlistBySlug,
    enabled ? { slug: String(slug) } : "skip",
  ) as { group: WatchlistGroup; items: Array<WatchlistItem> } | null | undefined;

  return data;
}

export function useAllWatchlistCoinIds(options?: { enabled?: boolean }) {
  const { user, isLoaded } = useUser();
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const enabled = Boolean(
    (options?.enabled ?? true) &&
      isLoaded &&
      user?.id &&
      isAuthenticated &&
      !isConvexAuthLoading,
  );

  const data = useQuery(
    api.watchlists.getMyAllWatchlistCoinIds,
    enabled ? {} : "skip",
  ) as Array<string> | undefined;

  return data;
}

export function useCreateWatchlistGroup() {
  const create = useMutation(api.watchlists.createMyWatchlistGroup);
  return (name: string, description?: string, icon?: string, color?: string) =>
    create({ name, description, icon, color });
}

export function useUpdateWatchlistGroup() {
  const update = useMutation(api.watchlists.updateMyWatchlistGroup);
  return (
    groupId: string,
    name?: string,
    description?: string,
    icon?: string,
    color?: string,
  ) => update({ groupId: groupId as any, name, description, icon, color });
}

export function useDeleteWatchlistGroup() {
  const del = useMutation(api.watchlists.deleteMyWatchlistGroup);
  return (groupId: string) => del({ groupId: groupId as any });
}

export function useAddToWatchlistGroup() {
  const add = useMutation(api.watchlists.addToMyWatchlist);
  return (coinId: string, groupId?: string) =>
    add({ coinId, groupId: groupId ? (groupId as any) : undefined });
}

export function useRemoveFromWatchlistGroup() {
  const remove = useMutation(api.watchlists.removeFromMyWatchlist);
  return (coinId: string, groupId?: string) =>
    remove({ coinId, groupId: groupId ? (groupId as any) : undefined });
}

export function useRemoveBulkFromWatchlist() {
  const bulkRemove = useMutation(api.watchlists.removeBulkFromMyWatchlist);
  return (coinIds: string[], groupId?: string) =>
    bulkRemove({ coinIds, groupId: groupId ? (groupId as any) : undefined });
}

export function useRemoveFromAllWatchlists() {
  const removeEverywhere = useMutation(api.watchlists.removeFromAllMyWatchlists);
  return useCallback((coinId: string) => removeEverywhere({ coinId }), [removeEverywhere]);
}

export function useRemoveBulkFromAllWatchlists() {
  const bulk = useMutation(api.watchlists.removeBulkFromAllMyWatchlists);
  return useCallback((coinIds: string[]) => bulk({ coinIds }), [bulk]);
}

