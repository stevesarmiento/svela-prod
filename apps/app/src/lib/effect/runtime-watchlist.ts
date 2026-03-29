import { Effect, type Exit, type Fiber } from "effect"
import { WatchlistApi } from "./watchlist-api"

/**
 * Client runtime boundary for watchlist Effects.
 *
 * Keeps the client bundle smaller by only providing `WatchlistApi`.
 * Use `apps/app/src/lib/effect/runtime.ts` only when you truly need multiple services.
 */

function provideWatchlist<A, E>(effect: Effect.Effect<A, E, WatchlistApi>): Effect.Effect<A, E, never> {
  return effect.pipe(Effect.provide(WatchlistApi.Default))
}

export function runPromise<A, E>(effect: Effect.Effect<A, E, WatchlistApi>): Promise<A> {
  return Effect.runPromise(provideWatchlist(effect))
}

export function runPromiseExit<A, E>(effect: Effect.Effect<A, E, WatchlistApi>): Promise<Exit.Exit<A, E>> {
  return Effect.runPromiseExit(provideWatchlist(effect))
}

export function runFork<A, E>(effect: Effect.Effect<A, E, WatchlistApi>): Fiber.RuntimeFiber<A, E> {
  return Effect.runFork(provideWatchlist(effect))
}

