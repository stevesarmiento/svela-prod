import { z } from "zod";

export const WatchlistGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

const BuyRatioSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    const cleaned = value.trim().replace(/%$/g, "");
    const parsed = Number.parseFloat(cleaned);
    if (!Number.isFinite(parsed)) return value;
    // If the user wrote "55%" or "55", normalize to 0.55.
    if (parsed > 1) return parsed / 100;
    return parsed;
  }
  if (typeof value !== "number") return value;
  if (!Number.isFinite(value)) return 0;
  // Allow either 0..1 or 0..100 input (normalize percentages).
  if (value > 1) return value / 100;
  return value;
}, z.number().min(0).max(1));

function parseCompactUsdAmount(raw: string): number | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replaceAll("$", "")
    .replaceAll(",", "")
    .replaceAll("_", "");

  if (!cleaned) return null;

  const match = cleaned.match(/^([0-9]*\.?[0-9]+)\s*(k|m|b|t|bn)?$/);
  if (!match) return null;

  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;

  const suffix = match[2] ?? "";
  const mult =
    suffix === "k"
      ? 1e3
      : suffix === "m"
        ? 1e6
        : suffix === "b" || suffix === "bn"
          ? 1e9
          : suffix === "t"
            ? 1e12
            : 1;

  const value = n * mult;
  return Number.isFinite(value) ? value : null;
}

const UsdAmountSchema = z.preprocess((value) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = parseCompactUsdAmount(value);
    return parsed ?? value;
  }
  return value;
}, z.number().min(0));

export const TakerFilterValueSchema = z.object({
  range: z.enum(["1h", "4h", "12h", "24h", "7d"]).optional().default("24h"),
  exchange: z.string().nullable().optional().default(null),
  minBuyRatio: z.union([z.null(), BuyRatioSchema]).optional().default(null),
  minBuyVolumeUsd: z
    .union([z.null(), UsdAmountSchema])
    .optional()
    .default(null),
  minTotalVolumeUsd: z
    .union([z.null(), UsdAmountSchema])
    .optional()
    .default(null),
  minNetBuyUsd: z.union([z.null(), UsdAmountSchema]).optional().default(null),
  requireBuyGreaterThanSell: z.boolean().optional().default(false),
});

export const ActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("watchlistGroupId"),
    value: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("changeFilter"),
    value: z.enum(["all", "positive", "negative"]),
  }),
  z.object({
    kind: z.literal("sortBy"),
    value: z.enum(["name", "price", "change", "marketCap", "volume"]),
  }),
  z.object({ kind: z.literal("sortOrder"), value: z.enum(["asc", "desc"]) }),
  z.object({ kind: z.literal("takerFilter"), value: TakerFilterValueSchema }),
]);

export const RequestSchema = z.object({
  text: z.string().min(1),
  surface: z.enum(["watchlist", "screener"]).optional().default("watchlist"),
  watchlistGroups: z.array(WatchlistGroupSchema).max(200),
  current: z
    .object({
      watchlistGroupId: z.string().nullable(),
      changeFilter: z.enum(["all", "positive", "negative"]),
      sortBy: z.enum(["name", "price", "change", "marketCap", "volume"]),
      sortOrder: z.enum(["asc", "desc"]),
      takerFilter: z
        .object({
          range: z.enum(["1h", "4h", "12h", "24h", "7d"]),
          exchange: z.string().nullable(),
          minBuyRatio: z.number().nullable(),
          minBuyVolumeUsd: z.number().nullable(),
          minTotalVolumeUsd: z.number().nullable(),
          minNetBuyUsd: z.number().nullable(),
          requireBuyGreaterThanSell: z.boolean(),
        })
        .nullable()
        .optional(),
    })
    .optional(),
});

export const ResponseSchema = z.object({
  actions: z.array(ActionSchema).max(20),
  fallbackSearchText: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});
