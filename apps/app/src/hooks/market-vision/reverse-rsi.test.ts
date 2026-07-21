import { describe, expect, test } from 'bun:test'
import { calculateRsiDivergences } from './rsi-divergences'
import {
  DEFAULT_REVERSE_RSI_TARGETS,
  reverseRsiLevels,
  reverseRsiPrice,
  rsi,
  wilderRsiState,
} from './technical-indicators'
import { makeFixtureBars } from './test-fixtures'

function closesFromSeed(seed: number): number[] {
  return makeFixtureBars(400, seed).map((bar) => bar.close)
}

describe('reverseRsiPrice', () => {
  const seeds = [42, 7]
  const periods = [7, 14, 21]
  const targets = [80, 62, 50, 38, 20, 55.5, 12.3, 88]

  test('round-trip: feeding the reverse price back into rsi() prints the target', () => {
    for (const seed of seeds) {
      const closes = closesFromSeed(seed)
      for (const period of periods) {
        const state = wilderRsiState(closes, period)
        expect(state).not.toBeNull()
        if (!state) continue

        for (const target of targets) {
          const price = reverseRsiPrice(state, period, target)
          if (price == null) continue
          const forward = rsi([...closes, price], period)
          expect(forward[forward.length - 1]).toBeCloseTo(target, 6)
        }
      }
    }
  })

  test('all Caretaker zone targets are reachable on fixture data', () => {
    for (const seed of seeds) {
      const closes = closesFromSeed(seed)
      const state = wilderRsiState(closes, 14)
      expect(state).not.toBeNull()
      if (!state) continue
      for (const target of DEFAULT_REVERSE_RSI_TARGETS) {
        expect(reverseRsiPrice(state, 14, target)).not.toBeNull()
      }
    }
  })

  test('fixpoint: target = current RSI solves to the last close', () => {
    for (const seed of seeds) {
      const closes = closesFromSeed(seed)
      const currentRsi = rsi(closes, 14)[closes.length - 1]
      expect(currentRsi).toBeDefined()
      if (currentRsi == null || currentRsi <= 0 || currentRsi >= 100) continue

      const state = wilderRsiState(closes, 14)
      expect(state).not.toBeNull()
      if (!state) continue

      const price = reverseRsiPrice(state, 14, currentRsi)
      expect(price).not.toBeNull()
      expect(price ?? Number.NaN).toBeCloseTo(closes[closes.length - 1] ?? Number.NaN, 6)
    }
  })

  test('prices are monotonic in the target', () => {
    for (const seed of seeds) {
      const closes = closesFromSeed(seed)
      const state = wilderRsiState(closes, 14)
      if (!state) continue

      const prices = [80, 62, 50, 38, 20].map((target) => reverseRsiPrice(state, 14, target))
      for (let i = 1; i < prices.length; i++) {
        const higher = prices[i - 1]
        const lower = prices[i]
        if (higher == null || lower == null) continue
        expect(higher).toBeGreaterThanOrEqual(lower)
      }
    }
  })

  test('unreachable / degenerate targets return null', () => {
    const closes = closesFromSeed(42)
    const state = wilderRsiState(closes, 14)
    expect(state).not.toBeNull()
    if (!state) return

    expect(reverseRsiPrice(state, 14, 0)).toBeNull()
    expect(reverseRsiPrice(state, 14, 100)).toBeNull()
    expect(reverseRsiPrice(state, 14, -5)).toBeNull()
    expect(reverseRsiPrice(state, 14, 105)).toBeNull()
    expect(reverseRsiPrice(state, 14, Number.NaN)).toBeNull()
  })

  test('flat series (avgGain = avgLoss = 0) is not invertible', () => {
    const flat = new Array(50).fill(100)
    const state = wilderRsiState(flat, 14)
    expect(state).not.toBeNull()
    if (!state) return
    expect(state.avgGain).toBe(0)
    expect(state.avgLoss).toBe(0)
    expect(reverseRsiPrice(state, 14, 50)).toBeNull()
  })

  test('strictly rising series (avgLoss = 0, RSI pinned at 100) still solves downward', () => {
    const rising = Array.from({ length: 60 }, (_, i) => 100 + i)
    expect(rsi(rising, 14)[rising.length - 1]).toBe(100)

    const state = wilderRsiState(rising, 14)
    expect(state).not.toBeNull()
    if (!state) return

    const price = reverseRsiPrice(state, 14, 50)
    expect(price).not.toBeNull()
    if (price == null) return
    expect(price).toBeLessThan(rising[rising.length - 1] ?? Number.NaN)

    const forward = rsi([...rising, price], 14)
    expect(forward[forward.length - 1]).toBeCloseTo(50, 6)
  })

  test('solved price at or below zero returns null', () => {
    // Steady +1 gains on a low-priced series: reaching RSI 1 would require a
    // next-bar close far below zero.
    const rising = Array.from({ length: 20 }, (_, i) => 1 + i)
    const state = wilderRsiState(rising, 14)
    expect(state).not.toBeNull()
    if (!state) return
    expect(reverseRsiPrice(state, 14, 1)).toBeNull()
  })
})

describe('wilderRsiState', () => {
  test('null below period + 1 closes, defined at period + 1', () => {
    const closes = closesFromSeed(42)
    expect(wilderRsiState(closes.slice(0, 14), 14)).toBeNull()
    expect(wilderRsiState([], 14)).toBeNull()
    expect(wilderRsiState(closes.slice(0, 15), 14)).not.toBeNull()
  })

  test('invalid period returns null', () => {
    const closes = closesFromSeed(42)
    expect(wilderRsiState(closes, 0)).toBeNull()
    expect(wilderRsiState(closes, Number.NaN)).toBeNull()
  })
})

describe('reverseRsiLevels', () => {
  test('defaults to Caretaker zones in order', () => {
    const closes = closesFromSeed(42)
    const levels = reverseRsiLevels(closes, 14)
    expect(levels.map((level) => level.target)).toEqual([80, 62, 50, 38, 20])
    for (const level of levels) expect(level.price).not.toBeNull()
  })

  test('accepts arbitrary target lists and preserves order', () => {
    const closes = closesFromSeed(7)
    const levels = reverseRsiLevels(closes, 14, [90, 10, 33.3])
    expect(levels.map((level) => level.target)).toEqual([90, 10, 33.3])
  })

  test('short input yields null prices but keeps targets', () => {
    const levels = reverseRsiLevels([1, 2, 3], 14)
    expect(levels.map((level) => level.target)).toEqual([80, 62, 50, 38, 20])
    for (const level of levels) expect(level.price).toBeNull()
  })
})

describe('calculateRsiDivergences reverseLevels', () => {
  test('matches the standalone util on the same closes', () => {
    const bars = makeFixtureBars(400, 42)
    const closes = bars.map((bar) => bar.close)
    const result = calculateRsiDivergences(bars)
    expect(result.reverseLevels).toEqual(reverseRsiLevels(closes, 14))
  })

  test('respects a custom reverseTargets config', () => {
    const bars = makeFixtureBars(400, 7)
    const result = calculateRsiDivergences(bars, { reverseTargets: [70, 30] })
    expect(result.reverseLevels.map((level) => level.target)).toEqual([70, 30])
  })
})
