import { Effect } from "effect"
import { CoinGlassApi } from "./coinglass-api"

/**
 * Client runtime boundary for CoinGlass Effects.
 *
 * Keeps the client bundle smaller by only providing `CoinGlassApi`.
 */

function provideCoinGlass<A, E>(effect: Effect.Effect<A, E, CoinGlassApi>): Effect.Effect<A, E, never> {
  return effect.pipe(Effect.provide(CoinGlassApi.layer))
}

export function runPromise<A, E>(effect: Effect.Effect<A, E, CoinGlassApi>): Promise<A> {
  return Effect.runPromise(provideCoinGlass(effect))
}
