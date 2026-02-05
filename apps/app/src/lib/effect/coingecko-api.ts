import { Effect, Schema, Schedule } from "effect"

export class CoinGeckoInvalidParamsError extends Schema.TaggedError<CoinGeckoInvalidParamsError>()(
  "CoinGeckoInvalidParamsError",
  { endpoint: Schema.String, message: Schema.String },
) {}

export class CoinGeckoUnauthorizedError extends Schema.TaggedError<CoinGeckoUnauthorizedError>()(
  "CoinGeckoUnauthorizedError",
  { endpoint: Schema.String, message: Schema.String },
) {}

export class CoinGeckoNotFoundError extends Schema.TaggedError<CoinGeckoNotFoundError>()(
  "CoinGeckoNotFoundError",
  { endpoint: Schema.String, message: Schema.String },
) {}

export class CoinGeckoRateLimitedError extends Schema.TaggedError<CoinGeckoRateLimitedError>()(
  "CoinGeckoRateLimitedError",
  { endpoint: Schema.String, message: Schema.String },
) {}

export class CoinGeckoApiError extends Schema.TaggedError<CoinGeckoApiError>()(
  "CoinGeckoApiError",
  { endpoint: Schema.String, status: Schema.Number, message: Schema.String },
) {}

export class CoinGeckoDecodeError extends Schema.TaggedError<CoinGeckoDecodeError>()(
  "CoinGeckoDecodeError",
  { endpoint: Schema.String, message: Schema.String },
) {}

export type CoinGeckoApiErrors =
  | CoinGeckoInvalidParamsError
  | CoinGeckoUnauthorizedError
  | CoinGeckoNotFoundError
  | CoinGeckoRateLimitedError
  | CoinGeckoApiError
  | CoinGeckoDecodeError

function getErrorMessage(body: unknown): string | null {
  if (!body) return null
  if (typeof body === "string") return body
  if (typeof body !== "object") return null

  const record = body as Record<string, unknown>
  if (typeof record.error === "string") return record.error
  if (typeof record.message === "string") return record.message
  if (typeof record.details === "string") return record.details
  return null
}

async function parseJsonOrText(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "")
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function makeHttpError(args: { endpoint: string; status: number; message: string }): CoinGeckoApiErrors {
  if (args.status === 400) {
    return new CoinGeckoInvalidParamsError({ endpoint: args.endpoint, message: args.message })
  }
  if (args.status === 401) {
    return new CoinGeckoUnauthorizedError({ endpoint: args.endpoint, message: args.message })
  }
  if (args.status === 404) {
    return new CoinGeckoNotFoundError({ endpoint: args.endpoint, message: args.message })
  }
  if (args.status === 429) {
    return new CoinGeckoRateLimitedError({ endpoint: args.endpoint, message: args.message })
  }
  return new CoinGeckoApiError({
    endpoint: args.endpoint,
    status: args.status,
    message: args.message,
  })
}

function requestJson<A>(args: {
  endpoint: string
  decode: (data: unknown) => A
  init?: RequestInit
}): Effect.Effect<A, CoinGeckoApiErrors> {
  return Effect.tryPromise({
    try: () => fetch(args.endpoint, args.init),
    catch: (error) =>
      new CoinGeckoApiError({
        endpoint: args.endpoint,
        status: 0,
        message: String(error),
      }),
  }).pipe(
    Effect.flatMap((response) =>
      Effect.tryPromise({
        try: async () => ({ response, body: await parseJsonOrText(response) }),
        catch: (error) =>
          new CoinGeckoApiError({
            endpoint: args.endpoint,
            status: response.status,
            message: String(error),
          }),
      }),
    ),
    Effect.flatMap(({ response, body }) => {
      if (!response.ok) {
        const message = getErrorMessage(body) ?? `Request failed: ${response.status}`
        return Effect.fail(makeHttpError({ endpoint: args.endpoint, status: response.status, message }))
      }

      return Effect.try({
        try: () => args.decode(body),
        catch: (error) => new CoinGeckoDecodeError({ endpoint: args.endpoint, message: String(error) }),
      })
    }),
    Effect.retry(Schedule.exponential("500 millis", 2)),
    Effect.timeout("8 seconds"),
    Effect.catchTag("TimeoutException", () =>
      Effect.fail(new CoinGeckoApiError({ endpoint: args.endpoint, status: 408, message: "Request timed out" })),
    ),
  )
}

export interface MarketChartPoint {
  time: number
  value: number
}

export interface MarketChartApiResponse {
  data: {
    prices: MarketChartPoint[]
    volumes: MarketChartPoint[]
    market_caps: MarketChartPoint[]
  }
  status?: {
    cached?: boolean
  }
}

const MarketChartPointSchema = Schema.Struct({
  time: Schema.Number,
  value: Schema.Number,
})

const MarketChartApiResponseSchema = Schema.Struct({
  data: Schema.Struct({
    prices: Schema.Array(MarketChartPointSchema),
    volumes: Schema.Array(MarketChartPointSchema),
    market_caps: Schema.Array(MarketChartPointSchema),
  }),
  status: Schema.optional(
    Schema.Struct({
      cached: Schema.optional(Schema.Boolean),
    }),
  ),
})

