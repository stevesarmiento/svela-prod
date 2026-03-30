'use client'

import { useState } from 'react'
import { Watchlist } from "../../watchlist/_components/watchlist"

export function ScreenerClient() {
  const [activeTimeScale, setActiveTimeScale] = useState<string>('7d')

  return (
    <div className="w-full">
      <Watchlist
        activeTimeScale={activeTimeScale}
        onTimeScaleChange={setActiveTimeScale}
        gridViewMode="grid"
        onGridViewModeChange={() => {}}
        contentMode="table"
        onContentModeChange={() => {}}
        showContentModeToggle={false}
        enableContentModeShortcuts={false}
        headerVariant="screener"
        enableQuickActions={false}
      />
    </div>
  )
}

