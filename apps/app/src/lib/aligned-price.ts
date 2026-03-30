import type { Time } from "lightweight-charts"

export interface ChartPoint {
  time: Time
  value: number
}

export function getLastFinitePositiveNumber(
  values: ReadonlyArray<number> | null | undefined,
): number | null {
  if (!values?.length) return null
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i]
    if (typeof v !== "number") continue
    if (!Number.isFinite(v) || v <= 0) continue
    return v
  }
  return null
}

export function getAlignedPriceFromSparkline7d(
  sparkline7d: ReadonlyArray<number> | null | undefined,
): number | null {
  return getLastFinitePositiveNumber(sparkline7d)
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

export function getAlignedPriceFromPairs(
  pairs: ReadonlyArray<readonly [number, number]> | null | undefined,
): number | null {
  if (!pairs?.length) return null
  for (let i = pairs.length - 1; i >= 0; i--) {
    const price = pairs[i]?.[1]
    if (typeof price !== "number") continue
    if (!Number.isFinite(price) || price <= 0) continue
    return price
  }
  return null
}

