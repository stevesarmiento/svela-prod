import { Effect, Tracer } from "effect";
import { OverviewApi } from "./overview-api";
import { sentryTracer } from "./sentry-tracer";

/**
 * Client runtime boundary for overview Effects.
 *
 * Keeps the client bundle smaller by only providing `OverviewApi`.
 */

function provideOverview<A, E>(
  effect: Effect.Effect<A, E, OverviewApi>,
): Effect.Effect<A, E, never> {
  return effect.pipe(
    Effect.provide(OverviewApi.layer),
    Effect.provideService(Tracer.Tracer, sentryTracer),
  );
}

export function runPromise<A, E>(
  effect: Effect.Effect<A, E, OverviewApi>,
  options?: { signal?: AbortSignal },
): Promise<A> {
  return Effect.runPromise(provideOverview(effect), options);
}
