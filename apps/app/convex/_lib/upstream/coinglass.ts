/**
 * Loose zod schemas for the CoinGlass v4 fields this codebase consumes.
 *
 * The envelope (`{code, msg, data}`) is validated strictly enough to keep the
 * `code !== "0"` error check meaningful; per-endpoint points are validated
 * individually at call sites (safeParse each point, skip failures), matching
 * the previous `typeof point.time !== "number"` skip semantics. Value fields
 * stay maximally loose because toNumber/toFiniteNumberOrNull already tolerate
 * strings, numbers, and garbage.
 */

import { z } from "zod";

export const coinglassEnvelopeSchema = z.object({
  code: z.string(),
  msg: z.string().nullish(),
  data: z.unknown(),
});
export type CoinglassEnvelope = z.infer<typeof coinglassEnvelopeSchema>;

/** toNumber/toFiniteNumberOrNull consume these; anything weird becomes null. */
const looseValue = z.union([z.string(), z.number()]).nullish().catch(null);

export const coinglassHistoryPointSchema = z.object({
  time: z.number(),
  taker_buy_volume_usd: looseValue,
  taker_sell_volume_usd: looseValue,
});
export type CoinglassHistoryPoint = z.infer<typeof coinglassHistoryPointSchema>;

export const coinglassOpenInterestPointSchema = z.object({
  time: z.number(),
  open: looseValue,
  high: looseValue,
  low: looseValue,
  close: looseValue,
});
export type CoinglassOpenInterestPoint = z.infer<
  typeof coinglassOpenInterestPointSchema
>;

export const coinglassLiquidationPointSchema = z.object({
  time: z.number(),
  aggregated_long_liquidation_usd: looseValue,
  aggregated_short_liquidation_usd: looseValue,
});
export type CoinglassLiquidationPoint = z.infer<
  typeof coinglassLiquidationPointSchema
>;

/**
 * taker-buy-sell-volume/exchange-list `data` object. Core value fields stay
 * unknown (the caller's all-garbage detection decides whether to skip the
 * write); exchange rows are validated individually.
 */
export const coinglassTakerBuySellSnapshotSchema = z.object({
  buy_ratio: z.unknown(),
  sell_ratio: z.unknown(),
  buy_vol_usd: z.unknown(),
  sell_vol_usd: z.unknown(),
  exchange_list: z.array(z.unknown()).nullish().catch(null),
});
export type CoinglassTakerBuySellSnapshot = z.infer<
  typeof coinglassTakerBuySellSnapshotSchema
>;

export const coinglassTakerBuySellExchangeRowSchema = z.object({
  exchange: z.string(),
  buy_ratio: looseValue,
  sell_ratio: looseValue,
  buy_vol_usd: looseValue,
  sell_vol_usd: looseValue,
});
export type CoinglassTakerBuySellExchangeRow = z.infer<
  typeof coinglassTakerBuySellExchangeRowSchema
>;
