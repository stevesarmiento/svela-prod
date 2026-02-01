"use client";

import React, { useEffect, useState, type ReactNode } from "react";
import { useUser } from "@clerk/nextjs";
import { Effect, Schedule } from "effect";
import { useEffectScoped } from "@/lib/effect/react";

interface ConvexProviderProps {
  children: ReactNode;
}

function AuthenticatedUserSync({ children }: ConvexProviderProps) {
  const { user, isLoaded } = useUser();
  const [hasSynced, setHasSynced] = useState(false);

  useEffect(() => {
    // Reset sync state when the user changes.
    setHasSynced(false);
  }, [user?.id]);

  useEffectScoped(
    () => {
      if (!isLoaded || !user || hasSynced) return Effect.void;

      interface RetryableFailure {
        readonly _tag: "RetryableFailure";
        readonly message: string;
      }

      interface SyncOk {
        readonly _tag: "Ok";
      }

      interface NonRetryableFailure {
        readonly _tag: "NonRetryableFailure";
        readonly message: string;
      }

      type SyncResult = SyncOk | NonRetryableFailure;

      const retrySchedule = Schedule.exponential("500 millis", 2).pipe(
        Schedule.intersect(Schedule.recurs(2)),
      );

      return Effect.tryPromise({
        try: () =>
          fetch("/api/internal/users/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          }),
        catch: (error) => ({ _tag: "RetryableFailure", message: String(error) } as const),
      }).pipe(
        Effect.flatMap(
          (response): Effect.Effect<SyncResult, RetryableFailure> => {
            if (response.ok) return Effect.succeed<SyncResult>({ _tag: "Ok" });

            return Effect.tryPromise({
              try: async () => ({ response, body: await response.text().catch(() => "") }),
              catch: (error) => ({ _tag: "RetryableFailure", message: String(error) } as const),
            }).pipe(
              Effect.flatMap(
                ({ response, body }): Effect.Effect<SyncResult, RetryableFailure> => {
                  const message = `User sync failed (${response.status} ${response.statusText})${body ? `: ${body}` : ""}`;

                  // Only retry on transient server errors.
                  if (response.status >= 500) {
                    return Effect.fail<RetryableFailure>({ _tag: "RetryableFailure", message });
                  }

                  return Effect.succeed<SyncResult>({ _tag: "NonRetryableFailure", message });
                },
              ),
            );
          },
        ),
        Effect.retry(retrySchedule),
        Effect.timeout("5 seconds"),
        Effect.tap((result) => {
          if (result._tag !== "Ok") return Effect.void;
          return Effect.sync(() => setHasSynced(true));
        }),
        Effect.tap((result) => {
          if (result._tag !== "NonRetryableFailure") return Effect.void;
          return Effect.log("[Convex] Failed to sync user", {
            kind: "non_retryable",
            message: result.message,
          });
        }),
        Effect.catchTag("TimeoutException", () =>
          Effect.log("[Convex] Failed to sync user", { kind: "timeout" }),
        ),
        Effect.catchTag("RetryableFailure", (error) =>
          Effect.log("[Convex] Failed to sync user", {
            kind: "retryable",
            message: error.message,
          }),
        ),
        Effect.asVoid,
      );
    },
    [user?.id, isLoaded, hasSynced],
  );

  return <>{children}</>;
}

export function ConvexProvider({ children }: ConvexProviderProps) {
  return (
    <AuthenticatedUserSync>{children}</AuthenticatedUserSync>
  );
}

