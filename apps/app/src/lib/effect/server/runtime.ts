import { Effect, type Exit } from "effect";
import { ServerLayer, type ServerServices } from "./layer";

/**
 * Run boundary for server route Effects. Per-request layer construction is
 * negligible here — both services are stateless closures over module
 * singletons — so no ManagedRuntime is needed.
 */

export function runServerEffect<A, E>(
  effect: Effect.Effect<A, E, ServerServices>,
): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.provide(ServerLayer)));
}

export function runServerExit<A, E>(
  effect: Effect.Effect<A, E, ServerServices>,
): Promise<Exit.Exit<A, E>> {
  return Effect.runPromiseExit(effect.pipe(Effect.provide(ServerLayer)));
}
