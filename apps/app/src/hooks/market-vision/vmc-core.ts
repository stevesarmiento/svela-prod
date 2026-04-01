'use client'

import type { OHLCVDataPoint, VmcSource, VmcSourceCandle } from './market-vision-config'
import { nz, pineEma, pineHighest, pineLowest, pineRsi, pineSma } from './pine-math'
import { cross, pickSourceSeries } from './pine-series'

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export interface VmcWaveTrendResult {
  wt1: number[]
  wt2: number[]
  wtVwap: number[]
  wtCross: boolean[]
  wtCrossUp: boolean[]
  wtCrossDown: boolean[]
  wtCrossLast: boolean[]
  wtCrossUpLast: boolean[]
  wtCrossDownLast: boolean[]
}

export function computeRsiMfi(
  data: Array<Pick<OHLCVDataPoint, 'open' | 'high' | 'low' | 'close'>>,
  period: number,
  multiplier: number,
  posY: number,
): number[] {
  const values: number[] = new Array(data.length).fill(0)
  for (let i = 0; i < data.length; i++) {
    const c = data[i]
    if (!c) {
      values[i] = Number.NaN
      continue
    }
    const o = c.open
    const h = c.high
    const l = c.low
    const cl = c.close
    if (![o, h, l, cl].every((v) => typeof v === 'number' && Number.isFinite(v))) {
      values[i] = Number.NaN
      continue
    }

    const range = h - l
    if (range === 0) {
      // Flat bar: treat as no flow instead of blowing up.
      values[i] = 0
      continue
    }

    // Pine candles naturally constrain this ratio to [-1, 1].
    // Our upstream OHLC can sometimes violate that (esp. derived candles), causing visual blowouts.
    const raw = (cl - o) / range
    const ratio = Math.max(-1, Math.min(1, raw))
    values[i] = ratio * multiplier
  }
  const smoothed = pineSma(values, period)
  return smoothed.map((v) => (Number.isFinite(v) ? v : Number.NaN) - posY)
}

export function computeWaveTrend(
  sources: VmcSourceCandle,
  source: VmcSource,
  channelLen: number,
  averageLen: number,
  maLen: number,
): VmcWaveTrendResult {
  const src = pickSourceSeries(sources, source)

  const esa = pineEma(src, channelLen)
  const absDiff: number[] = new Array(src.length).fill(0)
  for (let i = 0; i < src.length; i++) {
    const s = src[i]
    const e = esa[i]
    if (isFiniteNumber(s) && isFiniteNumber(e)) absDiff[i] = Math.abs(s - e)
    else absDiff[i] = Number.NaN
  }
  const de = pineEma(absDiff, channelLen)

  const ci: number[] = new Array(src.length).fill(0)
  for (let i = 0; i < src.length; i++) {
    const s = src[i]
    const e = esa[i]
    const d = de[i]
    if (!isFiniteNumber(s) || !isFiniteNumber(e) || !isFiniteNumber(d) || d === 0) {
      ci[i] = Number.NaN
      continue
    }
    ci[i] = (s - e) / (0.015 * d)
  }

  const wt1 = pineEma(ci, averageLen)
  const wt2 = pineSma(wt1, maLen)
  const wtVwap: number[] = new Array(wt1.length).fill(0)
  for (let i = 0; i < wt1.length; i++) {
    const w1 = wt1[i]
    const w2 = wt2[i]
    wtVwap[i] = isFiniteNumber(w1) && isFiniteNumber(w2) ? w1 - w2 : Number.NaN
  }

  const wtCross = cross(wt1, wt2)
  const wtCrossUp: boolean[] = new Array(wt1.length).fill(false)
  const wtCrossDown: boolean[] = new Array(wt1.length).fill(false)
  for (let i = 0; i < wt1.length; i++) {
    const w1 = wt1[i]
    const w2 = wt2[i]
    if (!isFiniteNumber(w1) || !isFiniteNumber(w2)) continue
    wtCrossUp[i] = w2 - w1 <= 0
    wtCrossDown[i] = w2 - w1 >= 0
  }

  const wtCrossLast: boolean[] = new Array(wt1.length).fill(false)
  const wtCrossUpLast: boolean[] = new Array(wt1.length).fill(false)
  const wtCrossDownLast: boolean[] = new Array(wt1.length).fill(false)
  for (let i = 2; i < wt1.length; i++) {
    wtCrossLast[i] = wtCross[i - 2] ?? false
    wtCrossUpLast[i] = wtCrossUp[i - 2] ?? false
    wtCrossDownLast[i] = wtCrossDown[i - 2] ?? false
  }

  return { wt1, wt2, wtVwap, wtCross, wtCrossUp, wtCrossDown, wtCrossLast, wtCrossUpLast, wtCrossDownLast }
}

export interface VmcStochRsiResult {
  k: number[]
  d: number[]
}

