'use client'

// Shared visible-time-range pub/sub for the token page charts, mirroring
// chart-scrub-store: indicator charts publish their visible range (initial
// window + user pan/zoom) and the mini price chart follows, so it always shows
// the same time period the indicators are zoomed in on.

export interface ChartRangeState {
  fromEpochSeconds: number | null
  toEpochSeconds: number | null
  sourceId: string | null
}

type RangeListener = () => void

const listeners = new Set<RangeListener>()

let rangeState: ChartRangeState = { fromEpochSeconds: null, toEpochSeconds: null, sourceId: null }
let rafId: number | null = null

function notifyListeners(): void {
  if (rafId) return

  rafId = requestAnimationFrame(() => {
    rafId = null
    for (const listener of listeners) listener()
  })
}

export function getChartRangeSnapshot(): ChartRangeState {
  return rangeState
}

export function setChartRange(
  fromEpochSeconds: number | null,
  toEpochSeconds: number | null,
  sourceId: string | null,
): void {
  if (
    fromEpochSeconds === rangeState.fromEpochSeconds &&
    toEpochSeconds === rangeState.toEpochSeconds &&
    sourceId === rangeState.sourceId
  )
    return

  rangeState = { fromEpochSeconds, toEpochSeconds, sourceId }
  notifyListeners()
}

export function subscribeToChartRange(listener: RangeListener): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)

    if (listeners.size > 0) return

    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }
}
