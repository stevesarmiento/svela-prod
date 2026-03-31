import { Schema } from "effect"

// Typed errors for watchlist operations
export class WatchlistNotFoundError extends Schema.TaggedError<WatchlistNotFoundError>()(
  "WatchlistNotFoundError",
  { groupId: Schema.String, message: Schema.String }
) {}

export class WatchlistAuthError extends Schema.TaggedError<WatchlistAuthError>()(
  "WatchlistAuthError", 
  { message: Schema.String }
) {}

export class WatchlistValidationError extends Schema.TaggedError<WatchlistValidationError>()(
  "WatchlistValidationError",
  { field: Schema.String, reason: Schema.String, message: Schema.String }
) {}

export class ApiRequestError extends Schema.TaggedError<ApiRequestError>()(
  "ApiRequestError",
  { endpoint: Schema.String, status: Schema.Number, message: Schema.String }
) {}

// Domain models with validation
export class WatchlistGroup extends Schema.Class<WatchlistGroup>("WatchlistGroup")({
  _id: Schema.String,
  _creationTime: Schema.Number,
  userId: Schema.String,
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(50)),
  slug: Schema.String,
  description: Schema.optional(Schema.String),
  icon: Schema.optional(Schema.String),
  color: Schema.optional(Schema.String),
  portfolioWalletId: Schema.optional(Schema.String),
  isDefault: Schema.Boolean,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
}) {}

export class WatchlistItem extends Schema.Class<WatchlistItem>("WatchlistItem")({
  _id: Schema.String,
  _creationTime: Schema.Number,
  userId: Schema.String,
  watchlistGroupId: Schema.String,
  coinId: Schema.String,
  holdings: Schema.optional(Schema.Number),
}) {}

export class CoinGeckoWatchlistCoin extends Schema.Class<CoinGeckoWatchlistCoin>("CoinGeckoWatchlistCoin")({
  id: Schema.String,
  name: Schema.String,
  symbol: Schema.String,
  slug: Schema.String,
  image: Schema.String,
  cmc_rank: Schema.Number,
  circulating_supply: Schema.Number,
  max_supply: Schema.NullOr(Schema.Number),
  quote: Schema.Struct({
    USD: Schema.Struct({
      price: Schema.Number,
      volume_24h: Schema.Number,
      market_cap: Schema.Number,
      percent_change_24h: Schema.Number,
      percent_change_1h: Schema.optional(Schema.Number),
      percent_change_7d: Schema.optional(Schema.Number),
      percent_change_30d: Schema.optional(Schema.Number),
    })
  })
}) {}

