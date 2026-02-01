import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@clerk/nextjs/server"
import { Effect, Schedule, Schema } from "effect"
import { api } from "../../../../../convex/_generated/api"
import {
  getApiHeaders,
  getUserApiKey,
  reportApiKeyError,
  updateUserApiKeyRateLimit,
} from "@/lib/user-api-keys"
import { convex, getServerToken } from "@/lib/convex-server"
import { runPromise } from "@/lib/effect/runtime-server"

const MarketsParamsSchema = z.object({
  ids: z.string(), // Comma-separated CoinGecko IDs (e.g., "bitcoin,ethereum")
  vs_currency: z.string().optional().default("usd"),
  include_24hr_change: z.boolean().optional().default(true),
  include_24hr_vol: z.boolean().optional().default(true),
  include_last_updated_at: z.boolean().optional().default(true),
})

interface CoinGeckoMarketData {
  id: string
  symbol: string
  name: string
  image: string
  current_price: number | null
  market_cap: number | null
  market_cap_rank: number | null
  fully_diluted_valuation: number | null
  total_volume: number | null
  high_24h: number | null
  low_24h: number | null
  price_change_24h: number | null
  price_change_percentage_24h: number | null
  market_cap_change_24h: number | null
  market_cap_change_percentage_24h: number | null
  circulating_supply: number | null
  total_supply: number | null
  max_supply: number | null
  ath: number | null
  ath_change_percentage: number | null
  ath_date: string | null
  atl: number | null
  atl_change_percentage: number | null
  atl_date: string | null
  roi: {
    times: number
    currency: string
    percentage: number
  } | null
  last_updated: string
}

class CoinGeckoMarketsFetchError extends Schema.TaggedError<CoinGeckoMarketsFetchError>()(
  "CoinGeckoMarketsFetchError",
  { endpoint: Schema.String, message: Schema.String },
) {}

class CoinGeckoMarketsUpstreamError extends Schema.TaggedError<CoinGeckoMarketsUpstreamError>()(
  "CoinGeckoMarketsUpstreamError",
  {
    endpoint: Schema.String,
    status: Schema.Number,
    statusText: Schema.String,
    message: Schema.String,
  },
) {}

class CoinGeckoMarketsDecodeError extends Schema.TaggedError<CoinGeckoMarketsDecodeError>()(
  "CoinGeckoMarketsDecodeError",
  { endpoint: Schema.String, message: Schema.String },
) {}

class CoinGeckoMarketsTimeoutError extends Schema.TaggedError<CoinGeckoMarketsTimeoutError>()(
  "CoinGeckoMarketsTimeoutError",
  { endpoint: Schema.String, message: Schema.String },
) {}

interface MarketsRouteOk {
  readonly _tag: "Ok"
  readonly response: Response
  readonly rawData: ReadonlyArray<CoinGeckoMarketData>
}

interface MarketsRouteErr {
  readonly _tag: "Err"
  readonly response: Response
}

