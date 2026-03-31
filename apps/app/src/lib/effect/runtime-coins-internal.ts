import { Effect, type Exit, type Fiber } from "effect"
import { CoinsInternalApi } from "./coins-internal-api"

/**
 * Client runtime boundary for `/api/internal/coins/*` Effects.
 *
 * Keeps the client bundle smaller by only providing `CoinsInternalApi`.
 */

function provideCoinsInternal<A, E>(
  effect: Effect.Effect<A, E, CoinsInternalApi>,
): Effect.Effect<A, E, never> {
  return effect.pipe(Effect.provide(CoinsInternalApi.Default))
}

export function runPromise<A, E>(effect: Effect.Effect<A, E, CoinsInternalApi>): Promise<A> {
  return Effect.runPromise(provideCoinsInternal(effect))
}

export function runPromiseExit<A, E>(effect: Effect.Effect<A, E, CoinsInternalApi>): Promise<Exit.Exit<A, E>> {
  return Effect.runPromiseExit(provideCoinsInternal(effect))
}

export function runFork<A, E>(effect: Effect.Effect<A, E, CoinsInternalApi>): Fiber.RuntimeFiber<A, E> {
  return Effect.runFork(provideCoinsInternal(effect))
}

