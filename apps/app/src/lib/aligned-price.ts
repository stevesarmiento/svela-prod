import type { Time } from "lightweight-charts"

export interface ChartPoint {
  time: Time
  value: number
}

export function getAlignedPriceFromChartPoints(
  chartData: ReadonlyArray<ChartPoint> | null | undefined,
): number | null {
  if (!chartData?.length) return null
  for (let i = chartData.length - 1; i >= 0; i--) {
    const v = chartData[i]?.value
    if (typeof v !== "number") continue
    if (!Number.isFinite(v) || v <= 0) continue
    return v
  }
  return null
}

