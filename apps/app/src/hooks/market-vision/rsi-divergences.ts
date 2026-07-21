'use client'

import { findPairedDivergences } from './divergence-engine'
import type { OHLCVDataPoint, SeriesDataPoint } from './market-vision-config'
import { DEFAULT_REVERSE_RSI_TARGETS, type ReverseRsiLevel, reverseRsiLevels, rsi as rsiCalc } from './technical-indicators'

export type { ReverseRsiLevel }

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
  /** Targets for reverse-RSI price levels (default: Caretaker zones 80/62/50/38/20). */
  reverseTargets?: readonly number[]
}

// The Caretaker's zone levels drawn on the RSI pane.
export const RSI_ZONE_LEVELS = {
  critBull: 80,
  contBull: 62,
  middle: 50,
  contBear: 38,
  critBear: 20,
} as const

export interface RsiDivergencesResult {
  rsiSeries: SeriesDataPoint[]
  levels: {
    critBull: SeriesDataPoint[]
    contBull: SeriesDataPoint[]
    middle: SeriesDataPoint[]
    contBear: SeriesDataPoint[]
    critBear: SeriesDataPoint[]
  }
  divergences: RsiDivergence[]
  /** Next-bar close needed for RSI to print each target (null when unreachable). */
  reverseLevels: ReverseRsiLevel[]
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
  reverseTargets: DEFAULT_REVERSE_RSI_TARGETS,
}

function buildLevels(times: number[]): RsiDivergencesResult['levels'] {
  return {
    critBull: times.map((time) => ({ time, value: RSI_ZONE_LEVELS.critBull })),
    contBull: times.map((time) => ({ time, value: RSI_ZONE_LEVELS.contBull })),
    middle: times.map((time) => ({ time, value: RSI_ZONE_LEVELS.middle })),
    contBear: times.map((time) => ({ time, value: RSI_ZONE_LEVELS.contBear })),
    critBear: times.map((time) => ({ time, value: RSI_ZONE_LEVELS.critBear })),
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
      levels: { critBull: [], contBull: [], middle: [], contBear: [], critBear: [] },
      divergences: [],
      reverseLevels: [],
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
    reverseLevels: reverseRsiLevels(closes, finalConfig.rsiLength, finalConfig.reverseTargets),
  }
}
