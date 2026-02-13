import { NextRequest, NextResponse } from "next/server"
import { getCoinMarketChart } from "@/lib/coingecko"
import { api } from "../../../../../convex/_generated/api"
import { Effect, Schema } from "effect"
import { CacheQueue } from "@/lib/effect/cache-queue"
import { runFork, runPromise } from "@/lib/effect/runtime-server"
import { convex, getServerToken } from "@/lib/convex-server"

export const dynamic = 'force-dynamic'

class MarketChartCacheReadError extends Schema.TaggedError<MarketChartCacheReadError>()(
  "MarketChartCacheReadError",
  {
    message: Schema.String,
    coinId: Schema.String,
    timeframe: Schema.String,
  },
) {}

class MarketChartFetchError extends Schema.TaggedError<MarketChartFetchError>()(
  "MarketChartFetchError",
  { coinId: Schema.String, timeframe: Schema.String, message: Schema.String },
) {}

class MarketChartFetchTimeoutError extends Schema.TaggedError<MarketChartFetchTimeoutError>()(
  "MarketChartFetchTimeoutError",
  { coinId: Schema.String, timeframe: Schema.String, message: Schema.String },
) {}

interface MarketChartParams {
  id?: string
  vs_currency?: string
  days?: string
  interval?: string
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  
  // Extract parameters
  const params: MarketChartParams = {
    id: searchParams.get('id') || undefined,
    vs_currency: searchParams.get('vs_currency') || 'usd',
    days: searchParams.get('days') || '7',
    interval: searchParams.get('interval') || undefined
  }

  if (!params.id) {
    return NextResponse.json(
      { error: 'Missing required parameter: id' },
      { status: 400 }
    )
  }

  // Now params.id is guaranteed to be defined
  const coinId = params.id
  const timeframe = params.days || '7'

  // 1. Check Convex cache first (best-effort).
  const cachedDataEffect = Effect.tryPromise({
    try: () =>
      convex.query(api.historicalData.getCoinGeckoHistoricalData, {
        serverToken: getServerToken(),
        coingeckoId: coinId,
        timeframe: timeframe,
      }),
    catch: (error) =>
      new MarketChartCacheReadError({
        message: String(error),
        coinId,
        timeframe,
      }),
  }).pipe(
    // Don't wait forever for cache - timeout after 800ms
    // (Convex cache should be instant if healthy, no need to retry slow responses)
    Effect.timeout("800 millis"),
    // If cache fails, return empty result (will fetch fresh data)
    Effect.catchTags({
      MarketChartCacheReadError: () =>
        Effect.succeed({
          cached: false,
          stale: false,
          data: [],
          dataPoints: 0,
          lastUpdated: 0,
        }),
      TimeoutException: () =>
        Effect.succeed({
          cached: false,
          stale: false,
          data: [],
          dataPoints: 0,
          lastUpdated: 0,
        }),
    }),
  )

  const staleDataEffect = Effect.tryPromise({
    try: () =>
      convex.query(api.historicalData.getCoinGeckoHistoricalData, {
        serverToken: getServerToken(),
        coingeckoId: coinId,
        timeframe: timeframe,
      }),
    catch: (error) =>
      new MarketChartCacheReadError({
        message: String(error),
        coinId,
        timeframe,
      }),
  }).pipe(
    // Quick timeout for fallback (don't delay error response)
    Effect.timeout("800 millis"),
    // Return empty result if cache fails
    Effect.catchTags({
      MarketChartCacheReadError: () => Effect.succeed({ data: [], dataPoints: 0 }),
      TimeoutException: () => Effect.succeed({ data: [], dataPoints: 0 }),
    }),
  )

  const fetchFreshMarketChartEffect = Effect.tryPromise({
    try: () => getCoinMarketChart(coinId, params.vs_currency, timeframe, params.interval),
    catch: (error) => new MarketChartFetchError({ coinId, timeframe, message: String(error) }),
  }).pipe(
    // Bound total upstream latency (CoinGecko + transforms).
    Effect.timeout("20 seconds"),
    Effect.catchTag("TimeoutException", () =>
      Effect.fail(new MarketChartFetchTimeoutError({ coinId, timeframe, message: "Request timed out" })),
    ),
  )

