"use client";

import { useUser, useClerk, useSignIn } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Id } from "../../convex/_generated/dataModel";

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

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

  const { data } = useQuery({
    queryKey: ["watchlists", "default"],
    queryFn: async () =>
      fetchJson<Array<{ coinId: string }>>("/api/internal/watchlists/items"),
    enabled,
  });

  return data;
}

export function useWatchlistGroups() {
  const { user, isLoaded } = useUser();
  const enabled = Boolean(isLoaded && user?.id);

  const { data } = useQuery({
    queryKey: ["watchlists", "groups"],
    queryFn: async () => fetchJson<Array<any>>("/api/internal/watchlists/groups"),
    enabled,
  });

  return data;
}

export function useWatchlistByGroup(groupId?: Id<"watchlistGroups">) {
  const { user, isLoaded } = useUser();
  const enabled = Boolean(isLoaded && user?.id && groupId);

  const { data } = useQuery({
    queryKey: ["watchlists", "group", groupId],
    queryFn: async () =>
      fetchJson<Array<{ coinId: string }>>(
        `/api/internal/watchlists/items?groupId=${encodeURIComponent(String(groupId))}`,
      ),
    enabled,
  });

  return data;
}

export function useWatchlistBySlug(slug?: string) {
  const { user, isLoaded } = useUser();
  const enabled = Boolean(isLoaded && user?.id && slug);

  const { data } = useQuery({
    queryKey: ["watchlists", "slug", slug],
    queryFn: async () =>
      fetchJson<any>(
        `/api/internal/watchlists/by-slug?slug=${encodeURIComponent(String(slug))}`,
      ),
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
    }) =>
      fetchJson<{ id: string }>("/api/internal/watchlists/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
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
      groupId: Id<"watchlistGroups">;
      name?: string;
      description?: string;
      icon?: string;
      color?: string;
    }) =>
      fetchJson<{ success: true }>(
        `/api/internal/watchlists/groups/${encodeURIComponent(String(input.groupId))}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: input.name,
            description: input.description,
            icon: input.icon,
            color: input.color,
          }),
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
  });

  return (
    groupId: Id<"watchlistGroups">,
    name?: string,
    description?: string,
    icon?: string,
    color?: string,
  ) => mutation.mutateAsync({ groupId, name, description, icon, color });
}

export function useDeleteWatchlistGroup() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: { groupId: Id<"watchlistGroups"> }) =>
      fetchJson<{ success: true }>(
        `/api/internal/watchlists/groups/${encodeURIComponent(String(input.groupId))}`,
        { method: "DELETE" },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
  });

  return (groupId: Id<"watchlistGroups">) => mutation.mutateAsync({ groupId });
}

export function useAddToWatchlistGroup() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: { coinId: string; groupId?: Id<"watchlistGroups"> }) =>
      fetchJson<{ id: string }>("/api/internal/watchlists/items/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coinId: input.coinId,
          groupId: input.groupId,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
  });

  return (coinId: string, groupId?: Id<"watchlistGroups">) =>
    mutation.mutateAsync({ coinId, groupId });
}

export function useRemoveFromWatchlistGroup() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: { coinId: string; groupId?: Id<"watchlistGroups"> }) =>
      fetchJson<{ success: true }>("/api/internal/watchlists/items/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coinId: input.coinId,
          groupId: input.groupId,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
  });

  return (coinId: string, groupId?: Id<"watchlistGroups">) =>
    mutation.mutateAsync({ coinId, groupId });
}

export function useRemoveBulkFromWatchlist() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: { coinIds: string[]; groupId?: Id<"watchlistGroups"> }) =>
      fetchJson<{ removedCount: number }>("/api/internal/watchlists/items/remove-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coinIds: input.coinIds,
          groupId: input.groupId,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
  });

  return (coinIds: string[], groupId?: Id<"watchlistGroups">) =>
    mutation.mutateAsync({ coinIds, groupId });
}

