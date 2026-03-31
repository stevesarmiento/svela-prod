/* eslint-disable no-console */
'use client'

import type { OHLCVDataPoint, SeriesDataPoint } from './market-vision-config'
import { ema, hullMA, rma, sma, stdev, vwma, wma } from './technical-indicators'

export type BBWPPriceSource = 'close' | 'open' | 'high' | 'low' | 'hlc3'
export type BBWPMovingAverageType = 'SMA' | 'EMA' | 'WMA' | 'RMA' | 'HMA' | 'VWMA'

export interface BBWPConfig {
  priceSource: BBWPPriceSource
  basisType: BBWPMovingAverageType
  basisLength: number
  lookback: number

  maType: BBWPMovingAverageType
  maLength: number

  extremeHigh: number
  extremeLow: number
}

export interface BBWPResult {
  bbwp: SeriesDataPoint[]
  ma: SeriesDataPoint[]
  levels: {
    high: SeriesDataPoint[]
    mid: SeriesDataPoint[]
    low: SeriesDataPoint[]
    extremeHigh: SeriesDataPoint[]
    extremeLow: SeriesDataPoint[]
  }
}

export const DEFAULT_BBWP_CONFIG: BBWPConfig = {
  priceSource: 'close',
  basisType: 'SMA',
  basisLength: 7,
  lookback: 100,

  maType: 'SMA',
  maLength: 5,

  extremeHigh: 98,
  extremeLow: 2,
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function getPriceSeries(data: OHLCVDataPoint[], source: BBWPPriceSource): number[] {
  switch (source) {
    case 'open':
      return data.map((d) => d.open)
    case 'high':
      return data.map((d) => d.high)
    case 'low':
      return data.map((d) => d.low)
    case 'hlc3':
      return data.map((d) => (d.high + d.low + d.close) / 3)
    default:
      return data.map((d) => d.close)
  }
}

function basisMa(type: BBWPMovingAverageType, values: number[], len: number, volumes: number[]): number[] {
  switch (type) {
    case 'SMA':
      return sma(values, len)
    case 'EMA':
      return ema(values, len)
    case 'WMA':
      return wma(values, len)
    case 'RMA':
      return rma(values, len)
    case 'HMA':
      return hullMA(values, len)
    case 'VWMA':
      return vwma(values, volumes, len)
    default:
      return sma(values, len)
  }
}

function binarySearchRightmostLikePine(sortedAsc: number[], value: number): number {
  // Mirrors Pine Script's `array.binary_search_rightmost()` behavior used in the provided script:
  // - If value is found, return the index of the rightmost matching element.
  // - If not found, return the insertion index to the right (first index where element > value).
  //
  // This is implemented via upper-bound + equality check.
  let lo = 0
  let hi = sortedAsc.length

  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const midValue = sortedAsc[mid]
    if (midValue != null && midValue <= value) lo = mid + 1
    else hi = mid
  }

  const upperBound = lo // first index with element > value
  const rightmostEqualIdx = upperBound - 1
  if (rightmostEqualIdx >= 0 && sortedAsc[rightmostEqualIdx] === value) return rightmostEqualIdx
  return upperBound
}

function rollingPercentileRankRightmost(
  values: Array<number | null>,
  bbwLen: number,
  lookback: number
): Array<number | null> {
  const rawValues: number[] = []
  const sortedValues: number[] = []
  const out: Array<number | null> = new Array(values.length).fill(null)

  for (let i = 0; i < values.length; i++) {
    const v = values[i]

    // Match Pine condition: `if bar_index >= _bbwLen`
    if (i < bbwLen) continue
    if (v == null || !Number.isFinite(v)) continue

    const idxOrInsert = binarySearchRightmostLikePine(sortedValues, v)
    const denom = sortedValues.length
    out[i] = denom > 0 ? (idxOrInsert * 100.0) / denom : null

    rawValues.push(v)
    sortedValues.splice(idxOrInsert, 0, v)

    if (rawValues.length > lookback) {
      const oldValue = rawValues.shift()
      if (oldValue != null) {
        const removalIndex = binarySearchRightmostLikePine(sortedValues, oldValue)
        // Pine expects this removal index to be in-bounds for found values.
        if (removalIndex >= 0 && removalIndex < sortedValues.length) sortedValues.splice(removalIndex, 1)
      }
    }
  }

  return out
}

