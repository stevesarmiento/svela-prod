import { Effect, Layer, Tracer } from "effect";
import { CoinGeckoApi } from "./coingecko-api";
import { CoinsInternalApi } from "./coins-internal-api";
import { sentryTracer } from "./sentry-tracer";

/**
 * Client runtime boundary for hybrid search Effects that combine internal
 * coin search with CoinGecko market data in a single Effect.
 */

const searchLayer = Layer.mergeAll(CoinsInternalApi.layer, CoinGeckoApi.layer);

function provideSearch<A, E>(
  effect: Effect.Effect<A, E, CoinsInternalApi | CoinGeckoApi>,
): Effect.Effect<A, E, never> {
  return effect.pipe(
    Effect.provide(searchLayer),
    Effect.provideService(Tracer.Tracer, sentryTracer),
  );
}

export function runPromise<A, E>(
  effect: Effect.Effect<A, E, CoinsInternalApi | CoinGeckoApi>,
  options?: { signal?: AbortSignal },
): Promise<A> {
  return Effect.runPromise(provideSearch(effect), options);
}
