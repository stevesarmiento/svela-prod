import { Effect, Tracer } from "effect"
import { CoinsInternalApi } from "./coins-internal-api"
import { sentryTracer } from "./sentry-tracer"

/**
 * Client runtime boundary for `/api/internal/coins/*` Effects.
 *
 * Keeps the client bundle smaller by only providing `CoinsInternalApi`.
 */

function provideCoinsInternal<A, E>(
  effect: Effect.Effect<A, E, CoinsInternalApi>,
): Effect.Effect<A, E, never> {
  return effect.pipe(
    Effect.provide(CoinsInternalApi.layer),
    Effect.provideService(Tracer.Tracer, sentryTracer),
  )
}

export function runPromise<A, E>(
  effect: Effect.Effect<A, E, CoinsInternalApi>,
  options?: { signal?: AbortSignal },
): Promise<A> {
  return Effect.runPromise(provideCoinsInternal(effect), options)
}
