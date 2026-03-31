'use client'

import { Suspense, useState } from 'react'
import { WatchlistPageView } from "./watchlist-page-view"
import { parseAsStringLiteral, useQueryState } from "nuqs"

const watchlistTabValues = ["grid", "chart"] as const
const watchlistTabParser = parseAsStringLiteral(watchlistTabValues).withDefault("grid")

function WatchlistContent() {
  const [viewMode, setViewMode] = useQueryState("wt", watchlistTabParser)
  const [activeTimeScale, setActiveTimeScale] = useState<string>('7d')
  const [contentMode, setContentMode] = useState<'cards' | 'aggregate'>('cards')

  // Handle view mode changes from the WatchlistsGrid tabs
  const handleViewModeChange = (mode: 'grid' | 'chart') => {
    setViewMode(mode)
  }

  // Handle content mode changes (cards vs table)
  const handleContentModeChange = (mode: 'cards' | 'table' | 'aggregate') => {
    if (mode === 'table') {
      setContentMode('aggregate')
      return
    }
    setContentMode(mode)
  }

  return (
    <div className="w-full px-4">
      <WatchlistPageView
        activeTimeScale={activeTimeScale}
        onTimeScaleChange={setActiveTimeScale}
        gridViewMode={viewMode}
        onGridViewModeChange={handleViewModeChange}
        contentMode={contentMode}
        onContentModeChange={handleContentModeChange}
      />
    </div>
  )
}

export function WatchlistClient() {
  return (
    <Suspense fallback={<div>Loading watchlist...</div>}>
        <WatchlistContent />
    </Suspense>
  )
}