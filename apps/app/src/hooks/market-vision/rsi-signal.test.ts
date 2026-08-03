import { describe, expect, test } from 'bun:test'
import { pivotHighAt, pivotLowAt } from './divergence-engine'
import { calculateRsiDivergences } from './rsi-divergences'
import { ema, rsi, sma } from './technical-indicators'
import { makeFixtureBars } from './test-fixtures'

const RSI_LENGTH = 14
const SIGNAL_PERIOD = 12

describe('signal line', () => {
  const bars = makeFixtureBars(400, 42)
  const closes = bars.map((bar) => bar.close)
  const rsiValues = rsi(closes, RSI_LENGTH)
  const validRsi = rsiValues.slice(RSI_LENGTH)

  test('EMA signal starts after the RSI warm-up and matches ema() of the valid RSI', () => {
    const result = calculateRsiDivergences(bars)
    const expected = ema(validRsi, SIGNAL_PERIOD)

    expect(result.signalSeries.length).toBe(400 - RSI_LENGTH)
    expect(result.signalSeries[0]?.time).toBe(bars[RSI_LENGTH]?.time ?? Number.NaN)
    for (let i = 0; i < result.signalSeries.length; i++) {
      expect(result.signalSeries[i]?.value).toBeCloseTo(expected[i] ?? Number.NaN, 10)
      expect(result.signalSeries[i]?.time).toBe(bars[RSI_LENGTH + i]?.time ?? Number.NaN)
    }
  })

  test('SMA signal additionally skips the sma() zero-fill warm-up', () => {
    const result = calculateRsiDivergences(bars, { signalType: 'SMA' })
    const expected = sma(validRsi, SIGNAL_PERIOD).slice(SIGNAL_PERIOD - 1)

    expect(result.signalSeries[0]?.time).toBe(bars[RSI_LENGTH + SIGNAL_PERIOD - 1]?.time ?? Number.NaN)
    expect(result.signalSeries.length).toBe(400 - RSI_LENGTH - (SIGNAL_PERIOD - 1))
    for (let i = 0; i < result.signalSeries.length; i++) {
      expect(result.signalSeries[i]?.value).toBeCloseTo(expected[i] ?? Number.NaN, 10)
    }
  })

  test('signalCurrent equals the last emitted signal point', () => {
    const result = calculateRsiDivergences(bars)
    expect(result.signalCurrent).toBe(result.signalSeries[result.signalSeries.length - 1]?.value ?? Number.NaN)
  })

  test('EMA signal-cross round-trip: appended price makes next RSI print the current signal', () => {
    for (const seed of [42, 7]) {
      const seedBars = makeFixtureBars(400, seed)
      const seedCloses = seedBars.map((bar) => bar.close)
      const result = calculateRsiDivergences(seedBars)

      expect(result.reverseSignalCross).not.toBeNull()
      if (result.reverseSignalCross == null || result.signalCurrent == null) continue

      const forward = rsi([...seedCloses, result.reverseSignalCross], RSI_LENGTH)
      expect(forward[forward.length - 1]).toBeCloseTo(result.signalCurrent, 6)
    }
  })

  test('SMA signal-cross round-trip: next RSI prints the mean of the last period-1 valid RSI values', () => {
    const result = calculateRsiDivergences(bars, { signalType: 'SMA' })
    expect(result.reverseSignalCross).not.toBeNull()
    if (result.reverseSignalCross == null) return

    const window = validRsi.slice(-(SIGNAL_PERIOD - 1))
    const target = window.reduce((sum, value) => sum + value, 0) / window.length
    const forward = rsi([...closes, result.reverseSignalCross], RSI_LENGTH)
    expect(forward[forward.length - 1]).toBeCloseTo(target, 6)
  })

  test('short input yields empty signal and null cross', () => {
    const result = calculateRsiDivergences(bars.slice(0, RSI_LENGTH))
    expect(result.signalSeries).toEqual([])
    expect(result.signalCurrent).toBeNull()
    expect(result.reverseSignalCross).toBeNull()
  })
})

// Independent strict-fractal reimplementation (does not use divergence-engine).
function naivePivots(values: number[], leftBars: number, rightBars: number): Array<{ index: number; value: number; kind: 'high' | 'low' }> {
  const out: Array<{ index: number; value: number; kind: 'high' | 'low' }> = []
  for (let p = leftBars; p < values.length - rightBars; p++) {
    const v = values[p]
    if (v == null || !Number.isFinite(v)) continue
    let isHigh = true
    let isLow = true
    for (let j = p - leftBars; j <= p + rightBars; j++) {
      if (j === p) continue
      const w = values[j]
      if (w == null || !Number.isFinite(w)) {
        isHigh = false
        isLow = false
        break
      }
      if (w >= v) isHigh = false
      if (w <= v) isLow = false
    }
    if (isHigh) out.push({ index: p, value: v, kind: 'high' })
    if (isLow) out.push({ index: p, value: v, kind: 'low' })
  }
  return out
}

