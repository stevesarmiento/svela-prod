import { Effect, Context, Schedule } from "effect"
import type { WatchlistGroup, CoinGeckoWatchlistCoin } from "./watchlist-models"
import { WatchlistAuthError, WatchlistNotFoundError, WatchlistValidationError, ApiRequestError } from "./watchlist-models"

export class WatchlistService extends Context.Tag("WatchlistService")<
  WatchlistService,
  {
    readonly getGroups: () => Effect.Effect<WatchlistGroup[], WatchlistAuthError | WatchlistNotFoundError>
    readonly getGroupById: (groupId: string) => Effect.Effect<WatchlistGroup, WatchlistNotFoundError>
    readonly updateGroup: (
      groupId: string,
      updates: { name?: string; description?: string; icon?: string; color?: string }
    ) => Effect.Effect<void, WatchlistValidationError | WatchlistAuthError>
    readonly deleteGroup: (groupId: string) => Effect.Effect<void, WatchlistNotFoundError | WatchlistAuthError>
    readonly getCoinsForGroup: (groupId: string) => Effect.Effect<CoinGeckoWatchlistCoin[], ApiRequestError>
  }
>() {}

// Service implementation wrapping existing Convex hooks
export const makeWatchlistService = (
  userId: string | undefined,
  convexHooks: {
    getGroups: () => Promise<any[]>
    updateGroup: (id: string, updates: any) => Promise<void>
    deleteGroup: (id: string) => Promise<void>
    getWatchlistByGroup: (id: string) => Promise<any[]>
  }
) => ({
  getGroups: () =>
    Effect.tryPromise({
      try: () => convexHooks.getGroups(),
      catch: () => new WatchlistNotFoundError({ groupId: "all", message: "Failed to fetch groups" })
    }).pipe(
      Effect.retry(Schedule.exponential("100 millis", 2)),
      Effect.timeout("10 seconds")
    ),
    
  getGroupById: (groupId: string) =>
    Effect.tryPromise({
      try: async () => {
        const groups = await convexHooks.getGroups()
        const group = groups.find((g: any) => g._id === groupId)
        if (!group) throw new Error("Group not found")
        return group
      },
      catch: () => new WatchlistNotFoundError({ groupId, message: "Group not found" })
    }),
    
  updateGroup: (groupId: string, updates: { name?: string; description?: string; icon?: string; color?: string }) =>
    Effect.gen(function* () {
      if (updates.name && updates.name.length < 1) {
        yield* Effect.fail(new WatchlistValidationError({ field: "name", reason: "Name cannot be empty" }))
      }
      if (!userId) {
        yield* Effect.fail(new WatchlistAuthError({ message: "User not authenticated" }))
      }
      yield* Effect.tryPromise({
        try: () => convexHooks.updateGroup(groupId, updates),
        catch: () => new WatchlistValidationError({ field: "update", reason: "Failed to update" })
      })
    }).pipe(
      Effect.retry(Schedule.exponential("100 millis", 2)),
      Effect.timeout("5 seconds")
    ),
    
  deleteGroup: (groupId: string) =>
    Effect.tryPromise({
      try: () => convexHooks.deleteGroup(groupId),
      catch: () => new WatchlistNotFoundError({ groupId, message: "Failed to delete" })
    }).pipe(
      Effect.retry(Schedule.exponential("100 millis", 2)),
      Effect.timeout("5 seconds")
    ),
    
  getCoinsForGroup: (groupId: string) =>
    Effect.gen(function* () {
      const watchlist = yield* Effect.tryPromise({
        try: () => convexHooks.getWatchlistByGroup(groupId),
        catch: () => new ApiRequestError({ endpoint: "watchlist", status: 500, message: "Failed to get watchlist" })
      })
      
      const coinIds = watchlist?.map((item: any) => item.coinId) || []
      
      if (coinIds.length === 0) return []
      
      // Fetch with parallel execution and concurrency limit
      const coins = yield* Effect.tryPromise({
        try: async () => {
          const response = await fetch(`/api/coingecko/quotes?ids=${coinIds.join(',')}`)
          if (!response.ok) throw new Error(`API error: ${response.status}`)
          const data = await response.json()
          return Object.values(data.data || {}).map((coin: any) => ({
            id: coin.id,
            name: coin.name,
            symbol: coin.symbol,
            slug: coin.id,
            image: coin.image || '',
            cmc_rank: coin.market_cap_rank || 0,
            circulating_supply: 0,
            max_supply: null,
            quote: {
              USD: {
                price: coin.current_price || 0,
                percent_change_24h: coin.price_change_percentage_24h || 0,
                percent_change_1h: coin.price_change_percentage_1h_in_currency || 0,
                percent_change_7d: coin.price_change_percentage_7d_in_currency || 0,
                percent_change_30d: coin.price_change_percentage_30d_in_currency || 0,
                market_cap: coin.market_cap || 0,
                volume_24h: coin.total_volume || 0,
              }
            }
          }))
        },
        catch: (e) => new ApiRequestError({ 
          endpoint: `/api/coingecko/quotes`, 
          status: 500, 
          message: String(e) 
        })
      })
      
      return coins
    }).pipe(
      Effect.retry(Schedule.exponential("200 millis", 2)),
      Effect.timeout("10 seconds")
    )
})

