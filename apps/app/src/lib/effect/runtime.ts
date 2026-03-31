import { Effect, type Exit, type Fiber, Layer } from "effect"
import { WatchlistApi } from "./watchlist-api"
import { CoinGeckoApi } from "./coingecko-api"
import { CoinGlassApi } from "./coinglass-api"

/**
 * Centralized Effect runtime boundary for `apps/app`.
 *
 * Rule of thumb:
 * - Services return `Effect` values (do NOT `runPromise` inside services).
 * - UI/routes call `runPromise`/`runPromiseExit` here at the edge.
 */

// This is intentionally extended as we adopt Effect services.
export const AppEffectLayer = Layer.mergeAll(WatchlistApi.Default, CoinGeckoApi.Default, CoinGlassApi.Default)

export type AppRequirements = WatchlistApi | CoinGeckoApi | CoinGlassApi

export function provideAppLayer<A, E, R extends AppRequirements>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, never> {
  // TypeScript can't prove `R` is fully satisfied by `AppEffectLayer`.
  return effect.pipe(Effect.provide(AppEffectLayer)) as unknown as Effect.Effect<A, E, never>
}

export function runPromise<A, E, R extends AppRequirements>(
  effect: Effect.Effect<A, E, R>,
): Promise<A> {
  return Effect.runPromise(provideAppLayer(effect))
}

export function runPromiseExit<A, E, R extends AppRequirements>(
  effect: Effect.Effect<A, E, R>,
): Promise<Exit.Exit<A, E>> {
  return Effect.runPromiseExit(provideAppLayer(effect))
}

export function runFork<A, E, R extends AppRequirements>(
  effect: Effect.Effect<A, E, R>,
): Fiber.RuntimeFiber<A, E> {
  return Effect.runFork(provideAppLayer(effect))
}

