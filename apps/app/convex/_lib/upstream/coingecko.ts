/**
 * Loose zod schemas for the CoinGecko fields this codebase actually consumes.
 *
 * Deliberately permissive (`.nullish()` / `.catch()` liberally): a schema
 * stricter than the previous `as` casts would turn tolerated payload quirks
 * into new failures. Envelope-level mismatches throw UpstreamValidationError;
 * malformed individual rows are skipped so one bad row cannot take down a
 * whole batch.
 */

import { z } from "zod";
import { parseUpstream } from "./parse";

const SOURCE = "coingecko";

/** [timestamp, value, ...ignored] — chart points are at-least-2-tuples. */
const chartPointSchema = z.tuple([z.number(), z.number()]).rest(z.unknown());

export const marketChartResponseSchema = z.object({
  prices: z.array(chartPointSchema),
  market_caps: z.array(chartPointSchema).nullish(),
  total_volumes: z.array(chartPointSchema).nullish(),
});
export type MarketChartResponse = z.infer<typeof marketChartResponseSchema>;

export function parseMarketChartResponse(value: unknown): MarketChartResponse {
  return parseUpstream({ source: SOURCE, schema: marketChartResponseSchema, value });
}

export const globalMarketCapChartResponseSchema = z.object({
  market_cap_chart: z
    .object({
      market_cap: z.array(chartPointSchema).nullish(),
      volume: z.array(chartPointSchema).nullish(),
    })
    .nullish(),
});
export type GlobalMarketCapChartResponse = z.infer<
  typeof globalMarketCapChartResponseSchema
>;

export function parseGlobalMarketCapChartResponse(
  value: unknown,
): GlobalMarketCapChartResponse {
  return parseUpstream({
    source: SOURCE,
    schema: globalMarketCapChartResponseSchema,
    value,
  });
}

/** [time, open, high, low, close, ...ignored]. */
const ohlcRowSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number(), z.number()])
  .rest(z.unknown());
export type CoinGeckoOhlcRow = z.infer<typeof ohlcRowSchema>;

export function parseOhlcRows(value: unknown): CoinGeckoOhlcRow[] {
  return parseUpstream({ source: SOURCE, schema: z.array(ohlcRowSchema), value });
}

/**
 * /coins/markets row — only the fields the upsert paths consume. Strings the
 * mappers call methods on (id/symbol/name/image) are required; everything
 * else is nullish because CoinGecko omits or nulls them freely.
 */
export const marketRowSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  image: z.string(),
  current_price: z.number().nullish(),
  market_cap: z.number().nullish(),
  market_cap_rank: z.number().nullish(),
  fully_diluted_valuation: z.number().nullish(),
  total_volume: z.number().nullish(),
  high_24h: z.number().nullish(),
  low_24h: z.number().nullish(),
  price_change_24h: z.number().nullish(),
  price_change_percentage_24h: z.number().nullish(),
  market_cap_change_24h: z.number().nullish(),
  market_cap_change_percentage_24h: z.number().nullish(),
  circulating_supply: z.number().nullish(),
  total_supply: z.number().nullish(),
  max_supply: z.number().nullish(),
  ath: z.number().nullish(),
  ath_change_percentage: z.number().nullish(),
  ath_date: z.string().nullish(),
  atl: z.number().nullish(),
  atl_change_percentage: z.number().nullish(),
  atl_date: z.string().nullish(),
  last_updated: z.string().nullish(),
  // Present only when requested via price_change_percentage=24h,7d,30d
  // and sparkline=true (the 4h top-markets cron; NOT the tracked cron).
  price_change_percentage_7d_in_currency: z.number().nullish(),
  price_change_percentage_30d_in_currency: z.number().nullish(),
  // Sparkline arrays occasionally contain nulls; the volatility math skips
  // non-finite entries, so tolerate them here too.
  sparkline_in_7d: z
    .object({ price: z.array(z.number().nullable()).nullish() })
    .nullish(),
});
export type CoinGeckoMarketRow = z.infer<typeof marketRowSchema>;

export function parseMarketRows(value: unknown): CoinGeckoMarketRow[] {
  const rows = parseUpstream({
    source: SOURCE,
    schema: z.array(z.unknown()),
    value,
  });
  return rows.flatMap((row) => {
    const parsed = marketRowSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

/** /coins/list row (include_platform=true). */
export const coinListRowSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  platforms: z.record(z.string()).nullish().catch(null),
});
export type CoinGeckoCoinListRow = z.infer<typeof coinListRowSchema>;

export function parseCoinListRows(value: unknown): CoinGeckoCoinListRow[] {
  const rows = parseUpstream({
    source: SOURCE,
    schema: z.array(z.unknown()),
    value,
  });
  return rows.flatMap((row) => {
    const parsed = coinListRowSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * /news row. Every field is `.catch(undefined)` so a wrong-typed field
 * degrades to "absent" — exactly what the previous per-field `typeof`
 * mapping produced.
 */
export const coinGeckoNewsRowSchema = z.object({
  title: z.string().optional().catch(undefined),
  url: z.string().optional().catch(undefined),
  image: z.string().optional().catch(undefined),
  author: z.string().optional().catch(undefined),
  posted_at: z.string().optional().catch(undefined),
  type: z.string().optional().catch(undefined),
  source_name: z.string().optional().catch(undefined),
});
export type CoinGeckoNewsRow = z.infer<typeof coinGeckoNewsRowSchema>;
