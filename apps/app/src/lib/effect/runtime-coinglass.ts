import { Effect, Tracer } from "effect"
import { CoinGlassApi } from "./coinglass-api"
import { sentryTracer } from "./sentry-tracer"

/**
 * Client runtime boundary for CoinGlass Effects.
 *
 * Keeps the client bundle smaller by only providing `CoinGlassApi`.
 */

function provideCoinGlass<A, E>(effect: Effect.Effect<A, E, CoinGlassApi>): Effect.Effect<A, E, never> {
  return effect.pipe(
    Effect.provide(CoinGlassApi.layer),
    Effect.provideService(Tracer.Tracer, sentryTracer),
  )
}

export function runPromise<A, E>(
  effect: Effect.Effect<A, E, CoinGlassApi>,
  options?: { signal?: AbortSignal },
): Promise<A> {
  return Effect.runPromise(provideCoinGlass(effect), options)
}