export interface OHLCDataPoint {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

export interface OHLCApiResponse {
  data: OHLCDataPoint[]
  cached?: boolean
}

const OHLCDataPointSchema = Schema.Struct({
  timestamp: Schema.Number,
  open: Schema.Number,
  high: Schema.Number,
  low: Schema.Number,
  close: Schema.Number,
})

const OHLCApiResponseSchema = Schema.Struct({
  data: Schema.Array(OHLCDataPointSchema),
  cached: Schema.optional(Schema.Boolean),
})

export interface CoinGeckoQuotesStatus {
  error_code?: number
  error_message?: string
}

export interface CoinGeckoQuoteMarketData {
  id: string
  name: string
  symbol: string
  market_cap_rank: number | null
  image: string
  current_price: number | null
  market_cap: number | null
  total_volume: number | null
  price_change_percentage_24h: number | null
  price_change_percentage_1h_in_currency?: number | null
  price_change_percentage_7d_in_currency?: number | null
  price_change_percentage_30d_in_currency?: number | null
}

export interface CoinGeckoQuotesApiResponse {
  data: Record<string, CoinGeckoQuoteMarketData>
  status?: CoinGeckoQuotesStatus
}

const CoinGeckoQuoteMarketDataSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  symbol: Schema.String,
  market_cap_rank: Schema.NullOr(Schema.Number),
  image: Schema.String,
  current_price: Schema.NullOr(Schema.Number),
  market_cap: Schema.NullOr(Schema.Number),
  total_volume: Schema.NullOr(Schema.Number),
  price_change_percentage_24h: Schema.NullOr(Schema.Number),
  price_change_percentage_1h_in_currency: Schema.optional(Schema.NullOr(Schema.Number)),
  price_change_percentage_7d_in_currency: Schema.optional(Schema.NullOr(Schema.Number)),
  price_change_percentage_30d_in_currency: Schema.optional(Schema.NullOr(Schema.Number)),
})

const CoinGeckoQuotesStatusSchema = Schema.Struct({
  error_code: Schema.optional(Schema.Number),
  error_message: Schema.optional(Schema.String),
})

const CoinGeckoQuotesApiResponseSchema = Schema.Struct({
  data: Schema.Unknown,
  status: Schema.optional(CoinGeckoQuotesStatusSchema),
})

export class CoinGeckoApi extends Effect.Service<CoinGeckoApi>()("CoinGeckoApi", {
  accessors: true,
  effect: Effect.gen(function* () {
    const getMarketChart = Effect.fn("CoinGeckoApi.getMarketChart")(function* (args: {
      coinId: string
      days?: string
      vsCurrency?: string
      interval?: string
    }) {
      const searchParams = new URLSearchParams()
      searchParams.set("id", args.coinId)
      if (args.days) searchParams.set("days", args.days)
      if (args.vsCurrency) searchParams.set("vs_currency", args.vsCurrency)
      if (args.interval) searchParams.set("interval", args.interval)

      return yield* requestJson({
        endpoint: `/api/coingecko/market-chart?${searchParams.toString()}`,
        decode: (data) => Schema.decodeUnknownSync(MarketChartApiResponseSchema)(data),
      })
    })

    const getOHLC = Effect.fn("CoinGeckoApi.getOHLC")(function* (args: {
      coinId: string
      days?: string
      vsCurrency?: string
      precision?: string | null
    }) {
      const searchParams = new URLSearchParams()
      searchParams.set("id", args.coinId)
      if (args.days) searchParams.set("days", args.days)
      if (args.vsCurrency) searchParams.set("vs_currency", args.vsCurrency)
      if (args.precision) searchParams.set("precision", args.precision)

      return yield* requestJson({
        endpoint: `/api/coingecko/ohlc?${searchParams.toString()}`,
        decode: (data) => Schema.decodeUnknownSync(OHLCApiResponseSchema)(data),
      })
    })

    const getQuotes = Effect.fn("CoinGeckoApi.getQuotes")(function* (args: {
      ids?: ReadonlyArray<string>
      symbols?: ReadonlyArray<string>
      names?: ReadonlyArray<string>
      category?: string
      limit?: number
    }) {
      const searchParams = new URLSearchParams()
      if (args.ids && args.ids.length > 0) searchParams.set("ids", args.ids.join(","))
      if (args.symbols && args.symbols.length > 0) searchParams.set("symbols", args.symbols.join(","))
      if (args.names && args.names.length > 0) searchParams.set("names", args.names.join(","))
      if (args.category) searchParams.set("category", args.category)
      if (args.limit !== undefined) searchParams.set("limit", String(args.limit))

      const endpoint = searchParams.size ? `/api/coingecko/quotes?${searchParams.toString()}` : "/api/coingecko/quotes"

      return yield* requestJson({
        endpoint,
        decode: (data): CoinGeckoQuotesApiResponse => {
          const decoded = Schema.decodeUnknownSync(CoinGeckoQuotesApiResponseSchema)(data)
          const raw = decoded.data
          if (typeof raw !== "object" || raw === null) {
            throw new Error("Expected quotes response data to be an object")
          }

          const decodeCoin = Schema.decodeUnknownSync(CoinGeckoQuoteMarketDataSchema)
          const result: Record<string, CoinGeckoQuoteMarketData> = {}
          for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
            result[key] = decodeCoin(value)
          }

          return { data: result, status: decoded.status }
        },
      })
    })

    return { getMarketChart, getOHLC, getQuotes } as const
  }),
}) {}

