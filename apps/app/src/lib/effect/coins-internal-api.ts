import { Effect, Schema } from "effect"

export class CoinsInternalInvalidParamsError extends Schema.TaggedError<CoinsInternalInvalidParamsError>()(
  "CoinsInternalInvalidParamsError",
  { endpoint: Schema.String, message: Schema.String },
) {}

export class CoinsInternalUnauthorizedError extends Schema.TaggedError<CoinsInternalUnauthorizedError>()(
  "CoinsInternalUnauthorizedError",
  { endpoint: Schema.String, message: Schema.String },
) {}

export class CoinsInternalNotFoundError extends Schema.TaggedError<CoinsInternalNotFoundError>()(
  "CoinsInternalNotFoundError",
  { endpoint: Schema.String, message: Schema.String },
) {}

export class CoinsInternalApiError extends Schema.TaggedError<CoinsInternalApiError>()("CoinsInternalApiError", {
  endpoint: Schema.String,
  status: Schema.Number,
  message: Schema.String,
}) {}

export class CoinsInternalDecodeError extends Schema.TaggedError<CoinsInternalDecodeError>()("CoinsInternalDecodeError", {
  endpoint: Schema.String,
  message: Schema.String,
}) {}

export type CoinsInternalApiErrors =
  | CoinsInternalInvalidParamsError
  | CoinsInternalUnauthorizedError
  | CoinsInternalNotFoundError
  | CoinsInternalApiError
  | CoinsInternalDecodeError

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

function makeHttpError(args: { endpoint: string; status: number; message: string }): CoinsInternalApiErrors {
  if (args.status === 400) {
    return new CoinsInternalInvalidParamsError({ endpoint: args.endpoint, message: args.message })
  }
  if (args.status === 401) {
    return new CoinsInternalUnauthorizedError({ endpoint: args.endpoint, message: args.message })
  }
  if (args.status === 404) {
    return new CoinsInternalNotFoundError({ endpoint: args.endpoint, message: args.message })
  }

  return new CoinsInternalApiError({ endpoint: args.endpoint, status: args.status, message: args.message })
}

function requestJson<A>(args: {
  endpoint: string
  decode: (data: unknown) => A
  init?: RequestInit
}): Effect.Effect<A, CoinsInternalApiErrors> {
  return Effect.tryPromise({
    try: () => fetch(args.endpoint, args.init),
    catch: (error) =>
      new CoinsInternalApiError({
        endpoint: args.endpoint,
        status: 0,
        message: String(error),
      }),
  }).pipe(
    Effect.flatMap((response) =>
      Effect.tryPromise({
        try: async () => ({ response, body: await parseJsonOrText(response) }),
        catch: (error) =>
          new CoinsInternalApiError({
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
        catch: (error) => new CoinsInternalDecodeError({ endpoint: args.endpoint, message: String(error) }),
      })
    }),
    Effect.timeout("8 seconds"),
    Effect.catchTag("TimeoutException", () =>
      Effect.fail(new CoinsInternalApiError({ endpoint: args.endpoint, status: 408, message: "Request timed out" })),
    ),
  )
}

export interface CoinSummary {
  coingeckoId: string
  name: string
  symbol: string
}

const CoinSummarySchema = Schema.Struct({
  coingeckoId: Schema.String,
  name: Schema.String,
  symbol: Schema.String,
})

export interface CoinMeta {
  coingeckoId: string
  name: string
  symbol: string
  logoUrl: string
}

const CoinMetaSchema = Schema.Struct({
  coingeckoId: Schema.String,
  name: Schema.String,
  symbol: Schema.String,
  logoUrl: Schema.String,
})

export class CoinsInternalApi extends Effect.Service<CoinsInternalApi>()("CoinsInternalApi", {
  accessors: true,
  effect: Effect.gen(function* () {
    const search = Effect.fn("CoinsInternalApi.search")(function* (args: { query: string; limit?: number }) {
      const query = args.query.trim()
      if (!query) return [] as const

      const searchParams = new URLSearchParams()
      searchParams.set("query", query)
      if (args.limit !== undefined) searchParams.set("limit", String(args.limit))

      const endpoint = `/api/internal/coins/search?${searchParams.toString()}`
      return yield* requestJson({
        endpoint,
        decode: (data) => Schema.decodeUnknownSync(Schema.Array(CoinSummarySchema))(data),
      })
    })

    const top = Effect.fn("CoinsInternalApi.top")(function* (args: { limit?: number } = {}) {
      const searchParams = new URLSearchParams()
      if (args.limit !== undefined) searchParams.set("limit", String(args.limit))

      const endpoint = searchParams.size
        ? `/api/internal/coins/top?${searchParams.toString()}`
        : "/api/internal/coins/top"

      return yield* requestJson({
        endpoint,
        decode: (data) => Schema.decodeUnknownSync(Schema.Array(CoinSummarySchema))(data),
      })
    })

    const getCoinGeckoCoinById = Effect.fn("CoinsInternalApi.getCoinGeckoCoinById")(function* (args: { id: string }) {
      const endpoint = `/api/internal/coins/coingecko/${encodeURIComponent(args.id)}`
      return yield* requestJson({
        endpoint,
        decode: (data) => Schema.decodeUnknownSync(Schema.NullOr(CoinMetaSchema))(data),
      })
    })

    return { search, top, getCoinGeckoCoinById } as const
  }),
}) {}