export function computeStochRsi(
  src: number[],
  stochLen: number,
  rsiLen: number,
  kSmooth: number,
  dSmooth: number,
  useLog: boolean,
  useAvg: boolean,
): VmcStochRsiResult {
  const series = useLog ? src.map((v) => (v > 0 ? Math.log(v) : 0)) : src.slice()
  const rsiValues = pineRsi(series, rsiLen)

  const hh = pineHighest(rsiValues, stochLen)
  const ll = pineLowest(rsiValues, stochLen)

  const raw: number[] = new Array(rsiValues.length).fill(50)
  for (let i = 0; i < rsiValues.length; i++) {
    const h = hh[i]
    const l = ll[i]
    const v = rsiValues[i]
    if (!isFiniteNumber(h) || !isFiniteNumber(l) || !isFiniteNumber(v) || h === l) {
      raw[i] = 50
      continue
    }
    raw[i] = ((v - l) / (h - l)) * 100
  }

  const kk = pineSma(raw, kSmooth)
  const d1 = pineSma(kk, dSmooth)

  const kOut: number[] = new Array(kk.length).fill(0)
  for (let i = 0; i < kk.length; i++) {
    const k = kk[i]
    const d = d1[i]
    if (useAvg && isFiniteNumber(k) && isFiniteNumber(d)) kOut[i] = (k + d) / 2
    else kOut[i] = k ?? 0
  }

  return { k: kOut, d: d1 }
}

export function computeSchaffTc(
  src: number[],
  length: number,
  fastLength: number,
  slowLength: number,
  factor: number,
): number[] {
  const ema1 = pineEma(src, fastLength)
  const ema2 = pineEma(src, slowLength)
  const macdVal: number[] = new Array(src.length).fill(0)
  for (let i = 0; i < src.length; i++) {
    const e1 = ema1[i]
    const e2 = ema2[i]
    macdVal[i] = isFiniteNumber(e1) && isFiniteNumber(e2) ? e1 - e2 : Number.NaN
  }

  const alpha = pineLowest(macdVal, length)
  const beta: number[] = new Array(src.length).fill(0)
  const highestMacd = pineHighest(macdVal, length)
  for (let i = 0; i < src.length; i++) {
    const h = highestMacd[i]
    const a = alpha[i]
    beta[i] = isFiniteNumber(h) && isFiniteNumber(a) ? h - a : Number.NaN
  }

  const gamma: number[] = new Array(src.length).fill(0)
  for (let i = 0; i < src.length; i++) {
    const b = beta[i]
    const a = alpha[i]
    const m = macdVal[i]
    const prev = gamma[i - 1]
    if (isFiniteNumber(b) && b > 0 && isFiniteNumber(a) && isFiniteNumber(m)) gamma[i] = ((m - a) / b) * 100
    else gamma[i] = nz(prev, 0)
  }

  const delta: number[] = new Array(src.length).fill(0)
  for (let i = 0; i < src.length; i++) {
    const prev = delta[i - 1]
    const g = gamma[i] ?? 0
    if (i === 0 || !isFiniteNumber(prev)) delta[i] = g
    else delta[i] = prev + factor * (g - prev)
  }

  const epsilon = pineLowest(delta, length)
  const zeta: number[] = new Array(src.length).fill(0)
  const highestDelta = pineHighest(delta, length)
  for (let i = 0; i < src.length; i++) {
    const h = highestDelta[i]
    const e = epsilon[i]
    zeta[i] = isFiniteNumber(h) && isFiniteNumber(e) ? h - e : Number.NaN
  }

  const eta: number[] = new Array(src.length).fill(0)
  for (let i = 0; i < src.length; i++) {
    const z = zeta[i]
    const e = epsilon[i]
    const d = delta[i]
    const prev = eta[i - 1]
    if (isFiniteNumber(z) && z > 0 && isFiniteNumber(e) && isFiniteNumber(d)) eta[i] = ((d - e) / z) * 100
    else eta[i] = nz(prev, 0)
  }

  const stcReturn: number[] = new Array(src.length).fill(0)
  for (let i = 0; i < src.length; i++) {
    const prev = stcReturn[i - 1]
    const e = eta[i] ?? 0
    if (i === 0 || !isFiniteNumber(prev)) stcReturn[i] = e
    else stcReturn[i] = prev + factor * (e - prev)
  }

  return stcReturn
}

export interface VmcMacdResult {
  macd: number[]
  signal: number[]
  hist: number[]
}

export function computeMacd(src: number[], fastLen: number, slowLen: number, sigSmooth: number): VmcMacdResult {
  const fast = pineEma(src, fastLen)
  const slow = pineEma(src, slowLen)

  const macd: number[] = new Array(src.length).fill(0)
  for (let i = 0; i < src.length; i++) {
    const f = fast[i]
    const s = slow[i]
    macd[i] = isFiniteNumber(f) && isFiniteNumber(s) ? f - s : Number.NaN
  }

  const signal = pineSma(macd, sigSmooth)
  const hist: number[] = new Array(src.length).fill(0)
  for (let i = 0; i < src.length; i++) {
    const m = macd[i]
    const sig = signal[i]
    hist[i] = isFiniteNumber(m) && isFiniteNumber(sig) ? m - sig : Number.NaN
  }

  return { macd, signal, hist }
}

