"use client";

import { useUser, useClerk, useSignIn } from "@clerk/nextjs";

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

function throwServerOnly(name: string): never {
  throw new Error(
    `${name} is not available in server-only Convex mode. ` +
      "Use your app's Next.js route handlers (e.g. /api/internal/*) instead.",
  );
}

// The rest of the previous Convex React hooks have been intentionally removed.
// This package is kept minimal since this repo now treats Convex as server-only.
export function useCurrentUser(): never {
  return throwServerOnly("useCurrentUser");
}
export function useUpdateUser(): never {
  return throwServerOnly("useUpdateUser");
}
export function useCreateUser(): never {
  return throwServerOnly("useCreateUser");
}
export function useWatchlist(): never {
  return throwServerOnly("useWatchlist");
}
export function useAddToWatchlist(): never {
  return throwServerOnly("useAddToWatchlist");
}
export function useRemoveFromWatchlist(): never {
  return throwServerOnly("useRemoveFromWatchlist");
}
export function useRemoveBulkFromWatchlist(): never {
  return throwServerOnly("useRemoveBulkFromWatchlist");
}
export function useWatchlistGroups(): never {
  return throwServerOnly("useWatchlistGroups");
}
export function useWatchlistByGroup(): never {
  return throwServerOnly("useWatchlistByGroup");
}
export function useWatchlistBySlug(): never {
  return throwServerOnly("useWatchlistBySlug");
}
export function useWatchlistGroupBySlug(): never {
  return throwServerOnly("useWatchlistGroupBySlug");
}
export function useCreateWatchlistGroup(): never {
  return throwServerOnly("useCreateWatchlistGroup");
}
export function useUpdateWatchlistGroup(): never {
  return throwServerOnly("useUpdateWatchlistGroup");
}
export function useDeleteWatchlistGroup(): never {
  return throwServerOnly("useDeleteWatchlistGroup");
}
export function useAddToWatchlistGroup(): never {
  return throwServerOnly("useAddToWatchlistGroup");
}
export function useRemoveFromWatchlistGroup(): never {
  return throwServerOnly("useRemoveFromWatchlistGroup");
}