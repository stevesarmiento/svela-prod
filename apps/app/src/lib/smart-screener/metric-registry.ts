import {
  type MarketsMetricDefinition,
  SMART_SCREENER_MARKET_METRICS,
  SMART_SCREENER_MARKET_METRIC_IDS,
} from "./metric-catalog";
import {
  SMART_SCREENER_TAKER_METRICS,
  SMART_SCREENER_TAKER_METRIC_IDS,
  type TakerMetricDefinition,
} from "./taker-metrics";
import {
  SMART_SCREENER_TECHNICAL_METRICS,
  SMART_SCREENER_TECHNICAL_METRIC_IDS,
} from "./technical-metrics";

export type SmartScreenerMetricDefinition =
  | MarketsMetricDefinition
  | TakerMetricDefinition;

export const SMART_SCREENER_METRICS: ReadonlyArray<SmartScreenerMetricDefinition> =
  [
    ...SMART_SCREENER_MARKET_METRICS,
    ...SMART_SCREENER_TECHNICAL_METRICS,
    ...SMART_SCREENER_TAKER_METRICS,
  ] as const;

export const SMART_SCREENER_METRIC_IDS: ReadonlyArray<string> = [
  ...SMART_SCREENER_MARKET_METRIC_IDS,
  ...SMART_SCREENER_TECHNICAL_METRIC_IDS,
  ...SMART_SCREENER_TAKER_METRIC_IDS,
] as const;

const METRICS_BY_ID: ReadonlyMap<string, SmartScreenerMetricDefinition> =
  new Map(SMART_SCREENER_METRICS.map((m) => [m.id, m]));

export function getSmartScreenerMetric(
  metricId: string,
): SmartScreenerMetricDefinition | null {
  return METRICS_BY_ID.get(metricId) ?? null;
}
