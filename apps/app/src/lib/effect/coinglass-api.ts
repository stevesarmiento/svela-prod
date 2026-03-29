import { Effect, Schema } from "effect"

export class CoinGlassInvalidParamsError extends Schema.TaggedError<CoinGlassInvalidParamsError>()(
  "CoinGlassInvalidParamsError",
  { endpoint: Schema.String, message: Schema.String },
) {}

export class CoinGlassUnauthorizedError extends Schema.TaggedError<CoinGlassUnauthorizedError>()(
  "CoinGlassUnauthorizedError",
  { endpoint: Schema.String, message: Schema.String },
) {}

export class CoinGlassRateLimitedError extends Schema.TaggedError<CoinGlassRateLimitedError>()(
  "CoinGlassRateLimitedError",
  { endpoint: Schema.String, message: Schema.String },
) {}

export class CoinGlassApiError extends Schema.TaggedError<CoinGlassApiError>()(
  "CoinGlassApiError",
  { endpoint: Schema.String, status: Schema.Number, message: Schema.String },
) {}

export class CoinGlassDecodeError extends Schema.TaggedError<CoinGlassDecodeError>()(
  "CoinGlassDecodeError",
  { endpoint: Schema.String, message: Schema.String },
) {}

export type CoinGlassApiErrors =
  | CoinGlassInvalidParamsError
  | CoinGlassUnauthorizedError
  | CoinGlassRateLimitedError
  | CoinGlassApiError
  | CoinGlassDecodeError

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

function makeHttpError(args: { endpoint: string; status: number; message: string }): CoinGlassApiErrors {
  if (args.status === 400) {
    return new CoinGlassInvalidParamsError({ endpoint: args.endpoint, message: args.message })
  }
  if (args.status === 401 || args.status === 403) {
    return new CoinGlassUnauthorizedError({ endpoint: args.endpoint, message: args.message })
  }
  if (args.status === 429) {
    return new CoinGlassRateLimitedError({ endpoint: args.endpoint, message: args.message })
  }
  return new CoinGlassApiError({ endpoint: args.endpoint, status: args.status, message: args.message })
}

