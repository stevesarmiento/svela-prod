import { Effect, Exit, Fiber, Layer, ManagedRuntime } from "effect"
import { CacheQueue } from "./cache-queue"

/**
 * Server-only Effect runtime boundary for Next.js route handlers.
 *
 * IMPORTANT:
 * - Do NOT import this from client components/hooks.
 * - Keep server-only services (Convex tokens, background queue) provided here.
 */

// Server-only services (CacheQueue, etc) are provided here.
export const ServerEffectLayer = Layer.mergeAll(CacheQueue.Default)

type ServerRequirements = CacheQueue

const serverRuntime = ManagedRuntime.make(ServerEffectLayer)

export function runPromise<A, E, R extends ServerRequirements>(
  effect: Effect.Effect<A, E, R>,
): Promise<A> {
  return serverRuntime.runPromise(effect as unknown as Effect.Effect<A, E, ServerRequirements>)
}

export function runPromiseExit<A, E, R extends ServerRequirements>(
  effect: Effect.Effect<A, E, R>,
): Promise<Exit.Exit<A, E>> {
  return serverRuntime.runPromiseExit(effect as unknown as Effect.Effect<A, E, ServerRequirements>)
}

export function runFork<A, E, R extends ServerRequirements>(
  effect: Effect.Effect<A, E, R>,
): Fiber.RuntimeFiber<A, E> {
  return serverRuntime.runFork(effect as unknown as Effect.Effect<A, E, ServerRequirements>)
}

