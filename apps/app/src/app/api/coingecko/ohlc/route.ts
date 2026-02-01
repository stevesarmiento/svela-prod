import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@clerk/nextjs/server"
import { Effect, Schedule, Schema } from "effect"
import { api } from "../../../../../convex/_generated/api"
import { getUserApiKey } from "@/lib/user-api-keys"
import { convex, getServerToken } from "@/lib/convex-server"
import { runPromise } from "@/lib/effect/runtime-server"

const OHLCParamsSchema = z.object({
  id: z.string(),
  vs_currency: z.string().optional().default("usd"),
  days: z
    .enum(["1", "7", "14", "30", "90", "180", "365", "1825", "max"])
    .optional()
    .default("7"),
  precision: z.string().optional().nullable(),
})

export interface OHLCDataPoint {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

class CoinGeckoOhlcFetchError extends Schema.TaggedError<CoinGeckoOhlcFetchError>()(
  "CoinGeckoOhlcFetchError",
  { endpoint: Schema.String, message: Schema.String },
) {}

class CoinGeckoOhlcUpstreamError extends Schema.TaggedError<CoinGeckoOhlcUpstreamError>()(
  "CoinGeckoOhlcUpstreamError",
  {
    endpoint: Schema.String,
    status: Schema.Number,
    statusText: Schema.String,
    message: Schema.String,
  },
) {}

class CoinGeckoOhlcDecodeError extends Schema.TaggedError<CoinGeckoOhlcDecodeError>()(
  "CoinGeckoOhlcDecodeError",
  { endpoint: Schema.String, message: Schema.String },
) {}

class CoinGeckoOhlcTimeoutError extends Schema.TaggedError<CoinGeckoOhlcTimeoutError>()(
  "CoinGeckoOhlcTimeoutError",
  { endpoint: Schema.String, message: Schema.String },
) {}

interface OhlcRouteOk {
  readonly _tag: "Ok"
  readonly response: Response
  readonly transformedData: ReadonlyArray<OHLCDataPoint>
}

interface OhlcRouteErr {
  readonly _tag: "Err"
  readonly response: Response
}

type OhlcRouteResult = OhlcRouteOk | OhlcRouteErr

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const params = OHLCParamsSchema.safeParse({
    id: searchParams.get("id"),
    vs_currency: searchParams.get("vs_currency"),
    days: searchParams.get("days"),
    precision: searchParams.get("precision"),
  })

  if (!params.success) {
    return NextResponse.json({ error: "Invalid parameters", details: params.error.issues }, { status: 400 })
  }

  const { id: coinId, vs_currency, days, precision } = params.data

  // Auth is optional here; user key (if present) takes precedence over env key.
  let clerkId: string | null = null
  try {
    const authResult = await auth()
    clerkId = authResult.userId
  } catch {
    // Ignore and fall back to env key.
  }

  const apiKeyResult = await getUserApiKey(clerkId, "coingecko", "X_CG_PRO_API_KEY")
  const apiKey = apiKeyResult.key
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "CoinGecko API key not available. Please add your API key in settings or configure X_CG_PRO_API_KEY environment variable.",
        data: [],
      },
      { status: 500 },
    )
  }

  const url = new URL(`https://pro-api.coingecko.com/api/v3/coins/${coinId}/ohlc`)
  url.searchParams.set("vs_currency", vs_currency)
  url.searchParams.set("days", days)
  if (precision) url.searchParams.set("precision", precision)

  const endpoint = url.toString()

  const fetchRawDataEffect: Effect.Effect<
    number[][],
    CoinGeckoOhlcFetchError | CoinGeckoOhlcUpstreamError | CoinGeckoOhlcDecodeError | CoinGeckoOhlcTimeoutError
  > = Effect.tryPromise({
    try: () =>
      fetch(endpoint, {
        headers: {
          "x-cg-pro-api-key": apiKey,
          Accept: "application/json",
        },
      }),
    catch: (error) => new CoinGeckoOhlcFetchError({ endpoint, message: String(error) }),
  }).pipe(
    Effect.flatMap((response): Effect.Effect<number[][], CoinGeckoOhlcUpstreamError | CoinGeckoOhlcDecodeError> => {
      if (!response.ok) {
        return Effect.fail(
          new CoinGeckoOhlcUpstreamError({
            endpoint,
            status: response.status,
            statusText: response.statusText,
            message: `CoinGecko API error: ${response.status} ${response.statusText}`,
          }),
        )
      }

      return Effect.tryPromise({
        try: () => response.json() as Promise<number[][]>,
        catch: (error) => new CoinGeckoOhlcDecodeError({ endpoint, message: String(error) }),
      })
    }),
    Effect.retry(Schedule.exponential("500 millis", 2)),
    Effect.timeout("15 seconds"),
    Effect.catchTag("TimeoutException", () =>
      Effect.fail(new CoinGeckoOhlcTimeoutError({ endpoint, message: "Request timed out" })),
    ),
  )

  const program: Effect.Effect<OhlcRouteResult, never> = fetchRawDataEffect.pipe(
    Effect.map((rawData) => {
      const transformedData: Array<OHLCDataPoint> = rawData.map((dataPoint) => {
        const [timestamp, open, high, low, close] = dataPoint
        return {
          timestamp: timestamp || 0,
          open: open || 0,
          high: high || 0,
          low: low || 0,
          close: close || 0,
        }
      })

      return {
        _tag: "Ok" as const,
        transformedData,
        response: NextResponse.json({
          data: transformedData,
          cached: false,
          lastUpdated: Date.now(),
          dataPoints: transformedData.length,
        }),
      }
    }),
    Effect.catchTags({
      CoinGeckoOhlcFetchError: (e) =>
        Effect.succeed({
          _tag: "Err" as const,
          response: NextResponse.json({ error: e.message, data: [] }, { status: 500 }),
        }),
      CoinGeckoOhlcUpstreamError: (e) =>
        Effect.succeed({
          _tag: "Err" as const,
          response: NextResponse.json({ error: e.message, data: [] }, { status: 500 }),
        }),
      CoinGeckoOhlcDecodeError: (e) =>
        Effect.succeed({
          _tag: "Err" as const,
          response: NextResponse.json({ error: e.message, data: [] }, { status: 500 }),
        }),
      CoinGeckoOhlcTimeoutError: (e) =>
        Effect.succeed({
          _tag: "Err" as const,
          response: NextResponse.json({ error: e.message, data: [] }, { status: 500 }),
        }),
    }),
  )

  const result = await runPromise(program)

  if (result._tag === "Ok") {
    // Fire-and-forget cache write to Convex (do not block the response).
    try {
      const dataPoints = result.transformedData.map((point) => ({
        timestamp: point.timestamp,
        price: point.close,
        volume: 0,
        marketCap: undefined,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
      }))

      void convex
        .mutation(api.historicalData.upsertCoinGeckoHistoricalData, {
          serverToken: getServerToken(),
          coingeckoId: coinId,
          timeframe: `${days}_ohlc`,
          dataPoints,
          dataSource: "coingecko-ohlc",
        })
        .catch(() => {
          // Don't fail the request if caching fails.
        })
    } catch {
      // Don't fail the request if caching fails.
    }
  }

  return result.response
}