'use client'

import { WatchlistProvider } from "./watchlist-context"
import { CoinSearch } from "./coin-search"
import { Watchlist } from "./watchlist"

export function ChartsClient() {
  return (
    <WatchlistProvider>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Graphs</h1>
          <CoinSearch />
        </div>
        <Watchlist />
      </div>
    </WatchlistProvider>
  )
}