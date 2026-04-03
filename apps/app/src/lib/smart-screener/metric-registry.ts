import {
  SMART_SCREENER_MARKET_METRICS,
  SMART_SCREENER_MARKET_METRIC_IDS,
  getSmartScreenerMarketMetric,
  type MarketsMetricDefinition,
} from "./metric-catalog"
import {
  SMART_SCREENER_TECHNICAL_METRICS,
  SMART_SCREENER_TECHNICAL_METRIC_IDS,
  type PriceHistoryMetricDefinition,
} from "./technical-metrics"

export type SmartScreenerMetricDefinition = MarketsMetricDefinition | PriceHistoryMetricDefinition

export const SMART_SCREENER_METRICS: ReadonlyArray<SmartScreenerMetricDefinition> = [
  ...SMART_SCREENER_MARKET_METRICS,
  ...SMART_SCREENER_TECHNICAL_METRICS,
] as const

export const SMART_SCREENER_METRIC_IDS: ReadonlyArray<string> = [
  ...SMART_SCREENER_MARKET_METRIC_IDS,
  ...SMART_SCREENER_TECHNICAL_METRIC_IDS,
] as const

export function getSmartScreenerMetric(metricId: string): SmartScreenerMetricDefinition | null {
  const market = getSmartScreenerMarketMetric(metricId)
  if (market) return market
  const technical = SMART_SCREENER_TECHNICAL_METRICS.find((m) => m.id === metricId) ?? null
  return technical ?? null
}

