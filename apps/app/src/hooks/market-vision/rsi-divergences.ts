'use client'

import { findPairedDivergences, pivotHighAt, pivotLowAt } from './divergence-engine'
import type { OHLCVDataPoint, SeriesDataPoint } from './market-vision-config'
import {
  DEFAULT_REVERSE_RSI_TARGETS,
  type ReverseRsiLevel,
  ema,
  reverseRsiLevels,
  reverseRsiPrice,
  rsi as rsiCalc,
  sma,
  wilderRsiState,
} from './technical-indicators'

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
  /** Signal line period (moving average of RSI). */
  signalPeriod: number
  /** Signal line smoothing type. */
  signalType: 'EMA' | 'SMA'
  /** Alert level above the critical bull zone. */
  alertHigh: number
  /** Alert level below the critical bear zone. */
  alertLow: number
  /** Targets for reverse-RSI price levels (default: Caretaker zones 80/62/50/38/20). */
  reverseTargets?: readonly number[]
}

export interface RsiPivotPoint {
  index: number
  time: number
  value: number
  kind: 'high' | 'low'
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
  /** Moving average of RSI, masked past the RSI warm-up region. */
  signalSeries: SeriesDataPoint[]
  signalCurrent: number | null
  /** Next-bar close at which RSI crosses its signal line (null when unavailable). */
  reverseSignalCross: number | null
  /** Every confirmed RSI pivot high/low (same fractal as divergence pairing). */
  pivots: RsiPivotPoint[]
  levels: {
    critBull: SeriesDataPoint[]
    contBull: SeriesDataPoint[]
    middle: SeriesDataPoint[]
    contBear: SeriesDataPoint[]
    critBear: SeriesDataPoint[]
    alertHigh: SeriesDataPoint[]
    alertLow: SeriesDataPoint[]
  }
  alerts: { high: number; low: number; highOn: boolean; lowOn: boolean }
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
  signalPeriod: 12,
  signalType: 'EMA',
  alertHigh: 85,
  alertLow: 15,
  reverseTargets: DEFAULT_REVERSE_RSI_TARGETS,
}

function buildLevels(times: number[], alertHigh: number, alertLow: number): RsiDivergencesResult['levels'] {
  return {
    critBull: times.map((time) => ({ time, value: RSI_ZONE_LEVELS.critBull })),
    contBull: times.map((time) => ({ time, value: RSI_ZONE_LEVELS.contBull })),
    middle: times.map((time) => ({ time, value: RSI_ZONE_LEVELS.middle })),
    contBear: times.map((time) => ({ time, value: RSI_ZONE_LEVELS.contBear })),
    critBear: times.map((time) => ({ time, value: RSI_ZONE_LEVELS.critBear })),
    alertHigh: times.map((time) => ({ time, value: alertHigh })),
    alertLow: times.map((time) => ({ time, value: alertLow })),
  }
}

/**
 * Signal line over the RSI. The RSI warm-up region (index 0 prints 0, indices
 * 1..rsiLength-1 print 100) must be sliced off before smoothing — ema() seeds
 * from the first value and would otherwise be poisoned for dozens of bars.
 */
function buildSignal(
  rsiValues: number[],
  times: number[],
  rsiLength: number,
  signalPeriod: number,
  signalType: 'EMA' | 'SMA',
): SeriesDataPoint[] {
  if (rsiValues.length <= rsiLength) return []

  const validRsi = rsiValues.slice(rsiLength)
  const smoothed = signalType === 'SMA' ? sma(validRsi, signalPeriod) : ema(validRsi, signalPeriod)
  // sma() zero-fills its first period-1 outputs; ema() is valid from index 0.
  const offset = signalType === 'SMA' ? signalPeriod - 1 : 0

  const points: SeriesDataPoint[] = []
  for (let i = offset; i < smoothed.length; i++) {
    const value = smoothed[i]
    const time = times[rsiLength + i]
    if (value == null || !Number.isFinite(value) || time == null) continue
    points.push({ time, value })
  }
  return points
}