  const program: Effect.Effect<Response, never> = Effect.gen(function* () {
    const cachedData = yield* cachedDataEffect

    if (cachedData.cached && cachedData.data.length > 0) {
      if (cachedData.stale) {
        // Backfill missing historical points in the background while serving cached data immediately.
        yield* Effect.sync(() => {
          runFork(
            fetchFreshMarketChartEffect.pipe(
              Effect.map((marketData) =>
                marketData.transformed.prices.map((price, index) => ({
                  timestamp: price.time * 1000,
                  price: price.value,
                  volume: marketData.transformed.volumes[index]?.value || 0,
                  marketCap: marketData.transformed.market_caps[index]?.value || 0,
                })),
              ),
              Effect.flatMap((dataPoints) =>
                CacheQueue.enqueue({
                  coinId,
                  timeframe,
                  dataPoints,
                  dataSource: "coingecko",
                }),
              ),
              Effect.catchAll(() => Effect.void),
            ),
          )
        })
      }

      // Return historical data from Convex whenever present.
      // Startup should not block on refetching full history.
      return NextResponse.json(
        {
          data: {
            prices: cachedData.data.map((point) => ({
              time: Math.floor(point.timestamp / 1000),
              value: point.price,
            })),
            volumes: cachedData.data.map((point) => ({
              time: Math.floor(point.timestamp / 1000),
              value: point.volume || 0,
            })),
            market_caps: cachedData.data.map((point) => ({
              time: Math.floor(point.timestamp / 1000),
              value: point.marketCap || 0,
            })),
          },
          status: {
            timestamp: new Date().toISOString(),
            error_code: 0,
            error_message: cachedData.stale ? "Historical cache is stale; latest quote should refresh client price." : "",
            data_source: cachedData.stale ? "convex-cache-stale" : "convex-cache",
            total_points: cachedData.dataPoints,
            cached: true,
            stale: cachedData.stale,
          },
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
          },
        },
      )
    }

    // 2. Fetch fresh data from CoinGecko API.
    const marketData = yield* fetchFreshMarketChartEffect

    // 3. Store in Convex database (fire and forget)
    const dataPoints = marketData.transformed.prices.map((price, index) => ({
      timestamp: price.time * 1000, // Convert back to milliseconds for storage
      price: price.value,
      volume: marketData.transformed.volumes[index]?.value || 0,
      marketCap: marketData.transformed.market_caps[index]?.value || 0,
    }))

    // Enqueue cache write (non-blocking, rate-limited via queue)
    yield* Effect.sync(() => {
      runFork(
        CacheQueue.enqueue({
          coinId,
          timeframe,
          dataPoints,
          dataSource: "coingecko",
        }),
      )
    })

    // 4. Return fresh data
    return NextResponse.json(
      {
        data: {
          prices: marketData.transformed.prices,
          volumes: marketData.transformed.volumes,
          market_caps: marketData.transformed.market_caps,
        },
        status: {
          timestamp: new Date().toISOString(),
          error_code: 0,
          error_message: "",
          data_source: "coingecko-fresh",
          total_points: marketData.transformed.prices.length,
          cached: false,
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      },
    )
  }).pipe(
    Effect.catchTags({
      MarketChartFetchError: (e) =>
        staleDataEffect.pipe(
          Effect.map((staleData) => {
            if (staleData.data.length > 0) {
              return NextResponse.json(
                {
                  data: {
                    prices: staleData.data.map((point) => ({
                      time: Math.floor(point.timestamp / 1000),
                      value: point.price,
                    })),
                    volumes: staleData.data.map((point) => ({
                      time: Math.floor(point.timestamp / 1000),
                      value: point.volume || 0,
                    })),
                    market_caps: staleData.data.map((point) => ({
                      time: Math.floor(point.timestamp / 1000),
                      value: point.marketCap || 0,
                    })),
                  },
                  status: {
                    timestamp: new Date().toISOString(),
                    error_code: 1,
                    error_message: "Using stale cached data due to API error",
                    data_source: "convex-stale",
                    total_points: staleData.dataPoints,
                    cached: true,
                  },
                },
                { status: 200 },
              )
            }

            return NextResponse.json(
              {
                error: "Failed to fetch market chart data",
                details: e.message,
              },
              { status: 500 },
            )
          }),
        ),
      MarketChartFetchTimeoutError: (e) =>
        staleDataEffect.pipe(
          Effect.map((staleData) => {
            if (staleData.data.length > 0) {
              return NextResponse.json(
                {
                  data: {
                    prices: staleData.data.map((point) => ({
                      time: Math.floor(point.timestamp / 1000),
                      value: point.price,
                    })),
                    volumes: staleData.data.map((point) => ({
                      time: Math.floor(point.timestamp / 1000),
                      value: point.volume || 0,
                    })),
                    market_caps: staleData.data.map((point) => ({
                      time: Math.floor(point.timestamp / 1000),
                      value: point.marketCap || 0,
                    })),
                  },
                  status: {
                    timestamp: new Date().toISOString(),
                    error_code: 1,
                    error_message: "Using stale cached data due to API error",
                    data_source: "convex-stale",
                    total_points: staleData.dataPoints,
                    cached: true,
                  },
                },
                { status: 200 },
              )
            }

            return NextResponse.json(
              {
                error: "Failed to fetch market chart data",
                details: e.message,
              },
              { status: 500 },
            )
          }),
        ),
    }),
  )

  return await runPromise(program)
} 