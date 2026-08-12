import { Effect } from "effect"
import { CoinGeckoApi } from "./coingecko-api"

/**
 * Client runtime boundary for CoinGecko Effects.
 *
 * Keeps the client bundle smaller by only providing `CoinGeckoApi`.
 */

function provideCoinGecko<A, E>(effect: Effect.Effect<A, E, CoinGeckoApi>): Effect.Effect<A, E, never> {
  return effect.pipe(Effect.provide(CoinGeckoApi.layer))
}

export function runPromise<A, E>(effect: Effect.Effect<A, E, CoinGeckoApi>): Promise<A> {
  return Effect.runPromise(provideCoinGecko(effect))
}
