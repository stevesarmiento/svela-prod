'use client'

export interface VmcDivsResult {
  // True at the confirmation bar (pivotIndex + 2).
  fractalTop: boolean[]
  fractalBot: boolean[]

  // Previous pivot values (aligned to confirmation bar), matching Pine's `valuewhen(...)[2]` semantics.
  prevTopPivotIndex: Array<number | null>
  prevTopSrc: number[]
  prevTopPriceHigh: number[]
  prevBotPivotIndex: Array<number | null>
  prevBotSrc: number[]
  prevBotPriceLow: number[]

  // Regular divergences (aligned to confirmation bar).
  bearDiv: boolean[]
  bullDiv: boolean[]

  // Hidden divergences (aligned to confirmation bar).
  bearHidden: boolean[]
  bullHidden: boolean[]
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function topFractalAtPivot(src: number[], pivotIndex: number): boolean {
  const s0 = src[pivotIndex - 2]
  const s1 = src[pivotIndex - 1]
  const s2 = src[pivotIndex]
  const s3 = src[pivotIndex + 1]
  const s4 = src[pivotIndex + 2]
  if (!isFiniteNumber(s0) || !isFiniteNumber(s1) || !isFiniteNumber(s2) || !isFiniteNumber(s3) || !isFiniteNumber(s4)) return false
  return s0 < s2 && s1 < s2 && s2 > s3 && s2 > s4
}

function botFractalAtPivot(src: number[], pivotIndex: number): boolean {
  const s0 = src[pivotIndex - 2]
  const s1 = src[pivotIndex - 1]
  const s2 = src[pivotIndex]
  const s3 = src[pivotIndex + 1]
  const s4 = src[pivotIndex + 2]
  if (!isFiniteNumber(s0) || !isFiniteNumber(s1) || !isFiniteNumber(s2) || !isFiniteNumber(s3) || !isFiniteNumber(s4)) return false
  return s0 > s2 && s1 > s2 && s2 < s3 && s2 < s4
}

export function findVmcDivs(
  src: number[],
  priceHigh: number[],
  priceLow: number[],
  topLimit: number,
  botLimit: number,
  useLimits: boolean,
): VmcDivsResult {
  const n = Math.max(src.length, priceHigh.length, priceLow.length)

  const fractalTop: boolean[] = new Array(n).fill(false)
  const fractalBot: boolean[] = new Array(n).fill(false)

  const prevTopPivotIndex: Array<number | null> = new Array(n).fill(null)
  const prevTopSrc: number[] = new Array(n).fill(Number.NaN)
  const prevTopPriceHigh: number[] = new Array(n).fill(Number.NaN)
  const prevBotPivotIndex: Array<number | null> = new Array(n).fill(null)
  const prevBotSrc: number[] = new Array(n).fill(Number.NaN)
  const prevBotPriceLow: number[] = new Array(n).fill(Number.NaN)

  const bearDiv: boolean[] = new Array(n).fill(false)
  const bullDiv: boolean[] = new Array(n).fill(false)
  const bearHidden: boolean[] = new Array(n).fill(false)
  const bullHidden: boolean[] = new Array(n).fill(false)

  let lastTopPivotIndex: number | null = null
  let lastBotPivotIndex: number | null = null

  // Pivot needs 2 bars on each side: [pivot-2 .. pivot+2].
  for (let pivotIndex = 2; pivotIndex < n - 2; pivotIndex++) {
    const confirmIndex = pivotIndex + 2
    const srcAtPivot = src[pivotIndex]
    if (!isFiniteNumber(srcAtPivot)) continue

    // Top pivots
    if (topFractalAtPivot(src, pivotIndex) && (!useLimits || srcAtPivot >= topLimit)) {
      fractalTop[confirmIndex] = true

      if (lastTopPivotIndex != null) {
        prevTopPivotIndex[confirmIndex] = lastTopPivotIndex
        const prevSrc = src[lastTopPivotIndex]
        const prevHigh = priceHigh[lastTopPivotIndex]
        if (isFiniteNumber(prevSrc)) prevTopSrc[confirmIndex] = prevSrc
        if (isFiniteNumber(prevHigh)) prevTopPriceHigh[confirmIndex] = prevHigh

        const curHigh = priceHigh[pivotIndex]
        if (isFiniteNumber(curHigh) && isFiniteNumber(prevHigh) && isFiniteNumber(prevSrc)) {
          bearDiv[confirmIndex] = curHigh > prevHigh && srcAtPivot < prevSrc
          bearHidden[confirmIndex] = curHigh < prevHigh && srcAtPivot > prevSrc
        }
      }

      lastTopPivotIndex = pivotIndex
    }

    // Bottom pivots
    if (botFractalAtPivot(src, pivotIndex) && (!useLimits || srcAtPivot <= botLimit)) {
      fractalBot[confirmIndex] = true

      if (lastBotPivotIndex != null) {
        prevBotPivotIndex[confirmIndex] = lastBotPivotIndex
        const prevSrc = src[lastBotPivotIndex]
        const prevLow = priceLow[lastBotPivotIndex]
        if (isFiniteNumber(prevSrc)) prevBotSrc[confirmIndex] = prevSrc
        if (isFiniteNumber(prevLow)) prevBotPriceLow[confirmIndex] = prevLow

        const curLow = priceLow[pivotIndex]
        if (isFiniteNumber(curLow) && isFiniteNumber(prevLow) && isFiniteNumber(prevSrc)) {
          bullDiv[confirmIndex] = curLow < prevLow && srcAtPivot > prevSrc
          bullHidden[confirmIndex] = curLow > prevLow && srcAtPivot < prevSrc
        }
      }

      lastBotPivotIndex = pivotIndex
    }
  }

  return {
    fractalTop,
    fractalBot,
    prevTopPivotIndex,
    prevTopSrc,
    prevTopPriceHigh,
    prevBotPivotIndex,
    prevBotSrc,
    prevBotPriceLow,
    bearDiv,
    bullDiv,
    bearHidden,
    bullHidden,
  }
}

