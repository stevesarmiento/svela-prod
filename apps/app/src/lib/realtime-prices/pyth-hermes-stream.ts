import {
  Effect,
  Fiber,
  Filter,
  Option,
  Schedule,
  Schema,
  Stream,
} from "effect";

export interface HermesParsedPrice {
  id: string;
  price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number; // seconds
  };
}

export interface HermesPriceTick {
  feedId: string;
  priceUsd: number;
  confidenceUsd: number | null;
  publishTimeMs: number | null;
}

function normalizeFeedId(feedId: string): string {
  return feedId.startsWith("0x") ? feedId.slice(2) : feedId;
}

function toNumberOrNull(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeHermesParsedPrice(parsed: HermesParsedPrice): HermesPriceTick | null {
  const expo = parsed.price.expo;
  const rawPrice = toNumberOrNull(parsed.price.price);
  if (rawPrice === null) return null;

  const multiplier = 10 ** expo;
  const priceUsd = rawPrice * multiplier;
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;

  const rawConf = toNumberOrNull(parsed.price.conf);
  const confidenceUsd =
    rawConf === null ? null : rawConf * multiplier;

  const publishTimeSec = parsed.price.publish_time;
  const publishTimeMs =
    Number.isFinite(publishTimeSec) && publishTimeSec > 0 ? publishTimeSec * 1000 : null;

  return {
    feedId: normalizeFeedId(parsed.id),
    priceUsd,
    confidenceUsd: confidenceUsd !== null && Number.isFinite(confidenceUsd) ? confidenceUsd : null,
    publishTimeMs,
  };
}

export interface HermesStreamOptions {
  endpointBaseUrl?: string; // default https://hermes.pyth.network
  feedIds: ReadonlyArray<string>;
  onTick: (tick: HermesPriceTick) => void;
  onError?: (error: unknown) => void;
}

class HermesStreamError extends Schema.TaggedError<HermesStreamError>()(
  "HermesStreamError",
  { message: Schema.String },
) {}

const HermesParsedPriceSchema = Schema.Struct({
  id: Schema.String,
  price: Schema.Struct({
    price: Schema.String,
    conf: Schema.String,
    expo: Schema.Number,
    publish_time: Schema.Number,
  }),
});

// A single SSE `data:` frame may carry MULTIPLE parsed feed updates.
const HermesSseMessageSchema = Schema.Struct({
  parsed: Schema.optional(Schema.Array(HermesParsedPriceSchema)),
});

const decodeSseMessage = Schema.decodeUnknownOption(HermesSseMessageSchema);

/**
 * `data:` line → all parsed feed entries in the frame. Malformed JSON or
 * unexpected shapes are skipped (never fail the stream).
 */
function parseSseDataLine(
  line: string,
): Option.Option<ReadonlyArray<HermesParsedPrice>> {
  if (!line.startsWith("data:")) return Option.none();
  const payload = line.slice(5).trim();
  if (!payload) return Option.none();

  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    return Option.none();
  }

  return Option.map(decodeSseMessage(json), (message) => message.parsed ?? []);
}

// Reconnect-on-failure backoff: 1s doubling with jitter, capped at ~30s
// (Schedule.min picks the smaller delay, so the 30s spaced schedule acts as
// the ceiling). A successful (graceful) close resets the backoff because
// Effect.retry re-wraps each repeat iteration fresh.
const reconnectSchedule = Schedule.min([
  Schedule.jittered(Schedule.exponential("1 second", 2)),
  Schedule.spaced("30 seconds"),
]);

// Graceful server close → reconnect on the old fixed cadence.
const resubscribeSchedule = Schedule.spaced("3 seconds");

function connectOnce(args: {
  url: string;
  onTick: (tick: HermesPriceTick) => void;
}): Effect.Effect<void, HermesStreamError> {
  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      // Fiber interruption (unsubscribe) aborts the in-flight request.
      try: (signal) => fetch(args.url, { signal }),
      catch: (error) =>
        new HermesStreamError({ message: String(error) }),
    });

    if (!response.ok || !response.body) {
      return yield* Effect.fail(
        new HermesStreamError({
          message: `Hermes stream failed: ${response.status} ${response.statusText}`,
        }),
      );
    }
    const body = response.body;

    yield* Stream.fromReadableStream({
      evaluate: () => body,
      onError: (error) => new HermesStreamError({ message: String(error) }),
    }).pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.filterMap(Filter.fromPredicateOption(parseSseDataLine)),
      // Emit EVERY parsed entry in a frame (the old loop dropped all but the
      // first feed's tick on multi-feed frames).
      Stream.flatMap((entries) => Stream.fromIterable(entries)),
      Stream.filterMap(
        Filter.fromPredicateOption((entry: HermesParsedPrice) =>
          Option.fromNullishOr(normalizeHermesParsedPrice(entry)),
        ),
      ),
      Stream.runForEach((tick: HermesPriceTick) =>
        Effect.sync(() => args.onTick(tick)),
      ),
    );
  });
}

/**
 * Stream Pyth prices via Hermes SSE.
 * Returns an unsubscribe function.
 *
 * Internals run on Effect Stream: failures reconnect with jittered
 * exponential backoff (capped ~30s), graceful closes resubscribe on a 3s
 * cadence, and unsubscribing interrupts the fiber (aborting the request).
 */
export function subscribeHermesPriceStream(options: HermesStreamOptions): () => void {
  const baseUrl = options.endpointBaseUrl ?? "https://hermes.pyth.network";
  const feedIds = Array.from(
    new Set(
      options.feedIds.flatMap((id) => {
        const normalized = normalizeFeedId(id.trim());
        return normalized.length > 0 ? [normalized] : [];
      }),
    ),
  );

  if (feedIds.length === 0) return () => {};

  const idsParam = feedIds.map((id) => `ids[]=${id}`).join("&");
  const url = `${baseUrl}/v2/updates/price/stream?${idsParam}&parsed=true`;

  const program = connectOnce({ url, onTick: options.onTick }).pipe(
    Effect.tapError((error) =>
      Effect.sync(() => options.onError?.(error)),
    ),
    Effect.retry({ schedule: reconnectSchedule }),
    Effect.repeat({ schedule: resubscribeSchedule }),
  );

  const fiber = Effect.runFork(program);

  return () => {
    Effect.runFork(Fiber.interrupt(fiber));
  };
}
