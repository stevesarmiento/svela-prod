"use client"

import { useEffect } from "react"
import { Effect, Fiber } from "effect"
import type { Scope } from "effect"

/**
 * Run an `Effect.scoped` program in a React effect, and interrupt it on cleanup.
 *
 * Use this for component lifecycle side-effects where you want:
 * - automatic finalizers on unmount / dependency change
 * - structured cancellation via fiber interruption
 */
export function useEffectScoped<A, E>(
  makeEffect: () => Effect.Effect<A, E, Scope.Scope>,
  deps: Array<unknown>,
): void {
  useEffect(() => {
    // This helper is intentionally for **scope-managed** component side-effects.
    // It does not provide app service layers (to avoid pulling them into the client bundle).
    const fiber = Effect.runFork(Effect.scoped(makeEffect()))

    return () => {
      // Non-blocking interrupt; finalizers run because the program is scoped.
      Effect.runFork(Fiber.interruptFork(fiber))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

