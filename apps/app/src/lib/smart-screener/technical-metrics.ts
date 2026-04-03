import type { MetricUnit } from "./metric-catalog"

export interface PriceHistoryPointLike {
  timestamp: number
  price: number
}

export interface PriceHistoryMetricDefinition {
  id: string
  label: string
  unit: MetricUnit
  synonyms: ReadonlyArray<string>
  description?: string
  source: "priceHistory"
  timeframeDays: "7" | "30"
  getValue: (points: ReadonlyArray<PriceHistoryPointLike>) => number | null
}

function pctReturn(points: ReadonlyArray<PriceHistoryPointLike>): number | null {
  if (points.length < 2) return null
  const first = points[0]?.price
  const last = points[points.length - 1]?.price
  if (typeof first !== "number" || typeof last !== "number") return null
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null
  if (first <= 0) return null
  return ((last - first) / first) * 100
}

function stddev(values: ReadonlyArray<number>): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1)
  const out = Math.sqrt(variance)
  return Number.isFinite(out) ? out : null
}

function pctVolatility(points: ReadonlyArray<PriceHistoryPointLike>): number | null {
  if (points.length < 3) return null
  const returns: Array<number> = []
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]?.price
    const next = points[i]?.price
    if (typeof prev !== "number" || typeof next !== "number") continue
    if (!Number.isFinite(prev) || !Number.isFinite(next) || prev <= 0) continue
    returns.push(Math.log(next / prev))
  }
  const s = stddev(returns)
  if (s == null) return null
  // Convert log-return stddev to percent points (rough, but stable).
  return s * 100
}

export const SMART_SCREENER_TECHNICAL_METRICS: ReadonlyArray<PriceHistoryMetricDefinition> = [
  {
    id: "return_7d_pct",
    label: "7d return (%)",
    unit: "percent",
    synonyms: ["7d return", "return 7d", "weekly return", "past week return"],
    source: "priceHistory",
    timeframeDays: "7",
    getValue: pctReturn,
  },
  {
    id: "return_30d_pct",
    label: "30d return (%)",
    unit: "percent",
    synonyms: ["30d return", "return 30d", "monthly return", "past month return"],
    source: "priceHistory",
    timeframeDays: "30",
    getValue: pctReturn,
  },
  {
    id: "volatility_7d_pct",
    label: "7d volatility (%)",
    unit: "percent",
    synonyms: ["7d volatility", "volatility 7d", "weekly volatility", "vol 7d"],
    description: "Stddev of log returns over the last 7d (percent points).",
    source: "priceHistory",
    timeframeDays: "7",
    getValue: pctVolatility,
  },
] as const

export const SMART_SCREENER_TECHNICAL_METRIC_IDS: ReadonlyArray<string> =
  SMART_SCREENER_TECHNICAL_METRICS.map((m) => m.id)

