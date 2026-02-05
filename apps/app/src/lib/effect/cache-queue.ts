import { Effect, Queue, Ref, Schedule, Schema } from "effect"
import { api } from "../../../convex/_generated/api"
import { convex, getServerToken } from "@/lib/convex-server"

// Define cache write job
export interface CacheWriteJob {
  coinId: string
  timeframe: string
  dataPoints: Array<{
    timestamp: number
    price: number
    volume: number
    marketCap: number
  }>
  dataSource: string
}

export interface CacheQueueStats {
  pending: number
  processed: number
  failed: number
}

// Tagged error for write failures (enables catchTag/catchTags instead of catchAll).
export class CacheQueueWriteError extends Schema.TaggedError<CacheQueueWriteError>()(
  "CacheQueueWriteError",
  {
    message: Schema.String,
    coinId: Schema.String,
    timeframe: Schema.String,
  },
) {}

export class CacheQueue extends Effect.Service<CacheQueue>()("CacheQueue", {
  accessors: true,
  effect: Effect.gen(function* () {
    const serverToken = getServerToken()

    // Create bounded queue (max 100 pending writes).
    const queue = yield* Queue.bounded<CacheWriteJob>(100)
    const processedRef = yield* Ref.make(0)
    const failedRef = yield* Ref.make(0)

    const writeToConvex = Effect.fn("CacheQueue.writeToConvex")(function* (job: CacheWriteJob) {
      yield* Effect.tryPromise({
        try: () =>
          convex.mutation(api.historicalData.upsertCoinGeckoHistoricalData, {
            serverToken,
            coingeckoId: job.coinId,
            timeframe: job.timeframe,
            dataPoints: job.dataPoints,
            dataSource: job.dataSource,
          }),
        catch: (error) =>
          new CacheQueueWriteError({
            message: String(error),
            coinId: job.coinId,
            timeframe: job.timeframe,
          }),
      }).pipe(
        Effect.retry(Schedule.exponential("1 second", 2)),
        Effect.timeout("10 seconds"),
        Effect.tap(() => Ref.update(processedRef, (n) => n + 1)),
        Effect.catchTags({
          CacheQueueWriteError: () => Ref.update(failedRef, (n) => n + 1),
          TimeoutException: () => Ref.update(failedRef, (n) => n + 1),
        }),
        Effect.asVoid,
      )

      return null
    })

    // Start background processor.
    yield* Effect.forkDaemon(
      Effect.forever(
        Queue.take(queue).pipe(
          Effect.flatMap(writeToConvex),
          // Process max 2 writes per second (500ms delay between writes).
          Effect.delay("500 millis"),
        ),
      ),
    )

    const enqueue = Effect.fn("CacheQueue.enqueue")(function* (job: CacheWriteJob) {
      yield* Queue.offer(queue, job)
      return null
    })

    const getStats = Effect.fn("CacheQueue.getStats")(function* () {
      const pending = yield* Queue.size(queue)
      const processed = yield* Ref.get(processedRef)
      const failed = yield* Ref.get(failedRef)
      return { pending, processed, failed }
    })

    return { enqueue, getStats } as const
  }),
}) {}

