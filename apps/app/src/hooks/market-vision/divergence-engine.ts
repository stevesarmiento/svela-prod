'use client'

// Generic tolerance-pairing divergence engine.
//
// Extracted verbatim from rsi-divergences.ts so the same algorithm can run
// against any oscillator (RSI, WaveTrend wt2, Stoch K, ...). Unlike the
// VuManChu fractal detector (vmc-divergences.ts), which requires the price
// and oscillator pivots to land on the exact same bar, this engine finds
// price pivots and oscillator pivots independently and pairs them when they
// occur within `tolBars` of each other ("TV-like" mode) — catching the many
// real divergences where the two pivots are 1-2 bars apart.

export type DivergenceType = 'bullish' | 'bearish' | 'h_bullish' | 'h_bearish'

export interface PairedDivergence {
  type: DivergenceType
  startIndex: number
  endIndex: number
  oscStart: number
  oscEnd: number
  priceStart: number
  priceEnd: number
}

export interface DivergenceEngineConfig {
  leftBars: number
  rightBars: number
  pairMode: 'TV-like' | 'Same Bar'
  tolBars: number
  allowEqual: boolean
  priceEps: number
  oscEps: number
  showRegular: boolean
  showHidden: boolean
}

export const DEFAULT_DIVERGENCE_ENGINE_CONFIG: DivergenceEngineConfig = {
  leftBars: 5,
  rightBars: 5,
  pairMode: 'TV-like',
  tolBars: 2,
  allowEqual: true,
  priceEps: 0,
  oscEps: 0,
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

export function pivotHighAt(values: number[], leftBars: number, rightBars: number, currentIndex: number): number | null {
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

export function pivotLowAt(values: number[], leftBars: number, rightBars: number, currentIndex: number): number | null {
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

/**
 * Find regular and hidden divergences between a price series (highs/lows)
 * and an oscillator, pairing independently-detected pivots within a bar
 * tolerance. Bar-index based; callers map indices to times.
 */
export function findPairedDivergences(
  highs: number[],
  lows: number[],
  oscValues: number[],
  config: DivergenceEngineConfig,
): PairedDivergence[] {
  const divergences: PairedDivergence[] = []
  const n = Math.min(highs.length, lows.length, oscValues.length)

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

  for (let i = 0; i < n; i++) {
    const ph = pivotHighAt(highs, config.leftBars, config.rightBars, i)
    const pl = pivotLowAt(lows, config.leftBars, config.rightBars, i)
    const rh = pivotHighAt(oscValues, config.leftBars, config.rightBars, i)
    const rl = pivotLowAt(oscValues, config.leftBars, config.rightBars, i)

    const phix = ph == null ? null : i - config.rightBars
    const plix = pl == null ? null : i - config.rightBars
    const rhix = rh == null ? null : i - config.rightBars
    const rlix = rl == null ? null : i - config.rightBars

    // Expire old pending pivots
    if (rhix != null && expirePending(rhix, pendPhiIx, config.tolBars)) {
      pendPhiIx = null
      pendPhi = null
    }
    if (phix != null && expirePending(phix, pendRhiIx, config.tolBars)) {
      pendRhiIx = null
      pendRhi = null
    }
    if (rlix != null && expirePending(rlix, pendPloIx, config.tolBars)) {
      pendPloIx = null
      pendPlo = null
    }
    if (plix != null && expirePending(plix, pendRloIx, config.tolBars)) {
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

    if (config.pairMode === 'Same Bar') {
      if (phNow && rhNow && phix === rhix) {
        pairHighNow = true
        curHighPH = ph
        curHighRH = rh
        curHighIx = rhix
      }
    } else {
      if (phNow && rhNow && Math.abs(phix - rhix) <= config.tolBars) {
        pairHighNow = true
        curHighPH = ph
        curHighRH = rh
        curHighIx = rhix
      } else {
        if (rhNow) {
          if (pendPhiIx != null && pendPhi != null && Math.abs(pendPhiIx - rhix) <= config.tolBars) {
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
          if (pendRhiIx != null && pendRhi != null && Math.abs(pendRhiIx - phix) <= config.tolBars) {
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

    if (config.pairMode === 'Same Bar') {
      if (plNow && rlNow && plix === rlix) {
        pairLowNow = true
        curLowPL = pl
        curLowRL = rl
        curLowIx = rlix
      }
    } else {
      if (plNow && rlNow && Math.abs(plix - rlix) <= config.tolBars) {
        pairLowNow = true
        curLowPL = pl
        curLowRL = rl
        curLowIx = rlix
      } else {
        if (rlNow) {
          if (pendPloIx != null && pendPlo != null && Math.abs(pendPloIx - rlix) <= config.tolBars) {
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
          if (pendRloIx != null && pendRlo != null && Math.abs(pendRloIx - plix) <= config.tolBars) {
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

    // Divergence checks — explicit narrowing for type-safety.
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
        config.showRegular &&
        greater(curHighPH, prevHighPH, config.priceEps, config.allowEqual) &&
        less(curHighRH, prevHighRH, config.oscEps, config.allowEqual)

      const isBearHid =
        config.showHidden &&
        less(curHighPH, prevHighPH, config.priceEps, config.allowEqual) &&
        greater(curHighRH, prevHighRH, config.oscEps, config.allowEqual)

      if (isBearReg || isBearHid) {
        divergences.push({
          type: isBearReg ? 'bearish' : 'h_bearish',
          startIndex: prevHighIx,
          endIndex: curHighIx,
          oscStart: prevHighRH,
          oscEnd: curHighRH,
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
        config.showRegular &&
        less(curLowPL, prevLowPL, config.priceEps, config.allowEqual) &&
        greater(curLowRL, prevLowRL, config.oscEps, config.allowEqual)

      const isBullHid =
        config.showHidden &&
        greater(curLowPL, prevLowPL, config.priceEps, config.allowEqual) &&
        less(curLowRL, prevLowRL, config.oscEps, config.allowEqual)

      if (isBullReg || isBullHid) {
        divergences.push({
          type: isBullReg ? 'bullish' : 'h_bullish',
          startIndex: prevLowIx,
          endIndex: curLowIx,
          oscStart: prevLowRL,
          oscEnd: curLowRL,
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

  return divergences
}
