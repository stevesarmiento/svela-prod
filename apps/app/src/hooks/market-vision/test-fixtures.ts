// Deterministic OHLCV fixtures for market-vision tests.
// NOT imported by app code — test-only helper (kept out of *.test.ts so
// multiple suites can share the exact same bars).

import type { OHLCVDataPoint } from './market-vision-config'

/** Mulberry32 — tiny deterministic PRNG so fixtures never drift. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Synthetic hourly OHLCV series: trending random walk + two sine cycles so
 * price forms clear swing highs/lows (and therefore pivots + divergences).
 */
export function makeFixtureBars(count = 400, seed = 42): OHLCVDataPoint[] {
  const rand = mulberry32(seed)
  const bars: OHLCVDataPoint[] = []

  const t0 = 1_700_000_000 // fixed epoch anchor (bucket-aligned enough for tests)
  const barSeconds = 3600

  let price = 100
  for (let i = 0; i < count; i++) {
    const wave = 8 * Math.sin(i / 12) + 4 * Math.sin(i / 5.3)
    const drift = i * 0.03
    const noise = (rand() - 0.5) * 2.2
    const close = 100 + wave + drift + noise

    const open = price
    const spread = 0.6 + rand() * 1.4
    const high = Math.max(open, close) + spread * rand()
    const low = Math.min(open, close) - spread * rand()

    bars.push({
      time: t0 + i * barSeconds,
      open,
      high,
      low,
      close,
      volume: 1000 + Math.floor(rand() * 500),
    })
    price = close
  }

  return bars
}
