import * as Sentry from "@sentry/nextjs";
import { Cause, Exit, Option, Tracer } from "effect";

/**
 * Bridges Effect spans (Effect.fn named spans on the API services) to Sentry
 * inactive spans, so service calls show up in Sentry performance traces.
 *
 * `Tracer.Tracer` is a `Context.Reference` with a default, so providing this
 * via `Effect.provideService` does not change any effect's R type.
 */

type SentrySpanHandle = ReturnType<typeof Sentry.startInactiveSpan>;

function nanosToSeconds(nanos: bigint): number {
  // Sentry accepts seconds-based timestamps (numbers) as SpanTimeInput.
  return Number(nanos) / 1_000_000_000;
}

function toAttributeValue(
  value: unknown,
): string | number | boolean | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value == null) return undefined;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function failureMessage(cause: Cause.Cause<unknown>): string {
  const squashed = Cause.squash(cause);
  const message =
    squashed instanceof Error ? squashed.message : String(squashed);
  return message.slice(0, 256);
}

class SentryBridgeSpan extends Tracer.NativeSpan {
  readonly sentrySpan: SentrySpanHandle;

  constructor(options: ConstructorParameters<typeof Tracer.NativeSpan>[0]) {
    super(options);
    const parent = Option.getOrUndefined(options.parent);
    this.sentrySpan = Sentry.startInactiveSpan({
      name: options.name,
      op: "effect.fn",
      startTime: nanosToSeconds(options.startTime),
      parentSpan:
        parent instanceof SentryBridgeSpan ? parent.sentrySpan : undefined,
    });
  }

  override end(endTime: bigint, exit: Exit.Exit<unknown, unknown>): void {
    super.end(endTime, exit);
    if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
      this.sentrySpan.setStatus({
        code: 2,
        message: failureMessage(exit.cause),
      });
    } else {
      this.sentrySpan.setStatus({ code: 1 });
    }
    this.sentrySpan.end(nanosToSeconds(endTime));
  }

  override attribute(key: string, value: unknown): void {
    super.attribute(key, value);
    this.sentrySpan.setAttribute(key, toAttributeValue(value));
  }
}

export const sentryTracer: Tracer.Tracer = Tracer.make({
  span(options) {
    return new SentryBridgeSpan(options);
  },
});
