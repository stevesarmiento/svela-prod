export type MetricUnit = "usd" | "percent" | "ratio" | "rank" | "number"
export type MetricSource = "markets" | "priceHistory"

export interface CoingeckoMarketRowLike {
  coingeckoId: string
  symbol: string
  name: string
  image: string

  currentPrice?: number
  marketCap?: number
  marketCapRank?: number
  fullyDilutedValuation?: number
  totalVolume?: number

  high24h?: number
  low24h?: number
  priceChange24h?: number
  priceChangePercentage24h?: number

  marketCapChange24h?: number
  marketCapChangePercentage24h?: number

  circulatingSupply?: number
  totalSupply?: number
  maxSupply?: number

  ath?: number
  athChangePercentage?: number
  atl?: number
  atlChangePercentage?: number

  updatedAt?: number
}

export interface MarketsMetricDefinition {
  id: string
  label: string
  unit: MetricUnit
  synonyms: ReadonlyArray<string>
  description?: string
  source: "markets"
  getValue: (row: CoingeckoMarketRowLike) => number | null
}

function pctChangeFromCurrentAndReference(args: {
  current: number | null
  reference: number | null
  kind: "drawdownFromHigh" | "upsideFromLow"
}): number | null {
  if (args.current == null || args.reference == null) return null
  if (!Number.isFinite(args.current) || !Number.isFinite(args.reference)) return null
  if (args.reference <= 0) return null

  if (args.kind === "drawdownFromHigh") {
    // Positive drawdown percent when current < reference.
    return ((args.reference - args.current) / args.reference) * 100
  }
  return ((args.current - args.reference) / args.reference) * 100
}

function pctRangeFromHighLowAndCurrent(args: {
  high: number | null
  low: number | null
  current: number | null
}): number | null {
  if (args.high == null || args.low == null || args.current == null) return null
  if (!Number.isFinite(args.high) || !Number.isFinite(args.low) || !Number.isFinite(args.current)) return null
  if (args.current <= 0) return null
  if (args.high < args.low) return null
  return ((args.high - args.low) / args.current) * 100
}

export const SMART_SCREENER_MARKET_METRICS: ReadonlyArray<MarketsMetricDefinition> = [
  {
    id: "price_usd",
    label: "Price",
    unit: "usd",
    synonyms: ["price", "spot price", "current price"],
    source: "markets",
    getValue: (r) => (typeof r.currentPrice === "number" ? r.currentPrice : null),
  },
  {
    id: "market_cap_usd",
    label: "Market cap",
    unit: "usd",
    synonyms: ["market cap", "marketcap", "mcap"],
    source: "markets",
    getValue: (r) => (typeof r.marketCap === "number" ? r.marketCap : null),
  },
  {
    id: "volume_24h_usd",
    label: "24h volume",
    unit: "usd",
    synonyms: ["volume", "24h volume", "volume 24h"],
    source: "markets",
    getValue: (r) => (typeof r.totalVolume === "number" ? r.totalVolume : null),
  },
  {
    id: "fdv_usd",
    label: "FDV",
    unit: "usd",
    synonyms: ["fdv", "fully diluted valuation", "fully-diluted valuation"],
    source: "markets",
    getValue: (r) => (typeof r.fullyDilutedValuation === "number" ? r.fullyDilutedValuation : null),
  },
  {
    id: "market_cap_rank",
    label: "Market cap rank",
    unit: "rank",
    synonyms: ["rank", "market rank", "market cap rank"],
    source: "markets",
    getValue: (r) => (typeof r.marketCapRank === "number" ? r.marketCapRank : null),
  },
  {
    id: "price_change_24h_pct",
    label: "24h price change (%)",
    unit: "percent",
    synonyms: ["change 24h", "24h change", "price change 24h", "24h pct change", "24h %"],
    description: "Percent points, e.g. 10 means +10%.",
    source: "markets",
    getValue: (r) =>
      typeof r.priceChangePercentage24h === "number" ? r.priceChangePercentage24h : null,
  },
  {
    id: "market_cap_change_24h_pct",
    label: "24h market cap change (%)",
    unit: "percent",
    synonyms: ["market cap change 24h", "mcap change 24h", "market cap % 24h"],
    description: "Percent points, e.g. 10 means +10%.",
    source: "markets",
    getValue: (r) =>
      typeof r.marketCapChangePercentage24h === "number" ? r.marketCapChangePercentage24h : null,
  },
  {
    id: "price_change_24h_usd",
    label: "24h price change ($)",
    unit: "usd",
    synonyms: ["price change 24h usd", "24h price change usd", "price delta 24h"],
    source: "markets",
    getValue: (r) => (typeof r.priceChange24h === "number" ? r.priceChange24h : null),
  },
  {
    id: "market_cap_change_24h_usd",
    label: "24h market cap change ($)",
    unit: "usd",
    synonyms: ["market cap change 24h usd", "mcap delta 24h", "market cap delta 24h"],
    source: "markets",
    getValue: (r) => (typeof r.marketCapChange24h === "number" ? r.marketCapChange24h : null),
  },
  {
    id: "range_24h_pct",
    label: "24h range (%)",
    unit: "percent",
    synonyms: ["24h range", "range 24h", "high low range", "24h volatility"],
    description: "(high24h - low24h) / currentPrice * 100",
    source: "markets",
    getValue: (r) =>
      pctRangeFromHighLowAndCurrent({
        high: typeof r.high24h === "number" ? r.high24h : null,
        low: typeof r.low24h === "number" ? r.low24h : null,
        current: typeof r.currentPrice === "number" ? r.currentPrice : null,
      }),
  },
  {
    id: "ath_drawdown_pct",
    label: "ATH drawdown (%)",
    unit: "percent",
    synonyms: ["drawdown from ath", "ath drawdown", "distance from ath"],
    description: "(ath - currentPrice) / ath * 100 (positive means below ATH)",
    source: "markets",
    getValue: (r) =>
      pctChangeFromCurrentAndReference({
        current: typeof r.currentPrice === "number" ? r.currentPrice : null,
        reference: typeof r.ath === "number" ? r.ath : null,
        kind: "drawdownFromHigh",
      }),
  },
  {
    id: "atl_upside_pct",
    label: "ATL upside (%)",
    unit: "percent",
    synonyms: ["upside from atl", "atl upside", "distance from atl"],
    description: "(currentPrice - atl) / atl * 100",
    source: "markets",
    getValue: (r) =>
      pctChangeFromCurrentAndReference({
        current: typeof r.currentPrice === "number" ? r.currentPrice : null,
        reference: typeof r.atl === "number" ? r.atl : null,
        kind: "upsideFromLow",
      }),
  },
] as const

export const SMART_SCREENER_MARKET_METRIC_IDS: ReadonlyArray<string> =
  SMART_SCREENER_MARKET_METRICS.map((m) => m.id)

export function getSmartScreenerMarketMetric(metricId: string): MarketsMetricDefinition | null {
  const metric = SMART_SCREENER_MARKET_METRICS.find((m) => m.id === metricId) ?? null
  return metric ?? null
}

