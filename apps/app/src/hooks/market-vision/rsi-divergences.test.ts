import { describe, expect, test } from 'bun:test'
import { calculateRsiDivergences } from './rsi-divergences'
import { makeFixtureBars } from './test-fixtures'

// Characterization tests: these lock the exact output of the tolerance-pairing
// divergence engine on deterministic fixtures. Captured from the original
// implementation BEFORE the engine was extracted into divergence-engine.ts —
// if any of these change, the refactor altered behavior.

type Row = [string, number, number, number, number, number, number]

function rows(bars: ReturnType<typeof makeFixtureBars>, config?: Parameters<typeof calculateRsiDivergences>[1]): Row[] {
  return calculateRsiDivergences(bars, config).divergences.map((d) => [
    d.type,
    d.startIndex,
    d.endIndex,
    +d.rsiStart.toFixed(6),
    +d.rsiEnd.toFixed(6),
    +d.priceStart.toFixed(6),
    +d.priceEnd.toFixed(6),
  ])
}

describe('calculateRsiDivergences (characterization)', () => {
  const bars = makeFixtureBars(400, 42)
  const smooth = makeFixtureBars(400, 7)

  test('default config on seed-42 fixture', () => {
    expect(rows(bars)).toEqual([])
  })

  test('Same Bar pair mode on seed-42 fixture', () => {
    expect(rows(bars, { pairMode: 'Same Bar' })).toEqual([])
  })

  test('strict 3/3 pivots, tol 3, no equals', () => {
    expect(rows(bars, { allowEqual: false, tolBars: 3, leftBars: 3, rightBars: 3 })).toEqual([
      ['bearish', 84, 102, 70.93438, 70.391753, 109.437589, 113.961544],
      ['h_bearish', 109, 153, 60.392775, 62.411743, 111.854728, 105.449473],
      ['h_bullish', 218, 260, 40.296273, 28.519861, 98.369259, 104.965011],
      ['bearish', 307, 311, 81.965662, 81.850944, 117.676047, 119.836612],
      ['h_bullish', 384, 390, 66.440028, 60.081326, 113.295541, 113.701131],
    ])
  })

  test('Close price mode', () => {
    expect(rows(bars, { priceMode: 'Close' })).toEqual([
      ['h_bullish', 218, 260, 40.296273, 28.519861, 99.5675, 105.585983],
    ])
  })

  test('tolBars 4 on seed-42 fixture', () => {
    expect(rows(bars, { tolBars: 4 })).toEqual([
      ['h_bullish', 218, 260, 40.296273, 28.519861, 98.369259, 104.965011],
    ])
  })

  test('default config on seed-7 fixture', () => {
    expect(rows(smooth)).toEqual([
      ['h_bullish', 217, 263, 41.494133, 32.33325, 98.715737, 105.051847],
      ['h_bullish', 288, 357, 18.678285, 15.825658, 95.918147, 96.331927],
    ])
  })

  test('tolBars 4 on seed-7 fixture', () => {
    expect(rows(smooth, { tolBars: 4 })).toEqual([
      ['bearish', 77, 104, 79.036135, 75.248882, 109.7382, 113.092265],
      ['h_bullish', 217, 263, 41.494133, 32.33325, 98.715737, 105.051847],
    ])
  })

  test('showRegular / showHidden filters', () => {
    expect(rows(smooth, { showRegular: false, tolBars: 4 })).toEqual([
      ['h_bullish', 217, 263, 41.494133, 32.33325, 98.715737, 105.051847],
    ])
    expect(rows(smooth, { showHidden: false, tolBars: 4 })).toEqual([
      ['bearish', 77, 104, 79.036135, 75.248882, 109.7382, 113.092265],
    ])
  })

  test('rsi series tail is stable', () => {
    const res = calculateRsiDivergences(bars)
    expect(res.rsiSeries.slice(-3).map((p) => [p.time, +p.value.toFixed(8)])).toEqual([
      [1701429200, 72.03216076],
      [1701432800, 74.7783765],
      [1701436400, 74.94443346],
    ])
    expect(res.levels.critBull[0]?.value).toBe(80)
    expect(res.levels.contBull[0]?.value).toBe(62)
    expect(res.levels.middle[0]?.value).toBe(50)
    expect(res.levels.contBear[0]?.value).toBe(38)
    expect(res.levels.critBear[0]?.value).toBe(20)
  })

  test('divergence start/end times match bar times', () => {
    const res = calculateRsiDivergences(smooth, { tolBars: 4 })
    for (const d of res.divergences) {
      expect(d.startTime).toBe(smooth[d.startIndex]!.time)
      expect(d.endTime).toBe(smooth[d.endIndex]!.time)
      expect(d.endIndex).toBeGreaterThan(d.startIndex)
    }
  })

  test('empty input', () => {
    expect(calculateRsiDivergences([])).toEqual({
      rsiSeries: [],
      levels: { critBull: [], contBull: [], middle: [], contBear: [], critBear: [] },
      divergences: [],
      reverseLevels: [],
    })
  })
})
