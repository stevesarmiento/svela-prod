'use client'

import type { OHLCVDataPoint, VmcSource, VmcSourceCandle } from './market-vision-config'

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function buildCandleSources(data: OHLCVDataPoint[]): VmcSourceCandle {
  const open: number[] = []
  const high: number[] = []
  const low: number[] = []
  const close: number[] = []
  const hlc3: number[] = []

  for (let i = 0; i < data.length; i++) {
    const d = data[i]
    open[i] = d?.open ?? 0
    high[i] = d?.high ?? 0
    low[i] = d?.low ?? 0
    close[i] = d?.close ?? 0
    hlc3[i] = (high[i]! + low[i]! + close[i]!) / 3
  }

  return { open, high, low, close, hlc3 }
}

export function pickSourceSeries(sources: VmcSourceCandle, source: VmcSource): number[] {
  return sources[source]
}

export function cross(a: number[], b: number[]): boolean[] {
  const out: boolean[] = new Array(Math.max(a.length, b.length)).fill(false)
  for (let i = 1; i < out.length; i++) {
    const a0 = a[i - 1]
    const a1 = a[i]
    const b0 = b[i - 1]
    const b1 = b[i]
    if (!isFiniteNumber(a0) || !isFiniteNumber(a1) || !isFiniteNumber(b0) || !isFiniteNumber(b1)) continue
    out[i] = (a0 <= b0 && a1 > b1) || (a0 >= b0 && a1 < b1)
  }
  return out
}

