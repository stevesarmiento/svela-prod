import { Effect, Schema } from "effect"
import {
  ApiRequestError,
  WatchlistAuthError,
  WatchlistItem,
  WatchlistNotFoundError,
  WatchlistGroup,
  WatchlistValidationError,
} from "./watchlist-models"

export type WatchlistApiError =
  | WatchlistAuthError
  | WatchlistValidationError
  | WatchlistNotFoundError
  | ApiRequestError

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

function decodeArraySync<A>(schema: Schema.Schema<A>, input: unknown): Array<A> {
  if (!Array.isArray(input)) throw new Error("Expected an array response")
  const decode = Schema.decodeUnknownSync(schema)
  return input.map((item) => decode(item))
}

function decodeSync<A>(schema: Schema.Schema<A>, input: unknown): A {
  return Schema.decodeUnknownSync(schema)(input)
}

function makeHttpError(args: {
  endpoint: string
  status: number
  message: string
  notFoundGroupId?: string
  validationField?: string
}): WatchlistApiError {
  if (args.status === 401) {
    return new WatchlistAuthError({ message: args.message })
  }
  if (args.status === 404) {
    return new WatchlistNotFoundError({
      groupId: args.notFoundGroupId ?? "unknown",
      message: args.message,
    })
  }
  if (args.status === 400) {
    return new WatchlistValidationError({
      field: args.validationField ?? "request",
      reason: args.message,
      message: args.message,
    })
  }

  return new ApiRequestError({
    endpoint: args.endpoint,
    status: args.status,
    message: args.message,
  })
}

function requestJson<A>(args: {
  endpoint: string
  init?: RequestInit
  decode: (data: unknown) => A
  notFoundGroupId?: string
  validationField?: string
}): Effect.Effect<A, WatchlistApiError> {
  return Effect.tryPromise({
    try: () => fetch(args.endpoint, args.init),
    catch: (error) =>
      new ApiRequestError({
        endpoint: args.endpoint,
        status: 0,
        message: String(error),
      }),
  }).pipe(
    Effect.flatMap((response) =>
      Effect.tryPromise({
        try: async () => ({ response, body: await parseJsonOrText(response) }),
        catch: (error) =>
          new ApiRequestError({
            endpoint: args.endpoint,
            status: response.status,
            message: String(error),
          }),
      }),
    ),
    Effect.flatMap(({ response, body }) => {
      if (!response.ok) {
        const message = getErrorMessage(body) ?? `Request failed: ${response.status}`
        return Effect.fail(
          makeHttpError({
            endpoint: args.endpoint,
            status: response.status,
            message,
            notFoundGroupId: args.notFoundGroupId,
            validationField: args.validationField,
          }),
        )
      }

      return Effect.try({
        try: () => args.decode(body),
        catch: (error) =>
          new ApiRequestError({
            endpoint: args.endpoint,
            status: response.status,
            message: `Failed to decode response: ${String(error)}`,
          }),
      })
    }),
    Effect.timeout("10 seconds"),
    Effect.catchTag("TimeoutException", () =>
      Effect.fail(
        new ApiRequestError({
          endpoint: args.endpoint,
          status: 408,
          message: "Request timed out",
        }),
      ),
    ),
  )
}

export class WatchlistApi extends Effect.Service<WatchlistApi>()("WatchlistApi", {
  accessors: true,
  effect: Effect.gen(function* () {
    const listGroups = Effect.fn("WatchlistApi.listGroups")(function* () {
      return yield* requestJson({
        endpoint: "/api/internal/watchlists/groups",
        decode: (data) => decodeArraySync(WatchlistGroup, data),
      })
    })

    const createGroup = Effect.fn("WatchlistApi.createGroup")(
      function* (input: { name: string; description?: string; icon?: string; color?: string }) {
        return yield* requestJson({
          endpoint: "/api/internal/watchlists/groups",
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
          validationField: "name",
          decode: (data) =>
            decodeSync(
              Schema.Struct({
                id: Schema.String,
              }),
              data,
            ),
        })
      },
    )

    const updateGroup = Effect.fn("WatchlistApi.updateGroup")(
      function* (
        groupId: string,
        updates: { name?: string; description?: string; icon?: string; color?: string },
      ) {
        return yield* requestJson({
          endpoint: `/api/internal/watchlists/groups/${encodeURIComponent(groupId)}`,
          init: {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          },
          notFoundGroupId: groupId,
          decode: (data) =>
            decodeSync(
              Schema.Struct({
                success: Schema.Boolean,
              }),
              data,
            ),
        })
      },
    )

    const deleteGroup = Effect.fn("WatchlistApi.deleteGroup")(function* (groupId: string) {
      return yield* requestJson({
        endpoint: `/api/internal/watchlists/groups/${encodeURIComponent(groupId)}`,
        init: { method: "DELETE" },
        notFoundGroupId: groupId,
        decode: (data) =>
          decodeSync(
            Schema.Struct({
              success: Schema.Boolean,
            }),
            data,
          ),
      })
    })

    const listItems = Effect.fn("WatchlistApi.listItems")(function* (groupId?: string) {
      const url = groupId
        ? `/api/internal/watchlists/items?groupId=${encodeURIComponent(groupId)}`
        : "/api/internal/watchlists/items"

      return yield* requestJson({
        endpoint: url,
        notFoundGroupId: groupId,
        decode: (data) => decodeArraySync(WatchlistItem, data),
      })
    })

    const getBySlug = Effect.fn("WatchlistApi.getBySlug")(function* (slug: string) {
      return yield* requestJson({
        endpoint: `/api/internal/watchlists/by-slug?slug=${encodeURIComponent(slug)}`,
        validationField: "slug",
        decode: (data) => {
          if (data === null) return null
          if (!data || typeof data !== "object") throw new Error("Expected an object response")
          const record = data as Record<string, unknown>
          return {
            group: decodeSync(WatchlistGroup, record.group),
            items: decodeArraySync(WatchlistItem, record.items),
          }
        },
      })
    })

    const addItem = Effect.fn("WatchlistApi.addItem")(
      function* (input: { coinId: string; groupId?: string }) {
        return yield* requestJson({
          endpoint: "/api/internal/watchlists/items/add",
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
          validationField: "coinId",
          decode: (data) =>
            decodeSync(
              Schema.Struct({
                id: Schema.String,
              }),
              data,
            ),
        })
      },
    )

    const removeItem = Effect.fn("WatchlistApi.removeItem")(
      function* (input: { coinId: string; groupId?: string }) {
        return yield* requestJson({
          endpoint: "/api/internal/watchlists/items/remove",
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
          validationField: "coinId",
          decode: (data) =>
            decodeSync(
              Schema.Struct({
                success: Schema.Boolean,
              }),
              data,
            ),
        })
      },
    )

    const removeItemsBulk = Effect.fn("WatchlistApi.removeItemsBulk")(
      function* (input: { coinIds: string[]; groupId?: string }) {
        return yield* requestJson({
          endpoint: "/api/internal/watchlists/items/remove-bulk",
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
          validationField: "coinIds",
          decode: (data) =>
            decodeSync(
              Schema.Struct({
                removedCount: Schema.Number,
              }),
              data,
            ),
        })
      },
    )

    return {
      listGroups,
      createGroup,
      updateGroup,
      deleteGroup,
      listItems,
      getBySlug,
      addItem,
      removeItem,
      removeItemsBulk,
    } as const
  }),
}) {}

