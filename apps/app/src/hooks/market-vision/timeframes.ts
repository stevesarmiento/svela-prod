'use client'

import type { OHLCVDataPoint } from './market-vision-config'

export interface ResampledOHLCVBar {
  time: number // epoch seconds bucket start
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface HeikinAshiBar {
  time: number // epoch seconds bucket start
  open: number
  high: number
  low: number
  close: number
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function parsePineTimeframeMinutes(tf: string): number | null {
  const trimmed = tf.trim()
  if (!trimmed) return null

  // VuManChu script uses minute strings like "60", "240", "720".
  const minutes = Number(trimmed)
  if (!Number.isFinite(minutes)) return null
  if (minutes <= 0) return null
  return Math.floor(minutes)
}

export function estimateBaseBarSeconds(data: OHLCVDataPoint[]): number | null {
  if (data.length < 2) return null

  const times = data
    .flatMap((d) => (isFiniteNumber(d.time) ? [d.time] : []))
    .sort((a, b) => a - b)

  if (times.length < 2) return null

  const deltas: number[] = []
  for (let i = 1; i < times.length; i++) {
    const dt = times[i]! - times[i - 1]!
    if (dt > 0 && Number.isFinite(dt)) deltas.push(dt)
  }

  if (deltas.length === 0) return null
  deltas.sort((a, b) => a - b)
  return deltas[Math.floor(deltas.length / 2)] ?? null
}

export function canResampleToMinutes(data: OHLCVDataPoint[], targetMinutes: number): boolean {
  const baseSeconds = estimateBaseBarSeconds(data)
  if (baseSeconds == null) return false
  const targetSeconds = Math.floor(targetMinutes * 60)

  // We can only resample "up" (coarser or equal timeframe).
  return targetSeconds >= baseSeconds
}

export function resampleOHLCVToSeconds(data: OHLCVDataPoint[], targetSeconds: number): ResampledOHLCVBar[] {
  if (!data.length) return []
  if (!Number.isFinite(targetSeconds) || targetSeconds <= 0) return []

  const out: ResampledOHLCVBar[] = []
  let cur: ResampledOHLCVBar | null = null
  let curBucket: number | null = null

  // Assume `data` is time-sorted, but be defensive.
  const sorted = data.slice().sort((a, b) => a.time - b.time)

  for (const bar of sorted) {
    if (!isFiniteNumber(bar.time)) continue
    const bucket = Math.floor(bar.time / targetSeconds) * targetSeconds

    if (curBucket == null || bucket !== curBucket) {
      if (cur) out.push(cur)
      curBucket = bucket
      cur = {
        time: bucket,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      }
      continue
    }

    if (!cur) continue
    cur.high = Math.max(cur.high, bar.high)
    cur.low = Math.min(cur.low, bar.low)
    cur.close = bar.close
    cur.volume += bar.volume
  }

  if (cur) out.push(cur)
  return out
}

export function buildBaseToResampledIndexMap(
  base: OHLCVDataPoint[],
  resampled: Array<{ time: number }>,
  targetSeconds: number,
): Array<number | null> {
  const resampledIndexByBucket = new Map<number, number>()
  for (let i = 0; i < resampled.length; i++) {
    const t = resampled[i]?.time
    if (!isFiniteNumber(t)) continue
    resampledIndexByBucket.set(t, i)
  }

  const baseToHtf: Array<number | null> = new Array(base.length).fill(null)
  for (let i = 0; i < base.length; i++) {
    const t = base[i]?.time
    if (!isFiniteNumber(t)) continue
    const bucket = Math.floor(t / targetSeconds) * targetSeconds
    baseToHtf[i] = resampledIndexByBucket.get(bucket) ?? null
  }

  return baseToHtf
}

/**
 * Map HTF values back onto base-timeframe bars, mirroring Pine's
 * `security()` merge strategies:
 *
 * - `'on'`  (barmerge.lookahead_on): base bars inside HTF bucket B read
 *   bucket B's *final* value. This leaks the future within the bucket on
 *   historical data — only use it where the Pine original explicitly does
 *   (VMC's `f_getTFCandle` for the Sommi diamond).
 * - `'off'` (barmerge.lookahead_off, Pine's default): base bars inside
 *   bucket B read the last *completed* bucket (B-1). This matches how the
 *   Pine script renders historically and is repaint-free.
 */
export type SecurityLookahead = 'on' | 'off'

export function alignHtfValuesToBase(
  baseToHtfIndex: Array<number | null>,
  htfValues: number[],
  lookahead: SecurityLookahead = 'on',
): number[] {
  const out: number[] = new Array(baseToHtfIndex.length).fill(Number.NaN)
  for (let i = 0; i < baseToHtfIndex.length; i++) {
    const hIx = baseToHtfIndex[i]
    if (hIx == null) continue
    const readIx = lookahead === 'off' ? hIx - 1 : hIx
    if (readIx < 0) continue
    out[i] = htfValues[readIx] ?? Number.NaN
  }
  return out
}

export function toHeikinAshiBars(bars: ResampledOHLCVBar[]): HeikinAshiBar[] {
  if (!bars.length) return []

  const out: HeikinAshiBar[] = []
  let prevHaOpen: number | null = null
  let prevHaClose: number | null = null

  for (const bar of bars) {
    const haClose = (bar.open + bar.high + bar.low + bar.close) / 4
    const haOpen: number =
      prevHaOpen == null || prevHaClose == null ? (bar.open + bar.close) / 2 : (prevHaOpen + prevHaClose) / 2
    const haHigh = Math.max(bar.high, haOpen, haClose)
    const haLow = Math.min(bar.low, haOpen, haClose)

    out.push({ time: bar.time, open: haOpen, high: haHigh, low: haLow, close: haClose })
    prevHaOpen = haOpen
    prevHaClose = haClose
  }

  return out
}