function movingAverageNullable(
  type: BBWPMovingAverageType,
  values: Array<number | null>,
  len: number,
  volumes: number[]
): Array<number | null> {
  if (len <= 0) return new Array(values.length).fill(null)

  // For BBWP MA overlay, we mimic Pine behavior by propagating nulls until enough valid samples exist.
  // We compute MA on a dense array while tracking validity.
  const dense: number[] = values.map((v) => (v == null || !Number.isFinite(v) ? Number.NaN : v))
  const computed = basisMa(type, dense.map((v) => (Number.isFinite(v) ? v : 0)), len, volumes)

  const out: Array<number | null> = new Array(values.length).fill(null)
  let validCount = 0
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v != null && Number.isFinite(v)) validCount++

    // Require at least `len` valid values in the prefix window.
    // This is a pragmatic match for Pine’s NA propagation on early samples.
    if (validCount < len) continue

    const c = computed[i]
    if (c != null && Number.isFinite(c)) out[i] = c
  }
  return out
}

export function calculateBBWP(data: OHLCVDataPoint[], config: Partial<BBWPConfig> = {}): BBWPResult {
  const finalConfig: BBWPConfig = { ...DEFAULT_BBWP_CONFIG, ...config }
  const basisLength = Math.max(1, Math.floor(finalConfig.basisLength))
  const lookback = Math.max(10, Math.floor(finalConfig.lookback))
  const maLength = Math.max(1, Math.floor(finalConfig.maLength))

  const extremeHigh = clampNumber(finalConfig.extremeHigh, 50, 100)
  const extremeLow = clampNumber(finalConfig.extremeLow, 0, 50)

  if (!data || data.length === 0) {
    return {
      bbwp: [],
      ma: [],
      levels: { high: [], mid: [], low: [], extremeHigh: [], extremeLow: [] },
    }
  }

  const times = data.map((d) => d.time)
  const volumes = data.map((d) => (Number.isFinite(d.volume) ? d.volume : 0))
  const price = getPriceSeries(data, finalConfig.priceSource)

  const basis = basisMa(finalConfig.basisType, price, basisLength, volumes)
  const deviation = stdev(price, basisLength)

  const bbw: Array<number | null> = new Array(data.length).fill(null)
  for (let i = 0; i < data.length; i++) {
    const b = basis[i] ?? Number.NaN
    const dev = deviation[i] ?? Number.NaN
    if (!Number.isFinite(b) || !Number.isFinite(dev) || b === 0) continue
    bbw[i] = (2 * dev) / b
  }

  const bbwpValues = rollingPercentileRankRightmost(bbw, basisLength, lookback).map((v) =>
    v == null ? null : clampNumber(v, 0, 100)
  )

  const maValues = movingAverageNullable(finalConfig.maType, bbwpValues, maLength, volumes).map((v) =>
    v == null ? null : clampNumber(v, 0, 100)
  )

  const bbwpSeries: SeriesDataPoint[] = []
  const maSeries: SeriesDataPoint[] = []

  const levelHigh: SeriesDataPoint[] = []
  const levelMid: SeriesDataPoint[] = []
  const levelLow: SeriesDataPoint[] = []
  const levelExtremeHigh: SeriesDataPoint[] = []
  const levelExtremeLow: SeriesDataPoint[] = []

  for (let i = 0; i < times.length; i++) {
    const time = times[i]
    if (time == null) continue

    levelHigh.push({ time, value: 100 })
    levelMid.push({ time, value: 50 })
    levelLow.push({ time, value: 0 })
    levelExtremeHigh.push({ time, value: extremeHigh })
    levelExtremeLow.push({ time, value: extremeLow })

    const v = bbwpValues[i]
    if (v != null && Number.isFinite(v)) bbwpSeries.push({ time, value: v })

    const m = maValues[i]
    if (m != null && Number.isFinite(m)) maSeries.push({ time, value: m })
  }

  return {
    bbwp: bbwpSeries,
    ma: maSeries,
    levels: {
      high: levelHigh,
      mid: levelMid,
      low: levelLow,
      extremeHigh: levelExtremeHigh,
      extremeLow: levelExtremeLow,
    },
  }
}

