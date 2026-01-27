'use client'

import { Suspense, useState } from 'react'
import { Watchlist } from "./watchlist"

function WatchlistContent() {
  const [viewMode, setViewMode] = useState<'grid' | 'chart'>('grid')
  const [activeTimeScale, setActiveTimeScale] = useState<string>('7d')
  const [contentMode, setContentMode] = useState<'cards' | 'table'>('cards')

  // Handle view mode changes from the WatchlistsGrid tabs
  const handleViewModeChange = (mode: 'grid' | 'chart') => {
    setViewMode(mode)
  }

  // Handle content mode changes (cards vs table)
  const handleContentModeChange = (mode: 'cards' | 'table') => {
    setContentMode(mode)
  }

  return (
    <div className="w-full px-4">
      <Watchlist
        activeTimeScale={activeTimeScale}
        onTimeScaleChange={setActiveTimeScale}
        gridViewMode={viewMode}
        onGridViewModeChange={handleViewModeChange}
        contentMode={contentMode}
        onContentModeChange={handleContentModeChange}
        onInlineChartError={() => {
          setContentMode('cards')
        }}
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