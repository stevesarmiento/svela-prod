import type { ISeriesApi, Time } from "lightweight-charts"

export interface PriceDataPoint {
  time: Time
  value: number
}

export interface TooltipCoinData {
  id: string
  name: string
  color: string
  value: number
  symbol: string
}

export interface CoinSeries {
  id: string
  name: string
  symbol: string
  color: string
  data: PriceDataPoint[]
}

export interface LineSeriesData {
  series: ISeriesApi<"Line">
  coinData: CoinSeries
}
