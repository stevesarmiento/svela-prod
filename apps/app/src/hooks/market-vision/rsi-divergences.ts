'use client'

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

function greater(a: number, b: number, eps: number, allowEqual: boolean): boolean {
  return allowEqual ? a >= b - eps : a > b + eps
}

function less(a: number, b: number, eps: number, allowEqual: boolean): boolean {
  return allowEqual ? a <= b + eps : a < b - eps
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function pivotHighAt(values: number[], leftBars: number, rightBars: number, currentIndex: number): number | null {
  const pivotIndex = currentIndex - rightBars
  if (pivotIndex - leftBars < 0) return null
  if (pivotIndex + rightBars >= values.length) return null

  const pivotValue = values[pivotIndex]
  if (!isFiniteNumber(pivotValue)) return null

  for (let i = pivotIndex - leftBars; i <= pivotIndex + rightBars; i++) {
    if (i === pivotIndex) continue
    const v = values[i]
    if (!isFiniteNumber(v)) return null
    if (v >= pivotValue) return null
  }

  return pivotValue
}

function pivotLowAt(values: number[], leftBars: number, rightBars: number, currentIndex: number): number | null {
  const pivotIndex = currentIndex - rightBars
  if (pivotIndex - leftBars < 0) return null
  if (pivotIndex + rightBars >= values.length) return null

  const pivotValue = values[pivotIndex]
  if (!isFiniteNumber(pivotValue)) return null

  for (let i = pivotIndex - leftBars; i <= pivotIndex + rightBars; i++) {
    if (i === pivotIndex) continue
    const v = values[i]
    if (!isFiniteNumber(v)) return null
    if (v <= pivotValue) return null
  }

  return pivotValue
}

function expirePending(idxNow: number | null, idxPend: number | null, tolBars: number): boolean {
  if (idxNow == null || idxPend == null) return false
  return idxNow - idxPend > tolBars
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

  const divergences: RsiDivergence[] = []

  // Pending pairing state (mirrors Pine variables)
  let pendRhiIx: number | null = null
  let pendRhi: number | null = null
  let pendPhiIx: number | null = null
  let pendPhi: number | null = null

  let pendRloIx: number | null = null
  let pendRlo: number | null = null
  let pendPloIx: number | null = null
  let pendPlo: number | null = null

  // Previous paired pivots (for divergence comparisons)
  let prevHighPH: number | null = null
  let prevHighRH: number | null = null
  let prevHighIx: number | null = null

  let prevLowPL: number | null = null
  let prevLowRL: number | null = null
  let prevLowIx: number | null = null

  for (let i = 0; i < data.length; i++) {
    const ph = pivotHighAt(highs, finalConfig.leftBars, finalConfig.rightBars, i)
    const pl = pivotLowAt(lows, finalConfig.leftBars, finalConfig.rightBars, i)
    const rh = pivotHighAt(rsiValues, finalConfig.leftBars, finalConfig.rightBars, i)
    const rl = pivotLowAt(rsiValues, finalConfig.leftBars, finalConfig.rightBars, i)

    const phix = ph == null ? null : i - finalConfig.rightBars
    const plix = pl == null ? null : i - finalConfig.rightBars
    const rhix = rh == null ? null : i - finalConfig.rightBars
    const rlix = rl == null ? null : i - finalConfig.rightBars

    // Expire old pending pivots
    if (rhix != null && expirePending(rhix, pendPhiIx, finalConfig.tolBars)) {
      pendPhiIx = null
      pendPhi = null
    }
    if (phix != null && expirePending(phix, pendRhiIx, finalConfig.tolBars)) {
      pendRhiIx = null
      pendRhi = null
    }
    if (rlix != null && expirePending(rlix, pendPloIx, finalConfig.tolBars)) {
      pendPloIx = null
      pendPlo = null
    }
    if (plix != null && expirePending(plix, pendRloIx, finalConfig.tolBars)) {
      pendRloIx = null
      pendRlo = null
    }

    // High-side pairing
    let pairHighNow = false
    let curHighPH: number | null = null
    let curHighRH: number | null = null
    let curHighIx: number | null = null

    const phNow = ph != null && phix != null
    const rhNow = rh != null && rhix != null

    if (finalConfig.pairMode === 'Same Bar') {
      if (phNow && rhNow && phix === rhix) {
        pairHighNow = true
        curHighPH = ph
        curHighRH = rh
        curHighIx = rhix
      }
    } else {
      if (phNow && rhNow && Math.abs(phix - rhix) <= finalConfig.tolBars) {
        pairHighNow = true
        curHighPH = ph
        curHighRH = rh
        curHighIx = rhix
      } else {
        if (rhNow) {
          if (pendPhiIx != null && pendPhi != null && Math.abs(pendPhiIx - rhix) <= finalConfig.tolBars) {
            pairHighNow = true
            curHighPH = pendPhi
            curHighRH = rh
            curHighIx = rhix
            pendPhiIx = null
            pendPhi = null
          } else {
            pendRhiIx = rhix
            pendRhi = rh
          }
        }
        if (phNow && !pairHighNow) {
          if (pendRhiIx != null && pendRhi != null && Math.abs(pendRhiIx - phix) <= finalConfig.tolBars) {
            pairHighNow = true
            curHighPH = ph
            curHighRH = pendRhi
            curHighIx = pendRhiIx
            pendRhiIx = null
            pendRhi = null
          } else {
            pendPhiIx = phix
            pendPhi = ph
          }
        }
      }
    }

    // Low-side pairing
    let pairLowNow = false
    let curLowPL: number | null = null
    let curLowRL: number | null = null
    let curLowIx: number | null = null

    const plNow = pl != null && plix != null
    const rlNow = rl != null && rlix != null

    if (finalConfig.pairMode === 'Same Bar') {
      if (plNow && rlNow && plix === rlix) {
        pairLowNow = true
        curLowPL = pl
        curLowRL = rl
        curLowIx = rlix
      }
    } else {
      if (plNow && rlNow && Math.abs(plix - rlix) <= finalConfig.tolBars) {
        pairLowNow = true
        curLowPL = pl
        curLowRL = rl
        curLowIx = rlix
      } else {
        if (rlNow) {
          if (pendPloIx != null && pendPlo != null && Math.abs(pendPloIx - rlix) <= finalConfig.tolBars) {
            pairLowNow = true
            curLowPL = pendPlo
            curLowRL = rl
            curLowIx = rlix
            pendPloIx = null
            pendPlo = null
          } else {
            pendRloIx = rlix
            pendRlo = rl
          }
        }
        if (plNow && !pairLowNow) {
          if (pendRloIx != null && pendRlo != null && Math.abs(pendRloIx - plix) <= finalConfig.tolBars) {
            pairLowNow = true
            curLowPL = pl
            curLowRL = pendRlo
            curLowIx = pendRloIx
            pendRloIx = null
            pendRlo = null
          } else {
            pendPloIx = plix
            pendPlo = pl
          }
        }
      }
    }

    // Divergence checks (match Pine conditions) — written with explicit narrowing for type-safety.
    if (
      pairHighNow &&
      curHighIx != null &&
      curHighPH != null &&
      curHighRH != null &&
      prevHighIx != null &&
      prevHighPH != null &&
      prevHighRH != null
    ) {
      const isBearReg =
        finalConfig.showRegular &&
        greater(curHighPH, prevHighPH, finalConfig.priceEps, finalConfig.allowEqual) &&
        less(curHighRH, prevHighRH, finalConfig.rsiEps, finalConfig.allowEqual)

      const isBearHid =
        finalConfig.showHidden &&
        less(curHighPH, prevHighPH, finalConfig.priceEps, finalConfig.allowEqual) &&
        greater(curHighRH, prevHighRH, finalConfig.rsiEps, finalConfig.allowEqual)

      if (isBearReg || isBearHid) {
        divergences.push({
          type: isBearReg ? 'bearish' : 'h_bearish',
          startIndex: prevHighIx,
          endIndex: curHighIx,
          startTime: times[prevHighIx] ?? 0,
          endTime: times[curHighIx] ?? 0,
          rsiStart: prevHighRH,
          rsiEnd: curHighRH,
          priceStart: prevHighPH,
          priceEnd: curHighPH,
        })
      }
    }

    if (
      pairLowNow &&
      curLowIx != null &&
      curLowPL != null &&
      curLowRL != null &&
      prevLowIx != null &&
      prevLowPL != null &&
      prevLowRL != null
    ) {
      const isBullReg =
        finalConfig.showRegular &&
        less(curLowPL, prevLowPL, finalConfig.priceEps, finalConfig.allowEqual) &&
        greater(curLowRL, prevLowRL, finalConfig.rsiEps, finalConfig.allowEqual)

      const isBullHid =
        finalConfig.showHidden &&
        greater(curLowPL, prevLowPL, finalConfig.priceEps, finalConfig.allowEqual) &&
        less(curLowRL, prevLowRL, finalConfig.rsiEps, finalConfig.allowEqual)

      if (isBullReg || isBullHid) {
        divergences.push({
          type: isBullReg ? 'bullish' : 'h_bullish',
          startIndex: prevLowIx,
          endIndex: curLowIx,
          startTime: times[prevLowIx] ?? 0,
          endTime: times[curLowIx] ?? 0,
          rsiStart: prevLowRL,
          rsiEnd: curLowRL,
          priceStart: prevLowPL,
          priceEnd: curLowPL,
        })
      }
    }

    // Update prev pairs after checks (matches Pine order)
    if (pairHighNow && curHighIx != null && curHighPH != null && curHighRH != null) {
      prevHighPH = curHighPH
      prevHighRH = curHighRH
      prevHighIx = curHighIx
    }
    if (pairLowNow && curLowIx != null && curLowPL != null && curLowRL != null) {
      prevLowPL = curLowPL
      prevLowRL = curLowRL
      prevLowIx = curLowIx
    }
  }

  return {
    rsiSeries,
    levels: buildLevels(times),
    divergences,
  }
}