type MarketsRouteResult = MarketsRouteOk | MarketsRouteErr

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const params = MarketsParamsSchema.safeParse({
    ids: searchParams.get("ids"),
    vs_currency: searchParams.get("vs_currency") || undefined,
    include_24hr_change: searchParams.get("include_24hr_change") === "true",
    include_24hr_vol: searchParams.get("include_24hr_vol") === "true",
    include_last_updated_at: searchParams.get("include_last_updated_at") === "true",
  })

  if (!params.success) {
    return NextResponse.json({ error: "Invalid parameters", details: params.error.issues }, { status: 400 })
  }

  const { ids, vs_currency, include_24hr_change, include_24hr_vol, include_last_updated_at } = params.data

  let clerkId: string | null = null
  try {
    const authResult = await auth()
    clerkId = authResult.userId
  } catch {
    // Ignore and fall back to env key.
  }

  const apiKeyResult = await getUserApiKey(clerkId, "coingecko", "X_CG_PRO_API_KEY")

  if (!apiKeyResult.key) {
    return NextResponse.json(
      {
        error:
          "CoinGecko API key not available. Please add your API key in settings or configure X_CG_PRO_API_KEY environment variable.",
      },
      { status: 500 },
    )
  }

  const url = new URL("https://pro-api.coingecko.com/api/v3/coins/markets")
  url.searchParams.set("vs_currency", vs_currency)
  url.searchParams.set("ids", ids)
  if (include_24hr_change) url.searchParams.set("price_change_percentage", "24h")
  url.searchParams.set("order", "market_cap_desc")
  url.searchParams.set("per_page", "250")
  url.searchParams.set("page", "1")
  url.searchParams.set("sparkline", "false")

  const headers = getApiHeaders("coingecko", apiKeyResult.key)

  const endpoint = url.toString()

  const fetchMarketsEffect: Effect.Effect<
    Array<CoinGeckoMarketData>,
    | CoinGeckoMarketsFetchError
    | CoinGeckoMarketsUpstreamError
    | CoinGeckoMarketsDecodeError
    | CoinGeckoMarketsTimeoutError
  > = Effect.tryPromise({
    try: () =>
      fetch(endpoint, {
        headers: {
          ...headers,
          Accept: "application/json",
        },
      }),
    catch: (error) => new CoinGeckoMarketsFetchError({ endpoint, message: String(error) }),
  }).pipe(
    Effect.flatMap(
      (response): Effect.Effect<Array<CoinGeckoMarketData>, CoinGeckoMarketsUpstreamError | CoinGeckoMarketsDecodeError> => {
      const rateLimitRemaining = response.headers.get("x-ratelimit-remaining")
      const rateLimitReset = response.headers.get("x-ratelimit-reset")

      if (apiKeyResult.isUserKey && rateLimitRemaining && rateLimitReset) {
        void updateUserApiKeyRateLimit(
          clerkId,
          "coingecko",
          parseInt(rateLimitRemaining),
          parseInt(rateLimitReset) * 1000,
        ).catch(() => {
          // Ignore metrics update errors.
        })
      }

      if (!response.ok) {
        const errorMessage = `CoinGecko API error: ${response.status} ${response.statusText}`
        if (apiKeyResult.isUserKey) {
          void reportApiKeyError(clerkId, "coingecko", errorMessage).catch(() => {
            // Ignore reporting errors.
          })
        }

        return Effect.fail(
          new CoinGeckoMarketsUpstreamError({
            endpoint,
            status: response.status,
            statusText: response.statusText,
            message: errorMessage,
          }),
        )
      }

      return Effect.tryPromise({
        try: async () => (await response.json()) as Array<CoinGeckoMarketData>,
        catch: (error) => new CoinGeckoMarketsDecodeError({ endpoint, message: String(error) }),
      })
    }),
    Effect.retry(Schedule.exponential("500 millis", 2)),
    Effect.timeout("15 seconds"),
    Effect.catchTag("TimeoutException", () =>
      Effect.fail(new CoinGeckoMarketsTimeoutError({ endpoint, message: "Request timed out" })),
    ),
  )

  const program: Effect.Effect<MarketsRouteResult, never> = fetchMarketsEffect.pipe(
    Effect.map((rawData) => {
      return {
        _tag: "Ok" as const,
        rawData,
        response: NextResponse.json({
          data: rawData,
          cached: false,
          timestamp: Date.now(),
          apiKeySource: apiKeyResult.isUserKey ? "user" : "environment",
        }),
      }
    }),
    Effect.catchTags({
      CoinGeckoMarketsFetchError: (e) => {
        if (apiKeyResult.isUserKey) {
          void reportApiKeyError(clerkId, "coingecko", e.message).catch(() => {
            // Ignore reporting errors.
          })
        }

        return Effect.succeed({
          _tag: "Err" as const,
          response: NextResponse.json({ error: "Failed to fetch market data", details: e.message }, { status: 500 }),
        })
      },
      CoinGeckoMarketsUpstreamError: (e) => {
        if (apiKeyResult.isUserKey) {
          void reportApiKeyError(clerkId, "coingecko", e.message).catch(() => {
            // Ignore reporting errors.
          })
        }

        return Effect.succeed({
          _tag: "Err" as const,
          response: NextResponse.json({ error: "Failed to fetch market data", details: e.message }, { status: 500 }),
        })
      },
      CoinGeckoMarketsDecodeError: (e) => {
        if (apiKeyResult.isUserKey) {
          void reportApiKeyError(clerkId, "coingecko", e.message).catch(() => {
            // Ignore reporting errors.
          })
        }

        return Effect.succeed({
          _tag: "Err" as const,
          response: NextResponse.json({ error: "Failed to fetch market data", details: e.message }, { status: 500 }),
        })
      },
      CoinGeckoMarketsTimeoutError: (e) => {
        if (apiKeyResult.isUserKey) {
          void reportApiKeyError(clerkId, "coingecko", e.message).catch(() => {
            // Ignore reporting errors.
          })
        }

        return Effect.succeed({
          _tag: "Err" as const,
          response: NextResponse.json({ error: "Failed to fetch market data", details: e.message }, { status: 500 }),
        })
      },
    }),
  )

  const result = await runPromise(program)

  if (result._tag === "Ok") {
    // Fire-and-forget cache write to Convex (do not block the response).
    if (result.rawData.length > 0) {
      const items = result.rawData.map((coinData) => ({
        coingeckoId: coinData.id,
        symbol: coinData.symbol,
        name: coinData.name,
        image: coinData.image,
        currentPrice: coinData.current_price ?? undefined,
        marketCap: coinData.market_cap ?? undefined,
        marketCapRank: coinData.market_cap_rank ?? undefined,
        fullyDilutedValuation: coinData.fully_diluted_valuation ?? undefined,
        totalVolume: coinData.total_volume ?? undefined,
        high24h: coinData.high_24h ?? undefined,
        low24h: coinData.low_24h ?? undefined,
        priceChange24h: coinData.price_change_24h ?? undefined,
        priceChangePercentage24h: coinData.price_change_percentage_24h ?? undefined,
        marketCapChange24h: coinData.market_cap_change_24h ?? undefined,
        marketCapChangePercentage24h: coinData.market_cap_change_percentage_24h ?? undefined,
        circulatingSupply: coinData.circulating_supply ?? undefined,
        totalSupply: coinData.total_supply ?? undefined,
        maxSupply: coinData.max_supply ?? undefined,
        ath: coinData.ath ?? undefined,
        athChangePercentage: coinData.ath_change_percentage ?? undefined,
        athDate: coinData.ath_date ?? undefined,
        atl: coinData.atl ?? undefined,
        atlChangePercentage: coinData.atl_change_percentage ?? undefined,
        atlDate: coinData.atl_date ?? undefined,
        lastUpdated: coinData.last_updated,
      }))

      void convex
        .mutation(api.coingeckoMarkets.upsertMarketDataBatch, {
          serverToken: getServerToken(),
          items,
        })
        .catch(() => {
          // Don't fail the request if caching fails.
        })
    }
  }

  return result.response
}