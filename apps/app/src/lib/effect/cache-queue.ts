import { Effect, Queue, Schedule } from "effect"
import type { ConvexHttpClient } from 'convex/browser'
import type { api } from '../../../convex/_generated/api'

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

// Create the queue processor (returns service directly, not wrapped in Effect)
export async function makeCacheQueueService(
  convex: ConvexHttpClient,
  convexApi: typeof api
) {
  let processedCount = 0
  const serverToken = process.env.INTERNAL_CONVEX_SERVER_TOKEN
  if (!serverToken) {
    throw new Error("INTERNAL_CONVEX_SERVER_TOKEN is not configured")
  }
  const isDebug = process.env.LOG_LEVEL === "debug"
  
  const setupQueue = Effect.gen(function* () {
    // Create bounded queue (max 100 pending writes)
    const queue = yield* Queue.bounded<CacheWriteJob>(100)
    
    // Start background processor
    yield* Effect.forkDaemon(
      Effect.forever(
        Queue.take(queue).pipe(
          Effect.flatMap((job) =>
            Effect.tryPromise({
              try: () => convex.mutation(convexApi.historicalData.upsertCoinGeckoHistoricalData, {
                serverToken,
                coingeckoId: job.coinId,
                timeframe: job.timeframe,
                dataPoints: job.dataPoints,
                dataSource: job.dataSource
              }),
              catch: (error) => error
            }).pipe(
              Effect.retry(Schedule.exponential("1 second", 2)),
              Effect.timeout("10 seconds"),
              Effect.tap(() => Effect.sync(() => {
                processedCount++
                if (isDebug) {
                  console.log(
                    `✅ Cached ${job.dataPoints.length} points for ${job.coinId} (total: ${processedCount})`,
                  )
                }
              })),
              Effect.catchAll((error) => Effect.sync(() => {
                const errorMsg = error && typeof error === 'object' && '_tag' in error 
                  ? error._tag 
                  : String(error)
                if (isDebug) {
                  console.warn(`⚠️ Cache write failed for ${job.coinId}: ${errorMsg}`)
                }
              }))
            )
          ),
          // Process max 2 writes per second (500ms delay between writes)
          Effect.delay("500 millis")
        )
      )
    )
    
    return {
      enqueue: (job: CacheWriteJob) =>
        Queue.offer(queue, job).pipe(
          Effect.tap(() => Effect.sync(() => 
            isDebug ? console.log(`📥 Queued cache write for ${job.coinId}`) : undefined
          )),
          Effect.catchAll(() => Effect.sync(() =>
            isDebug ? console.warn(`⚠️ Queue full, dropping cache write for ${job.coinId}`) : undefined
          ))
        ),
      
      getStats: async () => {
        const size = await Effect.runPromise(Queue.size(queue))
        return {
          pending: size,
          processed: processedCount
        }
      }
    }
  })
  
  return Effect.runPromise(setupQueue)
}

