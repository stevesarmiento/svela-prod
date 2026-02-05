import { Effect, Exit, Fiber } from "effect"
import { CoinGlassApi } from "./coinglass-api"

/**
 * Client runtime boundary for CoinGlass Effects.
 *
 * Keeps the client bundle smaller by only providing `CoinGlassApi`.
 * Use `apps/app/src/lib/effect/runtime.ts` only when you truly need multiple services.
 */

function provideCoinGlass<A, E>(effect: Effect.Effect<A, E, CoinGlassApi>): Effect.Effect<A, E, never> {
  return effect.pipe(Effect.provide(CoinGlassApi.Default))
}

export function runPromise<A, E>(effect: Effect.Effect<A, E, CoinGlassApi>): Promise<A> {
  return Effect.runPromise(provideCoinGlass(effect))
}

export function runPromiseExit<A, E>(effect: Effect.Effect<A, E, CoinGlassApi>): Promise<Exit.Exit<A, E>> {
  return Effect.runPromiseExit(provideCoinGlass(effect))
}

export function runFork<A, E>(effect: Effect.Effect<A, E, CoinGlassApi>): Fiber.RuntimeFiber<A, E> {
  return Effect.runFork(provideCoinGlass(effect))
}

