'use client'

import { findPairedDivergences } from './divergence-engine'
import type { OHLCVDataPoint, SeriesDataPoint } from './market-vision-config'
import { rsi as rsiCalc } from './technical-indicators'

export type RsiDivergenceType = 'bullish' | 'bearish' | 'h_bullish' | 'h_bearish'

export interface RsiDivergence {
  type: RsiDivergenceType
  startIndex: number
  endIndex: number
  startTime: number
  endTime: number
  rsiStart: number
  rsiEnd: number
  priceStart: number
  priceEnd: number
}

export interface RsiDivergencesConfig {
  rsiLength: number
  leftBars: number
  rightBars: number
  pairMode: 'TV-like' | 'Same Bar'
  tolBars: number
  priceMode: 'High/Low' | 'Close'
  allowEqual: boolean
  priceEps: number
  rsiEps: number
  showRegular: boolean
  showHidden: boolean
}

export interface RsiDivergencesResult {
  rsiSeries: SeriesDataPoint[]
  levels: {
    overbought: SeriesDataPoint[]
    middle: SeriesDataPoint[]
    oversold: SeriesDataPoint[]
  }
  divergences: RsiDivergence[]
}

const DEFAULT_CONFIG: RsiDivergencesConfig = {
  rsiLength: 14,
  leftBars: 5,
  rightBars: 5,
  pairMode: 'TV-like',
  tolBars: 2,
  priceMode: 'High/Low',
  allowEqual: true,
  priceEps: 0,
  rsiEps: 0,
  showRegular: true,
  showHidden: true,
}

function buildLevels(times: number[]): RsiDivergencesResult['levels'] {
  return {
    overbought: times.map((time) => ({ time, value: 70 })),
    middle: times.map((time) => ({ time, value: 50 })),
    oversold: times.map((time) => ({ time, value: 30 })),
  }
}

export function calculateRsiDivergences(
  data: OHLCVDataPoint[],
  config?: Partial<RsiDivergencesConfig>,
): RsiDivergencesResult {
  const finalConfig: RsiDivergencesConfig = { ...DEFAULT_CONFIG, ...(config ?? {}) }

  if (!data.length) {
    return {
      rsiSeries: [],
      levels: { overbought: [], middle: [], oversold: [] },
      divergences: [],
    }
  }

  const times = data.map((d) => d.time)
  const closes = data.map((d) => d.close)
  const highs = data.map((d) => (finalConfig.priceMode === 'High/Low' ? d.high : d.close))
  const lows = data.map((d) => (finalConfig.priceMode === 'High/Low' ? d.low : d.close))

  const rsiValues = rsiCalc(closes, finalConfig.rsiLength)

  const rsiSeries: SeriesDataPoint[] = times.map((time, i) => ({
    time,
    value: rsiValues[i] ?? 0,
  }))

  const paired = findPairedDivergences(highs, lows, rsiValues, {
    leftBars: finalConfig.leftBars,
    rightBars: finalConfig.rightBars,
    pairMode: finalConfig.pairMode,
    tolBars: finalConfig.tolBars,
    allowEqual: finalConfig.allowEqual,
    priceEps: finalConfig.priceEps,
    oscEps: finalConfig.rsiEps,
    showRegular: finalConfig.showRegular,
    showHidden: finalConfig.showHidden,
  })

  const divergences: RsiDivergence[] = paired.map((d) => ({
    type: d.type,
    startIndex: d.startIndex,
    endIndex: d.endIndex,
    startTime: times[d.startIndex] ?? 0,
    endTime: times[d.endIndex] ?? 0,
    rsiStart: d.oscStart,
    rsiEnd: d.oscEnd,
    priceStart: d.priceStart,
    priceEnd: d.priceEnd,
  }))

  return {
    rsiSeries,
    levels: buildLevels(times),
    divergences,
  }
}
