'use client'

import { Suspense, useState } from 'react'
import { Watchlist } from "./watchlist"

function WatchlistContent() {
  const [viewMode, setViewMode] = useState<'grid' | 'chart'>('grid')
  const [activeTimeScale, setActiveTimeScale] = useState<string>('7d')

  // Handle view mode changes from the WatchlistsGrid tabs
  const handleViewModeChange = (mode: 'grid' | 'chart') => {
    setViewMode(mode)
  }

  // Convert grid/chart mode to comparison/watchlist mode for the main content
  const mainViewMode = viewMode === 'chart' ? 'comparison' : 'watchlist'

  return (
    <div className="w-full px-4">      
      <Watchlist 
        viewMode={mainViewMode}
        activeTimeScale={activeTimeScale}
        onTimeScaleChange={setActiveTimeScale}
        gridViewMode={viewMode}
        onGridViewModeChange={handleViewModeChange}
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