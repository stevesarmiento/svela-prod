import type { ConvexHttpClient } from "convex/browser";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import { Context, Effect, Layer } from "effect";
import { convex, getServerToken } from "@/lib/convex-server";
import { ConvexQueryError, ConvexTimeoutError } from "./errors";

/**
 * Effect boundary around the singleton ConvexHttpClient.
 *
 * ConvexHttpClient has no abort support, so timeouts interrupt the fiber
 * (same semantics as the previous Promise.race idiom) — the underlying
 * request keeps running but the route stops waiting on it.
 */

const DEFAULT_TIMEOUT_MS = 8_000;

export interface ConvexCallOptions {
  timeoutMs?: number;
  /** Shown in error tags/logs; defaults to the arg-less function name if omitted. */
  label?: string;
}

type WithoutToken<Args> = Omit<Args, "serverToken">;

interface ConvexServiceShape {
  /** Public query (no server token). */
  readonly query: <Q extends FunctionReference<"query">>(
    fn: Q,
    args: FunctionArgs<Q>,
    opts?: ConvexCallOptions,
  ) => Effect.Effect<
    FunctionReturnType<Q>,
    ConvexTimeoutError | ConvexQueryError
  >;
  /** Server-authenticated query — injects `serverToken` automatically. */
  readonly serverQuery: <Q extends FunctionReference<"query">>(
    fn: Q,
    args: WithoutToken<FunctionArgs<Q>>,
    opts?: ConvexCallOptions,
  ) => Effect.Effect<
    FunctionReturnType<Q>,
    ConvexTimeoutError | ConvexQueryError
  >;
  /** Server-authenticated mutation — injects `serverToken` automatically. */
  readonly serverMutation: <M extends FunctionReference<"mutation">>(
    fn: M,
    args: WithoutToken<FunctionArgs<M>>,
    opts?: ConvexCallOptions,
  ) => Effect.Effect<
    FunctionReturnType<M>,
    ConvexTimeoutError | ConvexQueryError
  >;
  /**
   * Fire-and-forget server mutation (demand signals, warmups). Never fails
   * the route, but ALWAYS logs failures — a permanently broken warmup
   * should be visible in logs, not silent.
   */
  readonly warmup: <M extends FunctionReference<"mutation">>(
    fn: M,
    args: WithoutToken<FunctionArgs<M>>,
    label: string,
  ) => Effect.Effect<void>;
}

export function makeConvexService(
  client: ConvexHttpClient = convex,
  tokenReader: () => string = getServerToken,
): ConvexServiceShape {
  const run = <A>(
    promiseThunk: () => Promise<A>,
    label: string,
    opts?: ConvexCallOptions,
  ): Effect.Effect<A, ConvexTimeoutError | ConvexQueryError> => {
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    return Effect.tryPromise({
      try: promiseThunk,
      catch: (error) =>
        new ConvexQueryError({
          label,
          message: error instanceof Error ? error.message : String(error),
        }),
    }).pipe(
      Effect.timeout(`${timeoutMs} millis`),
      Effect.catchTag("TimeoutError", () =>
        Effect.fail(new ConvexTimeoutError({ label })),
      ),
    );
  };

  return {
    query: (fn, args, opts) =>
      run(() => client.query(fn, args), opts?.label ?? "convex.query", opts),
    serverQuery: (fn, args, opts) =>
      run(
        () =>
          client.query(fn, {
            ...args,
            serverToken: tokenReader(),
          } as FunctionArgs<typeof fn>),
        opts?.label ?? "convex.serverQuery",
        opts,
      ),
    serverMutation: (fn, args, opts) =>
      run(
        () =>
          client.mutation(fn, {
            ...args,
            serverToken: tokenReader(),
          } as FunctionArgs<typeof fn>),
        opts?.label ?? "convex.serverMutation",
        opts,
      ),
    warmup: (fn, args, label) =>
      Effect.sync(() => {
        void client
          .mutation(fn, {
            ...args,
            serverToken: tokenReader(),
          } as FunctionArgs<typeof fn>)
          .catch((error) => {
            console.warn(`[warmup:${label}] failed:`, error);
          });
      }),
  };
}

// biome-ignore lint/complexity/noStaticOnlyClass: Effect v4 service class — the class is the Context tag; `layer` must be static
export class ConvexService extends Context.Service<ConvexService>()(
  "server/ConvexService",
  { make: Effect.sync(() => makeConvexService()) },
) {
  static readonly layer = Layer.effect(this, this.make);
  /** Test seam: build a layer over a stubbed client/token. */
  static layerWith(
    client: ConvexHttpClient,
    tokenReader: () => string = () => "test-token",
  ) {
    return Layer.succeed(ConvexService, makeConvexService(client, tokenReader));
  }
}
