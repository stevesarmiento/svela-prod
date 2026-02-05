import { Effect, Exit, Fiber } from "effect"
import { CoinGeckoApi } from "./coingecko-api"

/**
 * Client runtime boundary for CoinGecko Effects.
 *
 * Keeps the client bundle smaller by only providing `CoinGeckoApi`.
 * Use `apps/app/src/lib/effect/runtime.ts` only when you truly need multiple services.
 */

function provideCoinGecko<A, E>(effect: Effect.Effect<A, E, CoinGeckoApi>): Effect.Effect<A, E, never> {
  return effect.pipe(Effect.provide(CoinGeckoApi.Default))
}

export function runPromise<A, E>(effect: Effect.Effect<A, E, CoinGeckoApi>): Promise<A> {
  return Effect.runPromise(provideCoinGecko(effect))
}

export function runPromiseExit<A, E>(effect: Effect.Effect<A, E, CoinGeckoApi>): Promise<Exit.Exit<A, E>> {
  return Effect.runPromiseExit(provideCoinGecko(effect))
}

export function runFork<A, E>(effect: Effect.Effect<A, E, CoinGeckoApi>): Fiber.RuntimeFiber<A, E> {
  return Effect.runFork(provideCoinGecko(effect))
}

