import { describe, expect, test } from 'bun:test'
import { nz, pineEma, pineHighest, pineLowest, pineRsi, pineSma } from './pine-math'

describe('pine-math', () => {
  test('nz replaces non-finite values', () => {
    expect(nz(5)).toBe(5)
    expect(nz(Number.NaN)).toBe(0)
    expect(nz(undefined, 7)).toBe(7)
    expect(nz(null, -1)).toBe(-1)
  })

  test('pineSma matches hand-computed values, NaN until warm', () => {
    const out = pineSma([1, 2, 3, 4, 5], 3)
    expect(Number.isNaN(out[0])).toBe(true)
    expect(Number.isNaN(out[1])).toBe(true)
    expect(out.slice(2)).toEqual([2, 3, 4])
  })

  test('pineSma propagates NaN through the window (Pine na semantics)', () => {
    const out = pineSma([1, Number.NaN, 3, 4, 5], 3)
    expect(Number.isNaN(out[2])).toBe(true) // window contains the NaN
    expect(Number.isNaN(out[3])).toBe(true)
    expect(out[4]).toBe(4)
  })

  test('pineEma seeds with SMA then recurses with alpha=2/(n+1)', () => {
    const out = pineEma([1, 2, 3, 4], 3)
    expect(out[2]).toBe(2) // SMA seed of first 3
    expect(out[3]).toBeCloseTo(2 + 0.5 * (4 - 2), 12) // alpha=0.5
  })

  test('pineHighest / pineLowest rolling extremes', () => {
    const values = [3, 1, 4, 1, 5, 9, 2]
    expect(pineHighest(values, 3).slice(2)).toEqual([4, 4, 5, 9, 9])
    expect(pineLowest(values, 3).slice(2)).toEqual([1, 1, 1, 1, 2])
  })

  test('pineRsi: monotonic rise → 100, fall → 0, warmup is NaN', () => {
    const up = pineRsi([1, 2, 3, 4, 5, 6, 7], 3)
    expect(Number.isNaN(up[2])).toBe(true)
    expect(up[3]).toBe(100)
    expect(up[6]).toBe(100)

    const down = pineRsi([7, 6, 5, 4, 3, 2, 1], 3)
    expect(down[6]).toBe(0)
  })

  test('pineRsi Wilder smoothing regression', () => {
    // Alternating series: gains and losses balance → RSI near 50.
    const rsi = pineRsi([10, 11, 10, 11, 10, 11, 10, 11, 10, 11], 4)
    const last = rsi[9]!
    expect(last).toBeGreaterThan(40)
    expect(last).toBeLessThan(60)
  })
})