describe('rsi pivots', () => {
  test('pivots match an independent fractal reimplementation on fixtures', () => {
    for (const seed of [42, 7]) {
      const bars = makeFixtureBars(400, seed)
      const closes = bars.map((bar) => bar.close)
      const rsiValues = rsi(closes, RSI_LENGTH)
      const result = calculateRsiDivergences(bars)

      const expected = naivePivots(rsiValues, 5, 5).map((pivot) => ({
        ...pivot,
        time: bars[pivot.index]?.time ?? 0,
      }))
      const sortKey = (p: { index: number; kind: string }) => `${p.index}_${p.kind}`
      expect(result.pivots.length).toBeGreaterThan(0)
      expect([...result.pivots].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))).toEqual(
        expected
          .map(({ index, time, value, kind }) => ({ index, time, value, kind }))
          .sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
      )
    }
  })

  test('every fixture pivot re-confirms via the exported detectors', () => {
    const bars = makeFixtureBars(400, 42)
    const closes = bars.map((bar) => bar.close)
    const rsiValues = rsi(closes, RSI_LENGTH)
    const result = calculateRsiDivergences(bars)

    for (const pivot of result.pivots) {
      const confirmIndex = pivot.index + 5 // default rightBars
      const detected =
        pivot.kind === 'high'
          ? pivotHighAt(rsiValues, 5, 5, confirmIndex)
          : pivotLowAt(rsiValues, 5, 5, confirmIndex)
      expect(detected).toBe(pivot.value)
      expect(pivot.time).toBe(bars[pivot.index]?.time ?? Number.NaN)
    }
  })

  test('oscillating synthetic series yields alternating high/low pivots', () => {
    // Smooth sine wave — RSI forms distinct humps/dips off the 0/100 rails so
    // strict fractal pivots exist (a pure ramp pins RSI at 100 and yields none;
    // a constant-step zigzag converges RSI to a flat line and also yields none).
    const pattern = Array.from({ length: 80 }, (_, i) => 100 + 15 * Math.sin(i / 5) + i * 0.05)
    const bars = pattern.map((close, i) => ({
      time: 1_700_000_000 + i * 3600,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1000,
    }))

    const result = calculateRsiDivergences(bars, { leftBars: 2, rightBars: 2 })
    const kinds = new Set(result.pivots.map((p) => p.kind))
    expect(kinds.has('high')).toBe(true)
    expect(kinds.has('low')).toBe(true)

    const rsiValues = rsi(pattern, RSI_LENGTH)
    for (const pivot of result.pivots) {
      expect(pivot.time).toBe(bars[pivot.index]?.time ?? Number.NaN)
      expect(pivot.value).toBe(rsiValues[pivot.index] ?? Number.NaN)
    }
  })
})

describe('alert levels', () => {
  test('strictly rising series trips the high alert only', () => {
    const bars = Array.from({ length: 60 }, (_, i) => {
      const close = 100 + i
      return { time: 1_700_000_000 + i * 3600, open: close, high: close, low: close, close, volume: 1000 }
    })
    const result = calculateRsiDivergences(bars)
    expect(result.alerts).toEqual({ high: 85, low: 15, highOn: true, lowOn: false })
  })

  test('strictly falling series trips the low alert only', () => {
    const bars = Array.from({ length: 60 }, (_, i) => {
      const close = 200 - i
      return { time: 1_700_000_000 + i * 3600, open: close, high: close, low: close, close, volume: 1000 }
    })
    const result = calculateRsiDivergences(bars)
    expect(result.alerts).toEqual({ high: 85, low: 15, highOn: false, lowOn: true })
  })

  test('fixture with mid-range RSI trips neither', () => {
    const result = calculateRsiDivergences(makeFixtureBars(400, 42))
    expect(result.alerts.highOn).toBe(false)
    expect(result.alerts.lowOn).toBe(false)
  })

  test('short input never trips alerts despite warm-up RSI printing 100', () => {
    const bars = Array.from({ length: 10 }, (_, i) => {
      const close = 100 + i
      return { time: 1_700_000_000 + i * 3600, open: close, high: close, low: close, close, volume: 1000 }
    })
    const result = calculateRsiDivergences(bars)
    expect(result.alerts.highOn).toBe(false)
    expect(result.alerts.lowOn).toBe(false)
  })

  test('custom alert levels flow through config', () => {
    const result = calculateRsiDivergences(makeFixtureBars(400, 42), { alertHigh: 90, alertLow: 10 })
    expect(result.alerts.high).toBe(90)
    expect(result.alerts.low).toBe(10)
    expect(result.levels.alertHigh[0]?.value).toBe(90)
    expect(result.levels.alertLow[0]?.value).toBe(10)
  })
})
