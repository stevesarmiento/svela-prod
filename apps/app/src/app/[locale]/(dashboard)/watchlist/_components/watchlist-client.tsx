'use client'

import { Suspense } from 'react'
import { WatchlistProvider } from "./watchlist-context"
import { Watchlist } from "./watchlist"

function WatchlistContent() {
  return (
    <div className="w-full px-4">      
      <Watchlist />
    </div>
  )
}

export function WatchlistClient() {
  return (
    <Suspense fallback={<div>Loading watchlist...</div>}>
      <WatchlistProvider>
        <WatchlistContent />
      </WatchlistProvider>
    </Suspense>
  )
}