/**
 * RSI value at which the next bar's RSI equals the next bar's signal.
 * EMA: nextSig = k*nextRsi + (1-k)*sigPrev, so nextRsi = nextSig ⇒ nextRsi = sigPrev.
 * SMA: nextSig = (sum of last period-1 RSI + nextRsi) / period ⇒ nextRsi = sum / (period-1).
 */
function signalCrossTarget(
  rsiValues: number[],
  rsiLength: number,
  signalPeriod: number,
  signalType: 'EMA' | 'SMA',
  signalCurrent: number | null,
): number | null {
  if (signalType === 'EMA') return signalCurrent

  if (signalPeriod < 2) return null
  const validRsi = rsiValues.slice(rsiLength)
  if (validRsi.length < signalPeriod - 1) return null
  const window = validRsi.slice(-(signalPeriod - 1))
  return window.reduce((sum, value) => sum + value, 0) / window.length
}

function findRsiPivots(
  rsiValues: number[],
  times: number[],
  leftBars: number,
  rightBars: number,
): RsiPivotPoint[] {
  const pivots: RsiPivotPoint[] = []
  for (let i = 0; i < rsiValues.length; i++) {
    const high = pivotHighAt(rsiValues, leftBars, rightBars, i)
    if (high != null) {
      pivots.push({ index: i - rightBars, time: times[i - rightBars] ?? 0, value: high, kind: 'high' })
    }
    const low = pivotLowAt(rsiValues, leftBars, rightBars, i)
    if (low != null) {
      pivots.push({ index: i - rightBars, time: times[i - rightBars] ?? 0, value: low, kind: 'low' })
    }
  }
  return pivots
}

export function calculateRsiDivergences(
  data: OHLCVDataPoint[],
  config?: Partial<RsiDivergencesConfig>,
): RsiDivergencesResult {
  const finalConfig: RsiDivergencesConfig = { ...DEFAULT_CONFIG, ...(config ?? {}) }

  if (!data.length) {
    return {
      rsiSeries: [],
      signalSeries: [],
      signalCurrent: null,
      reverseSignalCross: null,
      pivots: [],
      levels: { critBull: [], contBull: [], middle: [], contBear: [], critBear: [], alertHigh: [], alertLow: [] },
      alerts: { high: finalConfig.alertHigh, low: finalConfig.alertLow, highOn: false, lowOn: false },
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

  const signalSeries = buildSignal(rsiValues, times, finalConfig.rsiLength, finalConfig.signalPeriod, finalConfig.signalType)
  const signalCurrent = signalSeries[signalSeries.length - 1]?.value ?? null

  const crossTarget = signalCrossTarget(
    rsiValues,
    finalConfig.rsiLength,
    finalConfig.signalPeriod,
    finalConfig.signalType,
    signalCurrent,
  )
  const crossState = crossTarget == null ? null : wilderRsiState(closes, finalConfig.rsiLength)
  const reverseSignalCross =
    crossState && crossTarget != null ? reverseRsiPrice(crossState, finalConfig.rsiLength, crossTarget) : null

  // Warm-up RSI prints 100 — never let it trip the overbought alert on short inputs.
  const lastRsi = closes.length > finalConfig.rsiLength ? (rsiValues[rsiValues.length - 1] ?? null) : null
  const alerts = {
    high: finalConfig.alertHigh,
    low: finalConfig.alertLow,
    highOn: lastRsi != null && lastRsi >= finalConfig.alertHigh,
    lowOn: lastRsi != null && lastRsi <= finalConfig.alertLow,
  }

  return {
    rsiSeries,
    signalSeries,
    signalCurrent,
    reverseSignalCross,
    pivots: findRsiPivots(rsiValues, times, finalConfig.leftBars, finalConfig.rightBars),
    levels: buildLevels(times, finalConfig.alertHigh, finalConfig.alertLow),
    alerts,
    divergences,
    reverseLevels: reverseRsiLevels(closes, finalConfig.rsiLength, finalConfig.reverseTargets),
  }
}
