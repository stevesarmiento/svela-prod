'use client'

import { pineEma } from './pine-math'

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export interface VmcMacdWtColorResult {
  macdWT1Color: Array<string | null>
  macdWT2Color: Array<string | null>
}

export function computeMacdWtColors(args: {
  hrsimfi: number[]
  macd: number[]
  signal: number[]
  colormacdWT1a: string
  colormacdWT1b: string
  colormacdWT1c: string
  colormacdWT1d: string
  colormacdWT2a: string
  colormacdWT2b: string
  colormacdWT2c: string
  colormacdWT2d: string
}): VmcMacdWtColorResult {
  const n = Math.max(args.hrsimfi.length, args.macd.length, args.signal.length)
  const macdWT1Color: Array<string | null> = new Array(n).fill(null)
  const macdWT2Color: Array<string | null> = new Array(n).fill(null)

  for (let i = 0; i < n; i++) {
    const m = args.macd[i]
    const s = args.signal[i]
    const mf = args.hrsimfi[i]
    if (!isFiniteNumber(m) || !isFiniteNumber(s) || !isFiniteNumber(mf)) continue

    const macdup = m >= s
    const macddown = m <= s

    if (macdup) {
      macdWT1Color[i] = mf > 0 ? args.colormacdWT1c : args.colormacdWT1a
      macdWT2Color[i] = mf < 0 ? args.colormacdWT2c : args.colormacdWT2a
    } else if (macddown) {
      macdWT1Color[i] = mf < 0 ? args.colormacdWT1d : args.colormacdWT1b
      macdWT2Color[i] = mf < 0 ? args.colormacdWT2d : args.colormacdWT2b
    }
  }

  return { macdWT1Color, macdWT2Color }
}

export interface VmcSommiFlagResult {
  bearish: boolean[]
  bullish: boolean[]
  hvwapEma3: number[]
}

export function computeSommiFlag(args: {
  rsimfi: number[]
  wt2: number[]
  wtCross: boolean[]
  wtCrossUp: boolean[]
  wtCrossDown: boolean[]
  hwtVwap: number[]
  soomiRSIMFIBearLevel: number
  soomiRSIMFIBullLevel: number
  soomiFlagWTBearLevel: number
  soomiFlagWTBullLevel: number
  sommiVwapBearLevel: number
  sommiVwapBullLevel: number
}): VmcSommiFlagResult {
  const n = Math.max(args.rsimfi.length, args.wt2.length, args.hwtVwap.length, args.wtCross.length)
  const bearish: boolean[] = new Array(n).fill(false)
  const bullish: boolean[] = new Array(n).fill(false)

  for (let i = 0; i < n; i++) {
    const mf = args.rsimfi[i]
    const wt2 = args.wt2[i]
    const hvwap = args.hwtVwap[i]
    if (!isFiniteNumber(mf) || !isFiniteNumber(wt2) || !isFiniteNumber(hvwap)) continue

    bearish[i] =
      mf < args.soomiRSIMFIBearLevel &&
      wt2 > args.soomiFlagWTBearLevel &&
      Boolean(args.wtCross[i]) &&
      Boolean(args.wtCrossDown[i]) &&
      hvwap < args.sommiVwapBearLevel

    bullish[i] =
      mf > args.soomiRSIMFIBullLevel &&
      wt2 < args.soomiFlagWTBullLevel &&
      Boolean(args.wtCross[i]) &&
      Boolean(args.wtCrossUp[i]) &&
      hvwap > args.sommiVwapBullLevel
  }

  return {
    bearish,
    bullish,
    hvwapEma3: pineEma(args.hwtVwap, 3),
  }
}

export interface VmcSommiDiamondResult {
  bearish: boolean[]
  bullish: boolean[]
}

export function computeSommiDiamond(args: {
  wt2: number[]
  wtCross: boolean[]
  wtCrossUp: boolean[]
  wtCrossDown: boolean[]
  candleBodyDirTf1: boolean[]
  candleBodyDirTf2: boolean[]
  soomiDiamondWTBearLevel: number
  soomiDiamondWTBullLevel: number
}): VmcSommiDiamondResult {
  const n = Math.max(
    args.wt2.length,
    args.wtCross.length,
    args.candleBodyDirTf1.length,
    args.candleBodyDirTf2.length,
  )
  const bearish: boolean[] = new Array(n).fill(false)
  const bullish: boolean[] = new Array(n).fill(false)

  for (let i = 0; i < n; i++) {
    const wt2 = args.wt2[i]
    if (!isFiniteNumber(wt2)) continue

    bearish[i] =
      wt2 >= args.soomiDiamondWTBearLevel &&
      Boolean(args.wtCross[i]) &&
      Boolean(args.wtCrossDown[i]) &&
      !Boolean(args.candleBodyDirTf1[i]) &&
      !Boolean(args.candleBodyDirTf2[i])

    bullish[i] =
      wt2 <= args.soomiDiamondWTBullLevel &&
      Boolean(args.wtCross[i]) &&
      Boolean(args.wtCrossUp[i]) &&
      Boolean(args.candleBodyDirTf1[i]) &&
      Boolean(args.candleBodyDirTf2[i])
  }

  return { bearish, bullish }
}

