import { Effect } from "effect"
import { WatchlistApi } from "@/lib/effect/watchlist-api"

export function useWatchlistOperations() {
  /**
   * Client-side watchlist operations as Effects.
   * Call-sites should run them using `runPromiseExit` from `@/lib/effect/runtime-watchlist`.
   */
  return {
    updateGroup: (
      groupId: string,
      name: string,
      description?: string,
      icon?: string,
      color?: string,
    ) =>
      WatchlistApi.updateGroup(groupId, { name, description, icon, color }).pipe(Effect.asVoid),
    deleteGroup: (groupId: string) => WatchlistApi.deleteGroup(groupId).pipe(Effect.asVoid),
  }
}

