'use client'

export interface ChartScrubState {
  epochSeconds: number | null
  sourceId: string | null
}

type ScrubListener = () => void

const listeners = new Set<ScrubListener>()

let scrubState: ChartScrubState = { epochSeconds: null, sourceId: null }
let rafId: number | null = null

function notifyListeners(): void {
  if (rafId) return

  rafId = requestAnimationFrame(() => {
    rafId = null
    for (const listener of listeners) listener()
  })
}

export function getChartScrubSnapshot(): ChartScrubState {
  return scrubState
}

export function setChartScrub(epochSeconds: number | null, sourceId: string | null): void {
  const next: ChartScrubState = { epochSeconds, sourceId }
  if (next.epochSeconds === scrubState.epochSeconds && next.sourceId === scrubState.sourceId) return

  scrubState = next
  notifyListeners()
}

export function clearChartScrub(): void {
  setChartScrub(null, null)
}

export function subscribeToChartScrub(listener: ScrubListener): () => void {
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

