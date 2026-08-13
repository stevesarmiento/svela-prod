import { Schema } from "effect";

export const COINGECKO_PRO_BASE_URL = "https://pro-api.coingecko.com/api/v3";

export function coingeckoHeaders(apiKey: string): HeadersInit {
  return {
    "x-cg-pro-api-key": apiKey,
    Accept: "application/json",
  };
}

/**
 * Permissive schemas mirroring the optionality of the interfaces they
 * replace — sparse-but-valid rows must keep working. Rows failing even
 * this loose shape are dropped individually rather than failing the batch.
 */

export const CoinGeckoMarketsRowSchema = Schema.Struct({
  id: Schema.String,
  symbol: Schema.String,
  name: Schema.String,
  image: Schema.optional(Schema.String),
  sparkline_in_7d: Schema.optional(
    Schema.Struct({
      price: Schema.optional(Schema.Array(Schema.Number)),
    }),
  ),
  current_price: Schema.optional(Schema.NullOr(Schema.Number)),
  market_cap: Schema.optional(Schema.NullOr(Schema.Number)),
  market_cap_rank: Schema.optional(Schema.NullOr(Schema.Number)),
  total_volume: Schema.optional(Schema.NullOr(Schema.Number)),
  price_change_percentage_24h: Schema.optional(Schema.NullOr(Schema.Number)),
  price_change_percentage_1h_in_currency: Schema.optional(
    Schema.NullOr(Schema.Number),
  ),
  price_change_percentage_7d_in_currency: Schema.optional(
    Schema.NullOr(Schema.Number),
  ),
  price_change_percentage_30d_in_currency: Schema.optional(
    Schema.NullOr(Schema.Number),
  ),
  circulating_supply: Schema.optional(Schema.NullOr(Schema.Number)),
  max_supply: Schema.optional(Schema.NullOr(Schema.Number)),
  last_updated: Schema.optional(Schema.String),
});

export type CoinGeckoMarketsRow = typeof CoinGeckoMarketsRowSchema.Type;

const decodeMarketsRow = Schema.decodeUnknownSync(CoinGeckoMarketsRowSchema);

/**
 * Decodes a `coins/markets` payload row-leniently: invalid rows are dropped
 * (and logged) instead of failing the whole batch — matching the previous
 * cast-based behavior for valid-but-sparse data while rejecting garbage.
 */
export function decodeMarketsRows(
  data: unknown,
): ReadonlyArray<CoinGeckoMarketsRow> {
  if (!Array.isArray(data)) return [];
  const rows: CoinGeckoMarketsRow[] = [];
  let dropped = 0;
  for (const raw of data) {
    try {
      rows.push(decodeMarketsRow(raw));
    } catch {
      dropped += 1;
    }
  }
  if (dropped > 0) {
    console.warn(`[coingecko] dropped ${dropped} malformed markets rows`);
  }
  return rows;
}

const UsdValueSchema = Schema.Struct({
  usd: Schema.optional(Schema.NullOr(Schema.Number)),
});

export const CoinGeckoCoinResponseSchema = Schema.Struct({
  id: Schema.String,
  symbol: Schema.String,
  name: Schema.String,
  image: Schema.optional(
    Schema.Struct({
      thumb: Schema.optional(Schema.String),
      small: Schema.optional(Schema.String),
      large: Schema.optional(Schema.String),
    }),
  ),
  market_data: Schema.optional(
    Schema.Struct({
      current_price: Schema.optional(UsdValueSchema),
      market_cap: Schema.optional(UsdValueSchema),
      total_volume: Schema.optional(UsdValueSchema),
      market_cap_rank: Schema.optional(Schema.NullOr(Schema.Number)),
      price_change_percentage_24h: Schema.optional(Schema.NullOr(Schema.Number)),
      price_change_percentage_1h_in_currency: Schema.optional(UsdValueSchema),
      price_change_percentage_7d_in_currency: Schema.optional(UsdValueSchema),
      price_change_percentage_30d_in_currency: Schema.optional(UsdValueSchema),
      circulating_supply: Schema.optional(Schema.NullOr(Schema.Number)),
      max_supply: Schema.optional(Schema.NullOr(Schema.Number)),
      last_updated: Schema.optional(Schema.String),
    }),
  ),
});

export type CoinGeckoCoinResponse = typeof CoinGeckoCoinResponseSchema.Type;

export const decodeCoinResponse = Schema.decodeUnknownSync(
  CoinGeckoCoinResponseSchema,
);
