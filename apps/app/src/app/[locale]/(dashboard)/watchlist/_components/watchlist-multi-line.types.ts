import type { Time } from "lightweight-charts"

export interface WatchlistPriceDataPoint {
  time: Time
  value: number
}

export interface WatchlistChartSeries {
  id: string
  name: string
  icon?: string
  color: string
  data: WatchlistPriceDataPoint[]
}

export interface WatchlistSeries extends WatchlistChartSeries {
  coinsCount: number
  latestValue: number
}

export interface TooltipWatchlistDataRow {
  name: string
  color: string
  value: number | null
  icon?: string
}