function requestJson<A>(args: {
  endpoint: string
  decode: (data: unknown) => A
  init?: RequestInit
}): Effect.Effect<A, CoinGlassApiErrors> {
  return Effect.tryPromise({
    try: () => fetch(args.endpoint, args.init),
    catch: (error) =>
      new CoinGlassApiError({
        endpoint: args.endpoint,
        status: 0,
        message: String(error),
      }),
  }).pipe(
    Effect.flatMap((response) =>
      Effect.tryPromise({
        try: async () => ({ response, body: await parseJsonOrText(response) }),
        catch: (error) =>
          new CoinGlassApiError({
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
        catch: (error) => new CoinGlassDecodeError({ endpoint: args.endpoint, message: String(error) }),
      })
    }),
    Effect.timeout("8 seconds"),
    Effect.catchTag("TimeoutException", () =>
      Effect.fail(new CoinGlassApiError({ endpoint: args.endpoint, status: 408, message: "Request timed out" })),
    ),
  )
}

const CoinInfoSchema = Schema.Struct({
  symbol: Schema.String,
  name: Schema.String,
  coinId: Schema.Number,
  isSupported: Schema.Boolean,
})

const OpenInterestOHLCPointSchema = Schema.Struct({
  timestamp: Schema.Number,
  open: Schema.Number,
  high: Schema.Number,
  low: Schema.Number,
  close: Schema.Number,
})

const OpenInterestResponseSchema = Schema.Struct({
  success: Schema.Boolean,
  data: Schema.Array(OpenInterestOHLCPointSchema),
  count: Schema.Number,
  symbol: Schema.String,
  interval: Schema.String,
  unit: Schema.String,
  originalInput: Schema.String,
  coinInfo: Schema.optional(CoinInfoSchema),
  lastUpdated: Schema.String,
})

const TakerBuySellExchangeSchema = Schema.Struct({
  exchange: Schema.String,
  buyRatio: Schema.Number,
  sellRatio: Schema.Number,
  buyVolumeUsd: Schema.Number,
  sellVolumeUsd: Schema.Number,
  totalVolumeUsd: Schema.Number,
})

const TakerBuySellOverallSchema = Schema.Struct({
  buyRatio: Schema.Number,
  sellRatio: Schema.Number,
  buyVolumeUsd: Schema.Number,
  sellVolumeUsd: Schema.Number,
  totalVolumeUsd: Schema.Number,
})

const TakerBuySellDataSchema = Schema.Struct({
  symbol: Schema.String,
  overall: TakerBuySellOverallSchema,
  exchanges: Schema.Array(TakerBuySellExchangeSchema),
})

const TakerBuySellResponseSchema = Schema.Struct({
  success: Schema.Boolean,
  data: TakerBuySellDataSchema,
  range: Schema.String,
  symbol: Schema.String,
  originalInput: Schema.String,
  coinInfo: Schema.optional(CoinInfoSchema),
  lastUpdated: Schema.String,
})

const SpotTakerBuySellHistoryPointSchema = Schema.Struct({
  time: Schema.Number,
  takerBuyVolumeUsd: Schema.Number,
  takerSellVolumeUsd: Schema.Number,
})

const SpotTakerBuySellHistoryResponseSchema = Schema.Struct({
  success: Schema.Boolean,
  data: Schema.Array(SpotTakerBuySellHistoryPointSchema),
  count: Schema.Number,
  exchange: Schema.String,
  symbol: Schema.String,
  interval: Schema.String,
  limit: Schema.NullOr(Schema.Number),
  originalInput: Schema.String,
  lastUpdated: Schema.String,
})

const LiquidationHistoryItemSchema = Schema.Struct({
  timestamp: Schema.Number,
  date: Schema.String,
  longLiquidations: Schema.Number,
  shortLiquidations: Schema.Number,
  totalLiquidations: Schema.Number,
})

const LiquidationHistoryResponseSchema = Schema.Struct({
  success: Schema.Boolean,
  data: Schema.Array(LiquidationHistoryItemSchema),
  count: Schema.Number,
  symbol: Schema.String,
  originalInput: Schema.String,
  coinInfo: Schema.optional(CoinInfoSchema),
  interval: Schema.String,
  exchangeList: Schema.String,
  lastUpdated: Schema.String,
})

const FundingRateExchangeSchema = Schema.Struct({
  exchange: Schema.String,
  fundingRateInterval: Schema.Number,
  fundingRate: Schema.Number,
  nextFundingTime: Schema.Number,
})

const FundingRateDataSchema = Schema.Struct({
  symbol: Schema.String,
  stablecoinMarginList: Schema.Array(FundingRateExchangeSchema),
  tokenMarginList: Schema.Array(FundingRateExchangeSchema),
})

const FundingRateResponseSchema = Schema.Struct({
  success: Schema.Boolean,
  data: Schema.Array(FundingRateDataSchema),
  symbol: Schema.String,
  originalInput: Schema.String,
  coinInfo: Schema.optional(CoinInfoSchema),
  lastUpdated: Schema.String,
})

export class CoinGlassApi extends Effect.Service<CoinGlassApi>()("CoinGlassApi", {
  accessors: true,
  effect: Effect.gen(function* () {
    const getOpenInterest = Effect.fn("CoinGlassApi.getOpenInterest")(function* (args: {
      symbol: string
      interval?: string
      limit?: number
      unit?: "usd" | "coin"
      startTime?: number
      endTime?: number
    }) {
      const searchParams = new URLSearchParams()
      searchParams.set("symbol", args.symbol)
      if (args.interval) searchParams.set("interval", args.interval)
      if (args.limit !== undefined) searchParams.set("limit", String(args.limit))
      if (args.unit) searchParams.set("unit", args.unit)
      if (args.startTime !== undefined) searchParams.set("start_time", String(args.startTime))
      if (args.endTime !== undefined) searchParams.set("end_time", String(args.endTime))

      return yield* requestJson({
        endpoint: `/api/coinglass/open-interest/aggregated-history?${searchParams.toString()}`,
        decode: (data) => Schema.decodeUnknownSync(OpenInterestResponseSchema)(data),
      })
    })

    const getTakerBuySell = Effect.fn("CoinGlassApi.getTakerBuySell")(function* (args: {
      symbol: string
      range?: string
    }) {
      const searchParams = new URLSearchParams()
      searchParams.set("symbol", args.symbol)
      if (args.range) searchParams.set("range", args.range)

      return yield* requestJson({
        endpoint: `/api/coinglass/taker-buy-sell/exchange-list?${searchParams.toString()}`,
        decode: (data) => Schema.decodeUnknownSync(TakerBuySellResponseSchema)(data),
      })
    })

    const getSpotTakerBuySellVolumeHistory = Effect.fn("CoinGlassApi.getSpotTakerBuySellVolumeHistory")(function* (args: {
      exchange: string
      symbol: string
      interval?: string
      limit?: number
      startTime?: number
      endTime?: number
    }) {
      const searchParams = new URLSearchParams()
      searchParams.set("exchange", args.exchange)
      searchParams.set("symbol", args.symbol)
      if (args.interval) searchParams.set("interval", args.interval)
      if (args.limit !== undefined) searchParams.set("limit", String(args.limit))
      if (args.startTime !== undefined) searchParams.set("start_time", String(args.startTime))
      if (args.endTime !== undefined) searchParams.set("end_time", String(args.endTime))

      return yield* requestJson({
        endpoint: `/api/coinglass/spot/taker-buy-sell-volume/history?${searchParams.toString()}`,
        decode: (data) => Schema.decodeUnknownSync(SpotTakerBuySellHistoryResponseSchema)(data),
      })
    })

    const getLiquidationHistory = Effect.fn("CoinGlassApi.getLiquidationHistory")(function* (args: {
      symbol?: string
      interval?: string
      exchangeList?: string
      limit?: number
      startTime?: number
      endTime?: number
    }) {
      const searchParams = new URLSearchParams()
      if (args.symbol) searchParams.set("symbol", args.symbol)
      if (args.interval) searchParams.set("interval", args.interval)
      if (args.exchangeList) searchParams.set("exchange_list", args.exchangeList)
      if (args.limit !== undefined) searchParams.set("limit", String(args.limit))
      if (args.startTime !== undefined) searchParams.set("start_time", String(args.startTime))
      if (args.endTime !== undefined) searchParams.set("end_time", String(args.endTime))

      return yield* requestJson({
        endpoint: `/api/coinglass/liquidation/aggregated-history?${searchParams.toString()}`,
        decode: (data) => Schema.decodeUnknownSync(LiquidationHistoryResponseSchema)(data),
      })
    })

    const getFundingRateExchanges = Effect.fn("CoinGlassApi.getFundingRateExchanges")(function* (args: {
      symbol: string
    }) {
      const searchParams = new URLSearchParams()
      searchParams.set("symbol", args.symbol)

      return yield* requestJson({
        endpoint: `/api/coinglass/funding-rate/exchange-list?${searchParams.toString()}`,
        decode: (data) => Schema.decodeUnknownSync(FundingRateResponseSchema)(data),
      })
    })

    return {
      getOpenInterest,
      getTakerBuySell,
      getSpotTakerBuySellVolumeHistory,
      getLiquidationHistory,
      getFundingRateExchanges,
    } as const
  }),
}) {}

