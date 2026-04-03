"use client"

import { create } from "zustand"

export type LiveSpotSource = "pyth" | "last-known"

export interface LiveSpotPrice {
  priceUsd: number
  updatedAtMs: number
  source: LiveSpotSource
}

interface LiveSpotState {
  byCoingeckoId: Record<string, LiveSpotPrice | undefined>
  setLiveSpot: (coingeckoId: string, spot: LiveSpotPrice) => void
  clearLiveSpot: (coingeckoId: string) => void
}

const useLiveSpotStore = create<LiveSpotState>((set) => ({
  byCoingeckoId: {},
  setLiveSpot: (coingeckoId, spot) =>
    set((state) => {
      const id = coingeckoId.trim()
      if (!id) return state
      const prev = state.byCoingeckoId[id]
      if (prev && prev.priceUsd === spot.priceUsd && prev.updatedAtMs === spot.updatedAtMs && prev.source === spot.source) {
        return state
      }
      return { byCoingeckoId: { ...state.byCoingeckoId, [id]: spot } }
    }),
  clearLiveSpot: (coingeckoId) =>
    set((state) => {
      const id = coingeckoId.trim()
      if (!id) return state
      if (!(id in state.byCoingeckoId)) return state
      const next = { ...state.byCoingeckoId }
      delete next[id]
      return { byCoingeckoId: next }
    }),
}))

export function setLiveSpotPrice(coingeckoId: string, spot: LiveSpotPrice): void {
  useLiveSpotStore.getState().setLiveSpot(coingeckoId, spot)
}

export function useLiveSpotPrice(coingeckoId: string): LiveSpotPrice | null {
  const id = coingeckoId.trim()
  return useLiveSpotStore((s) => (id ? s.byCoingeckoId[id] ?? null : null))
}

