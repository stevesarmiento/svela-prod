import { describe, expect, test } from 'bun:test'
import { computeMarketVisionB } from './market-vision-compute'
import { DEFAULT_MARKET_VISION_CONFIG } from './market-vision-config'
import { pineEma } from './pine-math'
import { makeFixtureBars } from './test-fixtures'
import { alignHtfValuesToBase, buildBaseToResampledIndexMap, resampleOHLCVToSeconds } from './timeframes'
import { computeWaveTrend } from './vmc-core'

const bars = makeFixtureBars(400, 42)

describe('computeMarketVisionB', () => {
  test('empty input returns fully-shaped empty result', () => {
    const res = computeMarketVisionB([])
    expect(res.series.wt1).toEqual([])
    expect(res.levels.zero).toEqual([])
    expect(res.events.buy).toEqual([])
    expect(res.divergences).toEqual({ wt: [], rsi: [], stoch: [] })
  })

  test('series counts on seed-42 fixture (characterization)', () => {
    const res = computeMarketVisionB(bars)
    const counts = Object.fromEntries(Object.entries(res.series).map(([k, v]) => [k, v.length]))
    expect(counts).toEqual({
      wt1: 388,
      wt2: 386,
      wtVwap: 386,
      rsiMfi: 341,
      mfiBarTop: 400,
      mfiBarBottom: 400,
      rsi: 386,
      stochK: 398,
      stochD: 396,
      tc: 0,
      sommiHvwap: 0,
      wtBearDiv: 2,
      wtBullDiv: 0,
      wtBearDiv2: 1,
      wtBullDiv2: 0,
      rsiBearDiv: 0,
      rsiBullDiv: 0,
      stochBearDiv: 0,
      stochBullDiv: 0,
      wtCrossCircles: 38,
      buyCircle: 7,
      sellCircle: 8,
      divBuyCircle: 0,
      divSellCircle: 2,
      goldBuyCircle: 0,
      sommiBearFlag: 0,
      sommiBullFlag: 0,
      sommiBearDiamond: 0,
      sommiBullDiamond: 0,
    })
  })

  test('wt2 tail values are stable (regression lock)', () => {
    const res = computeMarketVisionB(bars)
    expect(res.series.wt2.slice(-3).map((p) => [p.time, +p.value.toFixed(8)])).toEqual([
      [1701429200, 56.38823252],
      [1701432800, 66.17181991],
      [1701436400, 73.42121175],
    ])
  })

  test('events mirror the alertcondition signals (characterization)', () => {
    const res = computeMarketVisionB(bars)
    expect(res.events.buy.map((e) => e.index)).toEqual([51, 123, 193, 259, 262, 287, 352])
    expect(res.events.sell.map((e) => e.index)).toEqual([76, 104, 145, 168, 236, 238, 308, 379])
    expect(res.events.goldBuy).toEqual([])
    expect(res.events.smallBuyDot.length).toBe(19)
    expect(res.events.smallSellDot.length).toBe(19)
    expect(res.events.buyDiv.length).toBe(0)
    expect(res.events.sellDiv.length).toBe(2)

    // Every big-circle event must be a small-dot event too (buy ⊂ crossUp).
    const smallBuys = new Set(res.events.smallBuyDot.map((e) => e.index))
    for (const e of res.events.buy) expect(smallBuys.has(e.index)).toBe(true)

    // Event times match the plotted circles 1:1 when display flags are on.
    expect(res.events.buy.map((e) => e.time)).toEqual(res.series.buyCircle.map((p) => p.time))
    expect(res.events.sell.map((e) => e.time)).toEqual(res.series.sellCircle.map((p) => p.time))
  })

  test('events fire regardless of display flags (Pine alertcondition parity)', () => {
    const res = computeMarketVisionB(bars, {
      waveTrend: { ...DEFAULT_MARKET_VISION_CONFIG.waveTrend, wtBuyShow: false, wtSellShow: false, wtGoldShow: false },
    })
    expect(res.series.buyCircle).toEqual([]) // display suppressed
    expect(res.events.buy.length).toBe(7) // signal still fires
    expect(res.events.sell.length).toBe(8)
  })

  test('tolerance-paired divergences (upgraded engine, characterization)', () => {
    const res = computeMarketVisionB(bars)
    expect(res.divergences.wt.map((d) => [d.type, d.startIndex, d.endIndex])).toEqual([
      ['bullish', 93, 156],
      ['h_bullish', 223, 262],
      ['bearish', 212, 274],
    ])
    expect(res.divergences.rsi).toEqual([])
    expect(res.divergences.stoch.map((d) => [d.type, d.startIndex, d.endIndex])).toEqual([
      ['h_bearish', 103, 210],
      ['bullish', 156, 220],
    ])

    // Times resolve to actual bar times, segments point forward.
    for (const d of res.divergences.wt) {
      expect(d.startTime).toBe(bars[d.startIndex]!.time)
      expect(d.endTime).toBe(bars[d.endIndex]!.time)
      expect(d.endIndex).toBeGreaterThan(d.startIndex)
    }
  })

  test('divergence engine can be disabled', () => {
    const res = computeMarketVisionB(bars, {
      divergenceEngine: { ...DEFAULT_MARKET_VISION_CONFIG.divergenceEngine, enabled: false },
    })
    expect(res.divergences).toEqual({ wt: [], rsi: [], stoch: [] })
    // Pine-parity outputs unaffected
    expect(res.events.buy.length).toBe(7)
  })

  test('sommi hVWAP uses lookahead_off security() semantics', () => {
    const res = computeMarketVisionB(bars, {
      sommi: {
        ...DEFAULT_MARKET_VISION_CONFIG.sommi,
        flag: { ...DEFAULT_MARKET_VISION_CONFIG.sommi.flag, sommiShowVwap: true, sommiFlagShow: true, sommiVwapTF: '240' },
      },
    })

    // Rebuild the expected series from primitives with lookahead 'off'.
    const targetSeconds = 240 * 60
    const resampled = resampleOHLCVToSeconds(bars, targetSeconds)
    const baseToHtf = buildBaseToResampledIndexMap(bars, resampled, targetSeconds)
    const hWave = computeWaveTrend(
      {
        open: resampled.map((b) => b.open),
        high: resampled.map((b) => b.high),
        low: resampled.map((b) => b.low),
        close: resampled.map((b) => b.close),
        hlc3: resampled.map((b) => (b.high + b.low + b.close) / 3),
      },
      'hlc3',
      9,
      12,
      3,
    )
    const alignedOff = alignHtfValuesToBase(baseToHtf, hWave.wtVwap, 'off')
    const expectedEma = pineEma(alignedOff, 3)
    const expected = bars
      .map((b, i) => ({ time: b.time, value: expectedEma[i]! }))
      .filter((p) => Number.isFinite(p.value))

    expect(res.series.sommiHvwap.map((p) => [p.time, +p.value.toFixed(10)])).toEqual(
      expected.map((p) => [p.time, +p.value.toFixed(10)]),
    )

    // And it must NOT equal the lookahead_on variant (the old leaky behavior).
    const alignedOn = alignHtfValuesToBase(baseToHtf, hWave.wtVwap, 'on')
    expect(res.series.sommiHvwap.map((p) => p.value)).not.toEqual(
      bars
        .map((_, i) => pineEma(alignedOn, 3)[i]!)
        .filter((v) => Number.isFinite(v)),
    )

    // Flag events on this fixture (characterization).
    expect(res.events.sommiBearFlag.map((e) => e.index)).toEqual([212, 216])
    expect(res.events.sommiBullFlag).toEqual([])
  })

  test('MACD WT colors start only after the first completed HTF bar (lookahead_off)', () => {
    const res = computeMarketVisionB(bars, {
      macdColors: { macdWTColorsShow: true, macdWTColorsTF: '240' },
    })
    const defaultFill = DEFAULT_MARKET_VISION_CONFIG.colors.colorWT1Fill
    const colored = res.series.wt1.filter((p) => p.color && p.color !== defaultFill)

    expect(colored.length).toBe(162)
    expect(bars.findIndex((b) => b.time === colored[0]?.time)).toBe(238)
    // Only the Pine MACD palette shows up.
    const palette = new Set([
      DEFAULT_MARKET_VISION_CONFIG.colors.colormacdWT1a,
      DEFAULT_MARKET_VISION_CONFIG.colors.colormacdWT1b,
      DEFAULT_MARKET_VISION_CONFIG.colors.colormacdWT1c,
      DEFAULT_MARKET_VISION_CONFIG.colors.colormacdWT1d,
    ])
    for (const p of colored) expect(palette.has(p.color!)).toBe(true)
  })

  test('config merging accepts partial patches without clobbering siblings', () => {
    const res = computeMarketVisionB(bars, { rsi: { rsiLen: 21 } as never })
    // rsi length changed → different rsi series than default
    const def = computeMarketVisionB(bars)
    expect(res.series.rsi.at(-1)?.value).not.toBe(def.series.rsi.at(-1)?.value)
    // untouched sections still work
    expect(res.series.wt2.at(-1)?.value).toBe(def.series.wt2.at(-1)?.value)
  })
})
