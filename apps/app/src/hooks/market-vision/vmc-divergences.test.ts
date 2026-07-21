import { describe, expect, test } from 'bun:test'
import { findVmcDivs } from './vmc-divergences'

// Hand-built fixtures for the Pine fractal detector:
//   top fractal at pivot p:  src[p-2] < src[p], src[p-1] < src[p], src[p] > src[p+1], src[p] > src[p+2]
//   confirmation lands at p + 2 (Pine's `fractalize(...)` on offset [2]).

describe('findVmcDivs (Pine fractal parity)', () => {
  test('regular bearish divergence: higher price high, lower oscillator high', () => {
    // Oscillator tops at index 3 (80) and index 9 (70) — lower high.
    const src = [0, 40, 60, 80, 60, 40, 30, 50, 60, 70, 55, 40, 0]
    // Price tops at the same pivots: 110 then 120 — higher high.
    const high = [100, 101, 105, 110, 105, 101, 100, 103, 110, 120, 110, 103, 100]
    const low = high.map((h) => h - 2)

    const res = findVmcDivs(src, high, low, 0, 0, false)

    // Pivots confirm at pivot+2
    expect(res.fractalTop[5]).toBe(true)
    expect(res.fractalTop[11]).toBe(true)
    expect(res.bearDiv[11]).toBe(true)
    expect(res.bearHidden[11]).toBe(false)
    expect(res.prevTopPivotIndex[11]).toBe(3)
    expect(res.prevTopSrc[11]).toBe(80)
    expect(res.prevTopPriceHigh[11]).toBe(110)
  })

  test('regular bullish divergence: lower price low, higher oscillator low', () => {
    // Oscillator bottoms at 3 (-80) and 9 (-60) — higher low.
    const src = [0, -40, -60, -80, -60, -40, -30, -50, -55, -60, -50, -40, 0]
    // Price bottoms: 90 then 80 — lower low.
    const low = [100, 96, 93, 90, 93, 96, 100, 97, 90, 80, 90, 97, 100]
    const high = low.map((l) => l + 2)

    const res = findVmcDivs(src, high, low, 0, 0, false)

    expect(res.fractalBot[5]).toBe(true)
    expect(res.fractalBot[11]).toBe(true)
    expect(res.bullDiv[11]).toBe(true)
    expect(res.bullHidden[11]).toBe(false)
    expect(res.prevBotPivotIndex[11]).toBe(3)
    expect(res.prevBotSrc[11]).toBe(-80)
    expect(res.prevBotPriceLow[11]).toBe(90) // previous pivot's price low
  })

  test('hidden divergences are the mirrored comparisons', () => {
    // Bear hidden: LOWER price high + HIGHER oscillator high.
    const src = [0, 40, 60, 70, 60, 40, 30, 50, 60, 80, 55, 40, 0]
    const high = [100, 101, 105, 120, 105, 101, 100, 103, 106, 110, 106, 103, 100]
    const low = high.map((h) => h - 2)

    const res = findVmcDivs(src, high, low, 0, 0, false)
    expect(res.bearDiv[11]).toBe(false)
    expect(res.bearHidden[11]).toBe(true)
  })

  test('useLimits gates pivots by oscillator level (OB/OS filter)', () => {
    const src = [0, 40, 60, 80, 60, 40, 30, 50, 60, 70, 55, 40, 0]
    const high = [100, 101, 105, 110, 105, 101, 100, 103, 110, 120, 110, 103, 100]
    const low = high.map((h) => h - 2)

    // topLimit 75: second top (70) fails the filter → no fractal, no div.
    const gated = findVmcDivs(src, high, low, 75, -75, true)
    expect(gated.fractalTop[5]).toBe(true) // first top (80) passes
    expect(gated.fractalTop[11]).toBe(false)
    expect(gated.bearDiv[11]).toBe(false)

    // topLimit 45: both tops pass → divergence found again.
    const open = findVmcDivs(src, high, low, 45, -65, true)
    expect(open.bearDiv[11]).toBe(true)
  })

  test('no divergence when both series agree (higher high + higher osc)', () => {
    const src = [0, 40, 60, 70, 60, 40, 30, 50, 60, 80, 55, 40, 0]
    const high = [100, 101, 105, 110, 105, 101, 100, 103, 110, 120, 110, 103, 100]
    const low = high.map((h) => h - 2)

    const res = findVmcDivs(src, high, low, 0, 0, false)
    expect(res.bearDiv[11]).toBe(false)
    expect(res.bearHidden[11]).toBe(false)
    expect(res.fractalTop[11]).toBe(true) // pivot exists, just no divergence
  })

  test('NaN in the fractal window disqualifies the pivot', () => {
    const src = [0, 40, Number.NaN, 80, 60, 40, 30, 50, 60, 70, 55, 40, 0]
    const high = [100, 101, 105, 110, 105, 101, 100, 103, 110, 120, 110, 103, 100]
    const low = high.map((h) => h - 2)

    const res = findVmcDivs(src, high, low, 0, 0, false)
    expect(res.fractalTop[5]).toBe(false)
    // Second pivot has no previous pivot → no divergence either.
    expect(res.bearDiv[11]).toBe(false)
  })
})
