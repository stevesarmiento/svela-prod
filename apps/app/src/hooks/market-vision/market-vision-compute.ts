'use client'

import { withAlpha as oklchWithAlpha } from '@/lib/oklch'
import { findPairedDivergences } from './divergence-engine'
import type {
  ColoredSeriesDataPoint,
  MarketVisionBConfig,
  MarketVisionBResult,
  MarketVisionDivergences,
  MarketVisionEventPoint,
  MarketVisionEvents,
  MarketVisionPairedDivergence,
  MarketVisionSeriesLevels,
  MarketVisionSignalSeries,
  OHLCVDataPoint,
} from './market-vision-config'
import { DEFAULT_MARKET_VISION_CONFIG } from './market-vision-config'
import { pineEma, pineRsi } from './pine-math'
import { buildCandleSources, pickSourceSeries } from './pine-series'
import {
  alignHtfValuesToBase,
  buildBaseToResampledIndexMap,
  canResampleToMinutes,
  parsePineTimeframeMinutes,
  resampleOHLCVToSeconds,
  toHeikinAshiBars,
} from './timeframes'
import { computeMacd, computeRsiMfi, computeSchaffTc, computeStochRsi, computeWaveTrend } from './vmc-core'
import { findVmcDivs } from './vmc-divergences'
import { computeMacdWtColors, computeSommiDiamond, computeSommiFlag } from './vmc-patterns'

