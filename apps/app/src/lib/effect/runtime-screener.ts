import { Effect } from "effect";
import { ScreenerApi } from "./screener-api";

/**
 * Client runtime boundary for smart-screener Effects.
 *
 * Keeps the client bundle smaller by only providing `ScreenerApi`.
 */

function provideScreener<A, E>(
  effect: Effect.Effect<A, E, ScreenerApi>,
): Effect.Effect<A, E, never> {
  return effect.pipe(Effect.provide(ScreenerApi.layer));
}

export function runPromise<A, E>(
  effect: Effect.Effect<A, E, ScreenerApi>,
  options?: { signal?: AbortSignal },
): Promise<A> {
  return Effect.runPromise(provideScreener(effect), options);
}
