"use client";

import { useUser, useClerk, useSignIn } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WatchlistApi } from "@/lib/effect/watchlist-api";
import { runPromise } from "@/lib/effect/runtime-watchlist";
import type { WatchlistGroup, WatchlistItem } from "@/lib/effect/watchlist-models";

export function useAuth() {
  const { user, isLoaded } = useUser();
  const clerk = useClerk();
  const { signIn: clerkSignIn } = useSignIn();

  return {
    user: user
      ? {
          id: user.id,
          email: user.emailAddresses[0]?.emailAddress,
          fullName: user.fullName,
          avatarUrl: user.imageUrl,
        }
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
  const enabled = Boolean(isLoaded && user?.id);

  const { data } = useQuery<Array<WatchlistItem>>({
    queryKey: ["watchlists", "default"],
    queryFn: async () => runPromise(WatchlistApi.listItems()),
    enabled,
  });

  return data;
}

export function useWatchlistGroups() {
  const { user, isLoaded } = useUser();
  const enabled = Boolean(isLoaded && user?.id);

  const { data } = useQuery<Array<WatchlistGroup>>({
    queryKey: ["watchlists", "groups"],
    queryFn: async () => runPromise(WatchlistApi.listGroups()),
    enabled,
  });

  return data;
}

export function useWatchlistByGroup(groupId?: string) {
  const { user, isLoaded } = useUser();
  const enabled = Boolean(isLoaded && user?.id && groupId);

  const { data } = useQuery<Array<WatchlistItem>>({
    queryKey: ["watchlists", "group", groupId],
    queryFn: async () => runPromise(WatchlistApi.listItems(String(groupId))),
    enabled,
  });

  return data;
}

export function useWatchlistBySlug(slug?: string) {
  const { user, isLoaded } = useUser();
  const enabled = Boolean(isLoaded && user?.id && slug);

  const { data } = useQuery<{ group: WatchlistGroup; items: Array<WatchlistItem> } | null>({
    queryKey: ["watchlists", "slug", slug],
    queryFn: async () => runPromise(WatchlistApi.getBySlug(String(slug))),
    enabled,
  });

  return data;
}

export function useCreateWatchlistGroup() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string;
      icon?: string;
      color?: string;
    }) => runPromise(WatchlistApi.createGroup(input)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
  });

  return (name: string, description?: string, icon?: string, color?: string) =>
    mutation.mutateAsync({ name, description, icon, color });
}

export function useUpdateWatchlistGroup() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: {
      groupId: string;
      name?: string;
      description?: string;
      icon?: string;
      color?: string;
    }) =>
      runPromise(
        WatchlistApi.updateGroup(String(input.groupId), {
          name: input.name,
          description: input.description,
          icon: input.icon,
          color: input.color,
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
  });

  return (
    groupId: string,
    name?: string,
    description?: string,
    icon?: string,
    color?: string,
  ) => mutation.mutateAsync({ groupId, name, description, icon, color });
}

export function useDeleteWatchlistGroup() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: { groupId: string }) =>
      runPromise(WatchlistApi.deleteGroup(String(input.groupId))),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
  });

  return (groupId: string) => mutation.mutateAsync({ groupId });
}

export function useAddToWatchlistGroup() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: { coinId: string; groupId?: string }) =>
      runPromise(
        WatchlistApi.addItem({
          coinId: input.coinId,
          groupId: input.groupId ? String(input.groupId) : undefined,
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
  });

  return (coinId: string, groupId?: string) =>
    mutation.mutateAsync({ coinId, groupId });
}

export function useRemoveFromWatchlistGroup() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: { coinId: string; groupId?: string }) =>
      runPromise(
        WatchlistApi.removeItem({
          coinId: input.coinId,
          groupId: input.groupId ? String(input.groupId) : undefined,
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
  });

  return (coinId: string, groupId?: string) =>
    mutation.mutateAsync({ coinId, groupId });
}

export function useRemoveBulkFromWatchlist() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: { coinIds: string[]; groupId?: string }) =>
      runPromise(
        WatchlistApi.removeItemsBulk({
          coinIds: input.coinIds,
          groupId: input.groupId ? String(input.groupId) : undefined,
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
  });

  return (coinIds: string[], groupId?: string) =>
    mutation.mutateAsync({ coinIds, groupId });
}