export function mergeMarketVisionConfig(
  base: MarketVisionBConfig,
  patch: Partial<MarketVisionBConfig> | undefined,
): MarketVisionBConfig {
  if (!patch) return base

  return {
    ...base,
    waveTrend: { ...base.waveTrend, ...(patch.waveTrend ?? {}) },
    mfi: { ...base.mfi, ...(patch.mfi ?? {}) },
    rsi: { ...base.rsi, ...(patch.rsi ?? {}) },
    stoch: { ...base.stoch, ...(patch.stoch ?? {}) },
    schaff: { ...base.schaff, ...(patch.schaff ?? {}) },
    sommi: {
      flag: { ...base.sommi.flag, ...(patch.sommi?.flag ?? {}) },
      diamond: { ...base.sommi.diamond, ...(patch.sommi?.diamond ?? {}) },
    },
    macdColors: { ...base.macdColors, ...(patch.macdColors ?? {}) },
    divergenceEngine: { ...base.divergenceEngine, ...(patch.divergenceEngine ?? {}) },
    mode: { ...base.mode, ...(patch.mode ?? {}) },
    colors: { ...base.colors, ...(patch.colors ?? {}) },
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function withAlpha(color: string, alpha: number): string {
  // All chart colors are oklch strings; delegate to the shared helper.
  return oklchWithAlpha(color, Math.max(0, Math.min(1, alpha)))
}

function emptySeries(): MarketVisionSignalSeries {
  return {
    wt1: [],
    wt2: [],
    wtVwap: [],
    rsiMfi: [],
    mfiBarTop: [],
    mfiBarBottom: [],
    rsi: [],
    stochK: [],
    stochD: [],
    tc: [],
    sommiHvwap: [],
    wtBearDiv: [],
    wtBullDiv: [],
    wtBearDiv2: [],
    wtBullDiv2: [],
    rsiBearDiv: [],
    rsiBullDiv: [],
    stochBearDiv: [],
    stochBullDiv: [],
    wtCrossCircles: [],
    buyCircle: [],
    sellCircle: [],
    divBuyCircle: [],
    divSellCircle: [],
    goldBuyCircle: [],
    sommiBearFlag: [],
    sommiBullFlag: [],
    sommiBearDiamond: [],
    sommiBullDiamond: [],
  }
}

function emptyLevels(): MarketVisionSeriesLevels {
  return { zero: [], obLevel2: [], obLevel3: [], osLevel2: [] }
}

function emptyEvents(): MarketVisionEvents {
  return {
    buy: [],
    sell: [],
    buyDiv: [],
    sellDiv: [],
    goldBuy: [],
    smallBuyDot: [],
    smallSellDot: [],
    sommiBullFlag: [],
    sommiBearFlag: [],
    sommiBullDiamond: [],
    sommiBearDiamond: [],
  }
}

function emptyDivergences(): MarketVisionDivergences {
  return { wt: [], rsi: [], stoch: [] }
}

function toColoredSeries(
  times: number[],
  values: number[],
  colorForIndex?: (i: number, value: number) => string | null,
): ColoredSeriesDataPoint[] {
  const out: ColoredSeriesDataPoint[] = []
  const n = Math.min(times.length, values.length)
  for (let i = 0; i < n; i++) {
    const t = times[i]
    const v = values[i]
    if (!isFiniteNumber(t) || !isFiniteNumber(v)) continue
    const color = colorForIndex?.(i, v) ?? null
    if (color) out.push({ time: t, value: v, color })
    else out.push({ time: t, value: v })
  }
  return out
}

function constantColoredSeries(
  times: number[],
  value: number,
  colorForIndex?: (i: number) => string | null,
): ColoredSeriesDataPoint[] {
  const out: ColoredSeriesDataPoint[] = []
  for (let i = 0; i < times.length; i++) {
    const t = times[i]
    if (!isFiniteNumber(t)) continue
    const color = colorForIndex?.(i) ?? null
    if (color) out.push({ time: t, value, color })
    else out.push({ time: t, value })
  }
  return out
}

function markerSeries(
  times: number[],
  signal: boolean[],
  markerValue: number,
  colorForIndex: (i: number) => string,
  offsetBars: number,
): ColoredSeriesDataPoint[] {
  const out: ColoredSeriesDataPoint[] = []
  for (let i = 0; i < Math.min(times.length, signal.length); i++) {
    if (!signal[i]) continue
    const j = i + offsetBars
    if (j < 0 || j >= times.length) continue
    const t = times[j]
    if (!isFiniteNumber(t)) continue
    out.push({ time: t, value: markerValue, color: colorForIndex(i) })
  }
  return out
}

function pivotValueSeries(
  times: number[],
  signalAtConfirm: boolean[],
  pivotValues: number[],
  colorForIndex: (confirmIndex: number) => string,
  offsetBars: number,
): ColoredSeriesDataPoint[] {
  const out: ColoredSeriesDataPoint[] = []
  const n = Math.min(times.length, signalAtConfirm.length, pivotValues.length)
  for (let i = 0; i < n; i++) {
    if (!signalAtConfirm[i]) continue
    const j = i + offsetBars
    if (j < 0 || j >= n) continue
    const t = times[j]
    const v = pivotValues[j]
    if (!isFiniteNumber(t) || !isFiniteNumber(v)) continue
    out.push({ time: t, value: v, color: colorForIndex(i) })
  }
  return out
}

function eventPoints(times: number[], signal: boolean[]): MarketVisionEventPoint[] {
  const out: MarketVisionEventPoint[] = []
  const n = Math.min(times.length, signal.length)
  for (let i = 0; i < n; i++) {
    if (!signal[i]) continue
    const t = times[i]
    if (!isFiniteNumber(t)) continue
    out.push({ time: t, index: i })
  }
  return out
}

/**
 * Pure computation behind useMarketVisionB. Kept out of the hook so it can
 * be unit-tested and reused outside React.
 */
export function computeMarketVisionB(
  data: OHLCVDataPoint[],
  config?: Partial<MarketVisionBConfig>,
): MarketVisionBResult {
  const finalConfig = mergeMarketVisionConfig(DEFAULT_MARKET_VISION_CONFIG, config)

  if (!data.length) {
    return { series: emptySeries(), levels: emptyLevels(), events: emptyEvents(), divergences: emptyDivergences() }
  }

  const times = data.map((d) => d.time)
  const sources = buildCandleSources(data)

  const wave = computeWaveTrend(
    sources,
    finalConfig.waveTrend.wtMASource,
    finalConfig.waveTrend.wtChannelLen,
    finalConfig.waveTrend.wtAverageLen,
    finalConfig.waveTrend.wtMALen,
  )

  const wt1 = wave.wt1
  const wt2 = wave.wt2
  const wtVwap = wave.wtVwap

  const rsiSrc = pickSourceSeries(sources, finalConfig.rsi.rsiSRC)
  const rsiValues = pineRsi(rsiSrc, finalConfig.rsi.rsiLen)

  const rsimfiBase = computeRsiMfi(data, finalConfig.mfi.rsiMFIperiod, finalConfig.mfi.rsiMFIMultiplier, finalConfig.mfi.rsiMFIPosY)

  const stochSrc = pickSourceSeries(sources, finalConfig.stoch.stochSRC)
  const stoch = computeStochRsi(
    stochSrc,
    finalConfig.stoch.stochLen,
    finalConfig.stoch.stochRsiLen,
    finalConfig.stoch.stochKSmooth,
    finalConfig.stoch.stochDSmooth,
    finalConfig.stoch.stochUseLog,
    finalConfig.stoch.stochAvg,
  )

  const tcValues = finalConfig.schaff.tcLine
    ? computeSchaffTc(
        pickSourceSeries(sources, finalConfig.schaff.tcSRC),
        finalConfig.schaff.tclength,
        finalConfig.schaff.tcfastLength,
        finalConfig.schaff.tcslowLength,
        finalConfig.schaff.tcfactor,
      )
    : new Array(times.length).fill(Number.NaN)

  // Divergences (aligned to confirmation bar, i.e. pivotIndex + 2).
  const wtDivs = findVmcDivs(wt2, sources.high, sources.low, finalConfig.waveTrend.wtDivOBLevel, finalConfig.waveTrend.wtDivOSLevel, true)
  const wtDivs2 = findVmcDivs(
    wt2,
    sources.high,
    sources.low,
    finalConfig.waveTrend.wtDivOBLevel_add,
    finalConfig.waveTrend.wtDivOSLevel_add,
    true,
  )
  const wtDivsNl = findVmcDivs(wt2, sources.high, sources.low, 0, 0, false)

  const useHiddenNl = finalConfig.waveTrend.showHiddenDiv_nl
  const wtBearHiddenSelected = useHiddenNl ? wtDivsNl.bearHidden : wtDivs.bearHidden
  const wtBullHiddenSelected = useHiddenNl ? wtDivsNl.bullHidden : wtDivs.bullHidden

  const rsiDivs = findVmcDivs(rsiValues, sources.high, sources.low, finalConfig.rsi.rsiDivOBLevel, finalConfig.rsi.rsiDivOSLevel, true)
  const rsiDivsNl = findVmcDivs(rsiValues, sources.high, sources.low, 0, 0, false)
  const rsiBearHiddenSelected = useHiddenNl ? rsiDivsNl.bearHidden : rsiDivs.bearHidden
  const rsiBullHiddenSelected = useHiddenNl ? rsiDivsNl.bullHidden : rsiDivs.bullHidden

  const stochDivs = findVmcDivs(stoch.k, sources.high, sources.low, 0, 0, false)

  // Signals
  const wtOversold: boolean[] = wt2.map((v) => isFiniteNumber(v) && v <= finalConfig.waveTrend.osLevel)
  const wtOverbought: boolean[] = wt2.map((v) => isFiniteNumber(v) && v >= finalConfig.waveTrend.obLevel)

  const buySignal: boolean[] = new Array(times.length).fill(false)
  const sellSignal: boolean[] = new Array(times.length).fill(false)
  const smallBuyDot: boolean[] = new Array(times.length).fill(false)
  const smallSellDot: boolean[] = new Array(times.length).fill(false)

  for (let i = 0; i < times.length; i++) {
    smallBuyDot[i] = Boolean(wave.wtCross[i]) && Boolean(wave.wtCrossUp[i])
    smallSellDot[i] = Boolean(wave.wtCross[i]) && Boolean(wave.wtCrossDown[i])
    buySignal[i] = smallBuyDot[i]! && Boolean(wtOversold[i])
    sellSignal[i] = smallSellDot[i]! && Boolean(wtOverbought[i])
  }

  const buySignalDiv: boolean[] = new Array(times.length).fill(false)
  const sellSignalDiv: boolean[] = new Array(times.length).fill(false)
  for (let i = 0; i < times.length; i++) {
    buySignalDiv[i] =
      (finalConfig.waveTrend.wtShowDiv && Boolean(wtDivs.bullDiv[i])) ||
      (finalConfig.waveTrend.wtShowDiv && finalConfig.waveTrend.wtDivOBLevel_addshow && Boolean(wtDivs2.bullDiv[i])) ||
      (finalConfig.stoch.stochShowDiv && Boolean(stochDivs.bullDiv[i])) ||
      (finalConfig.rsi.rsiShowDiv && Boolean(rsiDivs.bullDiv[i]))

    sellSignalDiv[i] =
      (finalConfig.waveTrend.wtShowDiv && Boolean(wtDivs.bearDiv[i])) ||
      (finalConfig.waveTrend.wtShowDiv && finalConfig.waveTrend.wtDivOBLevel_addshow && Boolean(wtDivs2.bearDiv[i])) ||
      (finalConfig.stoch.stochShowDiv && Boolean(stochDivs.bearDiv[i])) ||
      (finalConfig.rsi.rsiShowDiv && Boolean(rsiDivs.bearDiv[i]))
  }

  const divBuyColor = (i: number): string => {
    if (wtDivs.bullDiv[i]) return finalConfig.colors.colorGreen
    if (finalConfig.waveTrend.wtDivOBLevel_addshow && wtDivs2.bullDiv[i]) return withAlpha(finalConfig.colors.colorGreen, 0.4)
    if (finalConfig.rsi.rsiShowDiv && rsiDivs.bullDiv[i]) return finalConfig.colors.colorGreen
    return finalConfig.colors.colorGreen
  }

  const divSellColor = (i: number): string => {
    if (wtDivs.bearDiv[i]) return finalConfig.colors.colorRed
    if (finalConfig.waveTrend.wtDivOBLevel_addshow && wtDivs2.bearDiv[i]) return withAlpha(finalConfig.colors.colorRed, 0.4)
    if (finalConfig.rsi.rsiShowDiv && rsiDivs.bearDiv[i]) return finalConfig.colors.colorRed
    return finalConfig.colors.colorRed
  }

  // Gold buy (computed at confirmation bar, plotted at offset -2).
  const wtGoldBuy: boolean[] = new Array(times.length).fill(false)
  for (let i = 0; i < times.length; i++) {
    const prevPivotIx = wtDivs.prevBotPivotIndex[i]
    const lastRsi = prevPivotIx != null ? rsiValues[prevPivotIx] : Number.NaN
    const wtLowPrev = wtDivs.prevBotSrc[i]
    const wt2Now = wt2[i]

    wtGoldBuy[i] =
      ((finalConfig.waveTrend.wtShowDiv && Boolean(wtDivs.bullDiv[i])) || (finalConfig.rsi.rsiShowDiv && Boolean(rsiDivs.bullDiv[i]))) &&
      isFiniteNumber(wtLowPrev) &&
      isFiniteNumber(wt2Now) &&
      wtLowPrev <= finalConfig.waveTrend.osLevel3 &&
      wt2Now > finalConfig.waveTrend.osLevel3 &&
      wtLowPrev - wt2Now <= -5 &&
      isFiniteNumber(lastRsi) &&
      lastRsi < 30
  }

  // Higher timeframe features (Sommi + MACD colors): disable if insufficient resolution.
  const sommiHvwapAligned: number[] = new Array(times.length).fill(Number.NaN)
  const sommiFlagBear: boolean[] = new Array(times.length).fill(false)
  const sommiFlagBull: boolean[] = new Array(times.length).fill(false)

  const sommiDiamondBear: boolean[] = new Array(times.length).fill(false)
  const sommiDiamondBull: boolean[] = new Array(times.length).fill(false)

  const macdWT1Color: Array<string | null> = new Array(times.length).fill(null)
  const macdWT2Color: Array<string | null> = new Array(times.length).fill(null)

  // Sommi flag HVWAP (WT vwap on HTF).
  // Pine fetches this via security() with the default barmerge.lookahead_off,
  // so base bars must read the last *completed* HTF bar — hence 'off' below.
  if ((finalConfig.sommi.flag.sommiFlagShow || finalConfig.sommi.flag.sommiShowVwap) && parsePineTimeframeMinutes(finalConfig.sommi.flag.sommiVwapTF) != null) {
    const tfMinutes = parsePineTimeframeMinutes(finalConfig.sommi.flag.sommiVwapTF)!
    if (canResampleToMinutes(data, tfMinutes)) {
      const targetSeconds = tfMinutes * 60
      const resampled = resampleOHLCVToSeconds(data, targetSeconds)
      const baseToHtf = buildBaseToResampledIndexMap(data, resampled, targetSeconds)

      const hSources = {
        open: resampled.map((b) => b.open),
        high: resampled.map((b) => b.high),
        low: resampled.map((b) => b.low),
        close: resampled.map((b) => b.close),
        hlc3: resampled.map((b) => (b.high + b.low + b.close) / 3),
      }

      const hWave = computeWaveTrend(
        hSources,
        finalConfig.waveTrend.wtMASource,
        finalConfig.waveTrend.wtChannelLen,
        finalConfig.waveTrend.wtAverageLen,
        finalConfig.waveTrend.wtMALen,
      )
      const hvwapHtf = hWave.wtVwap
      const hvwapAligned = alignHtfValuesToBase(baseToHtf, hvwapHtf, 'off')
      for (let i = 0; i < sommiHvwapAligned.length; i++) sommiHvwapAligned[i] = hvwapAligned[i] ?? Number.NaN

      if (finalConfig.sommi.flag.sommiFlagShow) {
        const sommi = computeSommiFlag({
          rsimfi: rsimfiBase,
          wt2,
          wtCross: wave.wtCross,
          wtCrossUp: wave.wtCrossUp,
          wtCrossDown: wave.wtCrossDown,
          hwtVwap: hvwapAligned,
          soomiRSIMFIBearLevel: finalConfig.sommi.flag.soomiRSIMFIBearLevel,
          soomiRSIMFIBullLevel: finalConfig.sommi.flag.soomiRSIMFIBullLevel,
          soomiFlagWTBearLevel: finalConfig.sommi.flag.soomiFlagWTBearLevel,
          soomiFlagWTBullLevel: finalConfig.sommi.flag.soomiFlagWTBullLevel,
          sommiVwapBearLevel: finalConfig.sommi.flag.sommiVwapBearLevel,
          sommiVwapBullLevel: finalConfig.sommi.flag.sommiVwapBullLevel,
        })

        for (let i = 0; i < times.length; i++) {
          sommiFlagBear[i] = sommi.bearish[i] ?? false
          sommiFlagBull[i] = sommi.bullish[i] ?? false
        }
      }
    }
  }

  // Sommi diamond (heikin ashi candle direction on 2 HTFs).
  // Pine's f_getTFCandle explicitly uses barmerge.lookahead_on, so mapping
  // base bars to their *own* (current) HTF bucket is the correct parity here.
  if (finalConfig.sommi.diamond.sommiDiamondShow) {
    const tf1Min = parsePineTimeframeMinutes(finalConfig.sommi.diamond.sommiHTCRes)
    const tf2Min = parsePineTimeframeMinutes(finalConfig.sommi.diamond.sommiHTCRes2)

    if (tf1Min != null && tf2Min != null && canResampleToMinutes(data, tf1Min) && canResampleToMinutes(data, tf2Min)) {
      const tf1Seconds = tf1Min * 60
      const tf2Seconds = tf2Min * 60

      const rs1 = resampleOHLCVToSeconds(data, tf1Seconds)
      const rs2 = resampleOHLCVToSeconds(data, tf2Seconds)

      const ha1 = toHeikinAshiBars(rs1)
      const ha2 = toHeikinAshiBars(rs2)

      const baseTo1 = buildBaseToResampledIndexMap(data, ha1, tf1Seconds)
      const baseTo2 = buildBaseToResampledIndexMap(data, ha2, tf2Seconds)

      const dir1Htf = ha1.map((b) => b.close > b.open)
      const dir2Htf = ha2.map((b) => b.close > b.open)

      const dir1: boolean[] = baseTo1.map((ix) => (ix == null ? false : Boolean(dir1Htf[ix])))
      const dir2: boolean[] = baseTo2.map((ix) => (ix == null ? false : Boolean(dir2Htf[ix])))

      const diamond = computeSommiDiamond({
        wt2,
        wtCross: wave.wtCross,
        wtCrossUp: wave.wtCrossUp,
        wtCrossDown: wave.wtCrossDown,
        candleBodyDirTf1: dir1,
        candleBodyDirTf2: dir2,
        soomiDiamondWTBearLevel: finalConfig.sommi.diamond.soomiDiamondWTBearLevel,
        soomiDiamondWTBullLevel: finalConfig.sommi.diamond.soomiDiamondWTBullLevel,
      })

      for (let i = 0; i < times.length; i++) {
        sommiDiamondBear[i] = diamond.bearish[i] ?? false
        sommiDiamondBull[i] = diamond.bullish[i] ?? false
      }
    }
  }

  // MACD WT colors — also security() with lookahead_off in Pine (see above).
  if (finalConfig.macdColors.macdWTColorsShow) {
    const tfMin = parsePineTimeframeMinutes(finalConfig.macdColors.macdWTColorsTF)
    if (tfMin != null && canResampleToMinutes(data, tfMin)) {
      const targetSeconds = tfMin * 60
      const resampled = resampleOHLCVToSeconds(data, targetSeconds)
      const baseToHtf = buildBaseToResampledIndexMap(data, resampled, targetSeconds)

      const hrsimfiHtf = computeRsiMfi(resampled, finalConfig.mfi.rsiMFIperiod, finalConfig.mfi.rsiMFIMultiplier, finalConfig.mfi.rsiMFIPosY)
      const hrsimfiAligned = alignHtfValuesToBase(baseToHtf, hrsimfiHtf, 'off')

      const closeHtf = resampled.map((b) => b.close)
      const macd = computeMacd(closeHtf, 28, 42, 9)
      const macdAligned = alignHtfValuesToBase(baseToHtf, macd.macd, 'off')
      const signalAligned = alignHtfValuesToBase(baseToHtf, macd.signal, 'off')

      const colors = computeMacdWtColors({
        hrsimfi: hrsimfiAligned,
        macd: macdAligned,
        signal: signalAligned,
        colormacdWT1a: finalConfig.colors.colormacdWT1a,
        colormacdWT1b: finalConfig.colors.colormacdWT1b,
        colormacdWT1c: finalConfig.colors.colormacdWT1c,
        colormacdWT1d: finalConfig.colors.colormacdWT1d,
        colormacdWT2a: finalConfig.colors.colormacdWT2a,
        colormacdWT2b: finalConfig.colors.colormacdWT2b,
        colormacdWT2c: finalConfig.colors.colormacdWT2c,
        colormacdWT2d: finalConfig.colors.colormacdWT2d,
      })

      for (let i = 0; i < times.length; i++) {
        macdWT1Color[i] = colors.macdWT1Color[i] ?? null
        macdWT2Color[i] = colors.macdWT2Color[i] ?? null
      }
    }
  }

  // Colors (Pine parity)
  const rsiColorForIndex = (_i: number, value: number): string | null => {
    if (value <= finalConfig.rsi.rsiOversold) return finalConfig.colors.rsiOversold
    if (value >= finalConfig.rsi.rsiOverbought) return finalConfig.colors.rsiOverbought
    return finalConfig.colors.rsiInBetween
  }

  const mfiColorForIndex = (_i: number, value: number): string | null =>
    value > 0 ? finalConfig.colors.mfiAbove : finalConfig.colors.mfiBelow

  const wtCrossColorForIndex = (i: number): string => {
    const w1 = wt1[i]
    const w2 = wt2[i]
    if (!isFiniteNumber(w1) || !isFiniteNumber(w2)) return finalConfig.colors.colorWhite
    // Pine: `plot(..., style=circles, transp=15)` → alpha=0.85.
    return w2 - w1 > 0 ? 'oklch(0.6786 0.2095 24.66 / 0.85)' : 'oklch(0.8099 0.2141 151.77 / 0.85)'
  }

  const wt1Color = (i: number): string | null => macdWT1Color[i] ?? finalConfig.colors.colorWT1Fill
  const wt2Color = (i: number): string | null => macdWT2Color[i] ?? finalConfig.colors.colorWT2Fill

  const series: MarketVisionSignalSeries = emptySeries()

  if (finalConfig.waveTrend.wtShow) {
    series.wt1 = toColoredSeries(times, wt1, (i, v) => (isFiniteNumber(v) ? wt1Color(i) : null))
    series.wt2 = toColoredSeries(times, wt2, (i, v) => (isFiniteNumber(v) ? wt2Color(i) : null))
  }

  if (finalConfig.waveTrend.vwapShow) {
    series.wtVwap = toColoredSeries(times, wtVwap, () => finalConfig.colors.vwapColor)
  }

  if (finalConfig.mfi.rsiMFIShow) {
    series.rsiMfi = toColoredSeries(times, rsimfiBase, mfiColorForIndex)
    series.mfiBarTop = constantColoredSeries(times, -95, (i) => mfiColorForIndex(i, rsimfiBase[i] ?? 0))
    series.mfiBarBottom = constantColoredSeries(times, -99, (i) => mfiColorForIndex(i, rsimfiBase[i] ?? 0))
  }

  if (finalConfig.rsi.rsiShow) {
    series.rsi = toColoredSeries(times, rsiValues, rsiColorForIndex)
  }

  if (finalConfig.stoch.stochShow) {
    series.stochK = toColoredSeries(times, stoch.k, () => finalConfig.colors.stochK)
    series.stochD = toColoredSeries(times, stoch.d, () => finalConfig.colors.stochD)
  }

  if (finalConfig.schaff.tcLine) {
    series.tc = toColoredSeries(times, tcValues, () => 'oklch(0.4742 0.1862 294.78 / 0.25)')
  }

  // Divergence plots (pivot bar, offset -2).
  if (finalConfig.waveTrend.wtShowDiv || finalConfig.waveTrend.wtShowHiddenDiv) {
    const wtBearCombined: boolean[] = wtDivs.bearDiv.map(
      (v, i) => (finalConfig.waveTrend.wtShowDiv && Boolean(v)) || (finalConfig.waveTrend.wtShowHiddenDiv && Boolean(wtBearHiddenSelected[i])),
    )
    const wtBullCombined: boolean[] = wtDivs.bullDiv.map(
      (v, i) => (finalConfig.waveTrend.wtShowDiv && Boolean(v)) || (finalConfig.waveTrend.wtShowHiddenDiv && Boolean(wtBullHiddenSelected[i])),
    )

    series.wtBearDiv = pivotValueSeries(times, wtBearCombined, wt2, () => finalConfig.colors.wtBearDiv, -2)
    series.wtBullDiv = pivotValueSeries(times, wtBullCombined, wt2, () => finalConfig.colors.wtBullDiv, -2)
  }

  if (finalConfig.waveTrend.wtShowDiv && finalConfig.waveTrend.wtDivOBLevel_addshow) {
    series.wtBearDiv2 = pivotValueSeries(times, wtDivs2.bearDiv, wt2, () => finalConfig.colors.wtBearDiv, -2)
    series.wtBullDiv2 = pivotValueSeries(times, wtDivs2.bullDiv, wt2, () => finalConfig.colors.wtBullDiv, -2)
  }

  if (finalConfig.rsi.rsiShowDiv || finalConfig.rsi.rsiShowHiddenDiv) {
    const rBearCombined: boolean[] = rsiDivs.bearDiv.map(
      (v, i) => (finalConfig.rsi.rsiShowDiv && Boolean(v)) || (finalConfig.rsi.rsiShowHiddenDiv && Boolean(rsiBearHiddenSelected[i])),
    )
    const rBullCombined: boolean[] = rsiDivs.bullDiv.map(
      (v, i) => (finalConfig.rsi.rsiShowDiv && Boolean(v)) || (finalConfig.rsi.rsiShowHiddenDiv && Boolean(rsiBullHiddenSelected[i])),
    )
    series.rsiBearDiv = pivotValueSeries(times, rBearCombined, rsiValues, () => finalConfig.colors.wtBearDiv, -2)
    series.rsiBullDiv = pivotValueSeries(times, rBullCombined, rsiValues, () => finalConfig.colors.wtBullDiv, -2)
  }

  if (finalConfig.stoch.stochShowDiv || finalConfig.stoch.stochShowHiddenDiv) {
    const sBearCombined: boolean[] = stochDivs.bearDiv.map(
      (v, i) => (finalConfig.stoch.stochShowDiv && Boolean(v)) || (finalConfig.stoch.stochShowHiddenDiv && Boolean(stochDivs.bearHidden[i])),
    )
    const sBullCombined: boolean[] = stochDivs.bullDiv.map(
      (v, i) => (finalConfig.stoch.stochShowDiv && Boolean(v)) || (finalConfig.stoch.stochShowHiddenDiv && Boolean(stochDivs.bullHidden[i])),
    )
    series.stochBearDiv = pivotValueSeries(times, sBearCombined, stoch.k, () => finalConfig.colors.colorRed, -2)
    series.stochBullDiv = pivotValueSeries(times, sBullCombined, stoch.k, () => finalConfig.colors.colorGreen, -2)
  }

  // WT cross circles (actual wt2 value)
  series.wtCrossCircles = toColoredSeries(
    times,
    wt2.map((v, i) => (wave.wtCross[i] ? v : Number.NaN)),
    (i) => wtCrossColorForIndex(i),
  )

  // Buy / sell circles
  if (finalConfig.waveTrend.wtBuyShow) {
    series.buyCircle = markerSeries(times, buySignal, -107, () => finalConfig.colors.colorGreen, 0)
  }
  if (finalConfig.waveTrend.wtSellShow) {
    series.sellCircle = markerSeries(times, sellSignal, 105, () => finalConfig.colors.colorRed, 0)
  }

  if (finalConfig.waveTrend.wtDivShow) {
    series.divBuyCircle = markerSeries(times, buySignalDiv, -106, divBuyColor, -2)
    series.divSellCircle = markerSeries(times, sellSignalDiv, 106, divSellColor, -2)
  }

  if (finalConfig.waveTrend.wtGoldShow) {
    series.goldBuyCircle = markerSeries(times, wtGoldBuy, -106, () => finalConfig.colors.colorOrange, -2)
  }

  // Sommi HVWAP plot
  if (finalConfig.sommi.flag.sommiShowVwap) {
    series.sommiHvwap = toColoredSeries(times, pineEma(sommiHvwapAligned, 3), () => finalConfig.colors.colorYellow)
  }

  if (finalConfig.sommi.flag.sommiFlagShow) {
    series.sommiBearFlag = markerSeries(times, sommiFlagBear, 108, () => finalConfig.colors.sommiBear, 0)
    series.sommiBullFlag = markerSeries(times, sommiFlagBull, -108, () => finalConfig.colors.sommiBull, 0)
  }

  if (finalConfig.sommi.diamond.sommiDiamondShow) {
    series.sommiBearDiamond = markerSeries(times, sommiDiamondBear, 108, () => finalConfig.colors.sommiBear, 0)
    series.sommiBullDiamond = markerSeries(times, sommiDiamondBull, -108, () => finalConfig.colors.sommiBull, 0)
  }

  const levels: MarketVisionSeriesLevels = {
    zero: constantColoredSeries(times, 0),
    obLevel2: constantColoredSeries(times, finalConfig.waveTrend.obLevel2),
    obLevel3: constantColoredSeries(times, finalConfig.waveTrend.obLevel3),
    osLevel2: constantColoredSeries(times, finalConfig.waveTrend.osLevel2),
  }

  // Discrete signal events — parity with the Pine script's alertcondition()s.
  // Unlike the display series above these are NOT gated by the *Show flags
  // (matching Pine, where alertconditions fire regardless of plot visibility).
  const events: MarketVisionEvents = {
    buy: eventPoints(times, buySignal),
    sell: eventPoints(times, sellSignal),
    buyDiv: eventPoints(times, buySignalDiv),
    sellDiv: eventPoints(times, sellSignalDiv),
    goldBuy: eventPoints(times, wtGoldBuy),
    smallBuyDot: eventPoints(times, smallBuyDot),
    smallSellDot: eventPoints(times, smallSellDot),
    sommiBullFlag: eventPoints(times, sommiFlagBull),
    sommiBearFlag: eventPoints(times, sommiFlagBear),
    sommiBullDiamond: eventPoints(times, sommiDiamondBull),
    sommiBearDiamond: eventPoints(times, sommiDiamondBear),
  }

  // Tolerance-paired divergences (upgraded engine, additive output).
  const divergences: MarketVisionDivergences = emptyDivergences()
  if (finalConfig.divergenceEngine.enabled) {
    const engineConfig = {
      leftBars: finalConfig.divergenceEngine.leftBars,
      rightBars: finalConfig.divergenceEngine.rightBars,
      pairMode: finalConfig.divergenceEngine.pairMode,
      tolBars: finalConfig.divergenceEngine.tolBars,
      allowEqual: finalConfig.divergenceEngine.allowEqual,
      priceEps: finalConfig.divergenceEngine.priceEps,
      oscEps: finalConfig.divergenceEngine.oscEps,
      showRegular: true,
      showHidden: true,
    }

    const resolveTimes = (d: {
      type: MarketVisionPairedDivergence['type']
      startIndex: number
      endIndex: number
      oscStart: number
      oscEnd: number
      priceStart: number
      priceEnd: number
    }): MarketVisionPairedDivergence => ({
      ...d,
      startTime: times[d.startIndex] ?? 0,
      endTime: times[d.endIndex] ?? 0,
    })

    divergences.wt = findPairedDivergences(sources.high, sources.low, wt2, engineConfig).map(resolveTimes)
    divergences.rsi = findPairedDivergences(sources.high, sources.low, rsiValues, engineConfig).map(resolveTimes)
    divergences.stoch = findPairedDivergences(sources.high, sources.low, stoch.k, engineConfig).map(resolveTimes)
  }

  return { series, levels, events, divergences }
}
