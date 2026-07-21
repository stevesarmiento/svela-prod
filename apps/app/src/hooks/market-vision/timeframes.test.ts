import { describe, expect, test } from 'bun:test'
import type { OHLCVDataPoint } from './market-vision-config'
import {
  alignHtfValuesToBase,
  buildBaseToResampledIndexMap,
  canResampleToMinutes,
  parsePineTimeframeMinutes,
  resampleOHLCVToSeconds,
  toHeikinAshiBars,
} from './timeframes'

function bar(time: number, o: number, h: number, l: number, c: number): OHLCVDataPoint {
  return { time, open: o, high: h, low: l, close: c, volume: 1 }
}

describe('parsePineTimeframeMinutes', () => {
  test('parses VuManChu-style minute strings', () => {
    expect(parsePineTimeframeMinutes('60')).toBe(60)
    expect(parsePineTimeframeMinutes('240')).toBe(240)
    expect(parsePineTimeframeMinutes(' 720 ')).toBe(720)
    expect(parsePineTimeframeMinutes('')).toBeNull()
    expect(parsePineTimeframeMinutes('D')).toBeNull()
    expect(parsePineTimeframeMinutes('-5')).toBeNull()
  })
})

describe('resampling', () => {
  // 6 hourly bars → 2 four-hour-ish buckets at 7200s (2h) boundaries
  const hourly = [
    bar(0, 10, 12, 9, 11),
    bar(3600, 11, 15, 10, 14),
    bar(7200, 14, 16, 13, 15),
    bar(10800, 15, 17, 14, 16),
    bar(14400, 16, 18, 12, 13),
    bar(18000, 13, 14, 11, 12),
  ]

  test('resampleOHLCVToSeconds aggregates OHLCV per bucket', () => {
    const rs = resampleOHLCVToSeconds(hourly, 7200)
    expect(rs).toEqual([
      { time: 0, open: 10, high: 15, low: 9, close: 14, volume: 2 },
      { time: 7200, open: 14, high: 17, low: 13, close: 16, volume: 2 },
      { time: 14400, open: 16, high: 18, low: 11, close: 12, volume: 2 },
    ])
  })

  test('canResampleToMinutes only allows coarser targets', () => {
    expect(canResampleToMinutes(hourly, 120)).toBe(true)
    expect(canResampleToMinutes(hourly, 60)).toBe(true)
    expect(canResampleToMinutes(hourly, 30)).toBe(false)
  })

  test('lookahead on vs off (security() parity)', () => {
    const rs = resampleOHLCVToSeconds(hourly, 7200)
    const map = buildBaseToResampledIndexMap(hourly, rs, 7200)
    expect(map).toEqual([0, 0, 1, 1, 2, 2])

    const htfValues = [100, 200, 300]

    // lookahead_on: base bars read their own bucket's final value (future
    // leak inside the bucket — VMC's f_getTFCandle behavior).
    expect(alignHtfValuesToBase(map, htfValues, 'on')).toEqual([100, 100, 200, 200, 300, 300])
    // default stays 'on' for backwards compatibility
    expect(alignHtfValuesToBase(map, htfValues)).toEqual([100, 100, 200, 200, 300, 300])

    // lookahead_off (Pine default): base bars read the last COMPLETED
    // bucket — bucket 0 has no completed predecessor, so NaN.
    const off = alignHtfValuesToBase(map, htfValues, 'off')
    expect(off.slice(2)).toEqual([100, 100, 200, 200])
    expect(Number.isNaN(off[0])).toBe(true)
    expect(Number.isNaN(off[1])).toBe(true)
  })
})

describe('toHeikinAshiBars', () => {
  test('first bar seeds from own open/close; subsequent from prior HA', () => {
    const bars = resampleOHLCVToSeconds([bar(0, 10, 12, 9, 11), bar(3600, 11, 15, 10, 14)], 3600)
    const ha = toHeikinAshiBars(bars)

    // Bar 0: haClose = (10+12+9+11)/4 = 10.5, haOpen = (10+11)/2 = 10.5
    expect(ha[0]).toEqual({ time: 0, open: 10.5, high: 12, low: 9, close: 10.5 })
    // Bar 1: haClose = (11+15+10+14)/4 = 12.5, haOpen = (10.5+10.5)/2 = 10.5
    expect(ha[1]).toEqual({ time: 3600, open: 10.5, high: 15, low: 10, close: 12.5 })
  })
})
