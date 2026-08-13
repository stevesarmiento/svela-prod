import { Effect, Tracer } from "effect"
import { CoinGeckoApi } from "./coingecko-api"
import { sentryTracer } from "./sentry-tracer"

/**
 * Client runtime boundary for CoinGecko Effects.
 *
 * Keeps the client bundle smaller by only providing `CoinGeckoApi`.
 */

function provideCoinGecko<A, E>(effect: Effect.Effect<A, E, CoinGeckoApi>): Effect.Effect<A, E, never> {
  return effect.pipe(
    Effect.provide(CoinGeckoApi.layer),
    Effect.provideService(Tracer.Tracer, sentryTracer),
  )
}

export function runPromise<A, E>(
  effect: Effect.Effect<A, E, CoinGeckoApi>,
  options?: { signal?: AbortSignal },
): Promise<A> {
  return Effect.runPromise(provideCoinGecko(effect), options)
}
