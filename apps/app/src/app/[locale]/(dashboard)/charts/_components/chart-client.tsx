'use client'

import { Suspense } from 'react'
// import { MultiPriceChartLightweight } from "./multi-line-lightweight"
import { ChartTable } from "./chart-table"
import { useOptimizedChartsData } from '@/hooks/use-optimized-charts-data'
import { Spinner } from "@v1/ui/spinner"

function ChartsContent() {
  const { 
    optimisticCoins, 
    activeTimeScale, 
    isInitialized, 
    hasWatchlistItems,
    selectedGroup,
  } = useOptimizedChartsData()

  if (isInitialized && !hasWatchlistItems) {
    return (
      <div className="space-y-6 w-full z-0 p-8">
        {/* Selected Group Header */}
        {selectedGroup && (
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold">Charts: {selectedGroup.name}</h2>
              {selectedGroup.description && (
                <p className="text-sm text-muted-foreground">{selectedGroup.description}</p>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              0 coins
            </div>
          </div>
        )}
        
        <div className="flex flex-col items-center justify-center py-12">
          <div className="text-center">
            <h3 className="text-lg font-medium mb-2">
              {selectedGroup ? `No coins in ${selectedGroup.name}` : 'No coins in watchlist'}
            </h3>
            <p className="text-muted-foreground mb-4">
              {selectedGroup 
                ? `Add some coins to ${selectedGroup.name} to see charts`
                : 'Add some coins to your watchlist to see charts'
              }
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 w-full z-0 p-8">      
      <div className="space-y-14">
        {/* Temporarily disabled chart during CoinGecko migration */}
        {/* <MultiPriceChartLightweight 
          coins={optimisticCoins} 
          activeTimeScale={activeTimeScale}
          setActiveTimeScale={setActiveTimeScale}
        /> */}
        <div className="text-center py-8 text-muted-foreground">
          Chart temporarily disabled during CoinGecko migration
        </div>
        <ChartTable 
          coins={optimisticCoins} 
          activeTimeScale={activeTimeScale}
        />
      </div>
    </div>
  )
}

export function ChartsClient() {
  return (
    <Suspense fallback={
      <div className="space-y-6 w-full z-0 p-8">
        <div className="space-y-14">
          <div className="grid grid-cols-12 gap-0 rounded-[13px] bg-zinc-950/50 border border-zinc-800/20 overflow-hidden p-1">
            <div className="flex flex-col col-span-3 p-6 pt-2 space-y-2" />
            <div className="col-span-9 border border-zinc-800/30 rounded-[13px] overflow-hidden">
              <div className="h-[400px] flex items-center justify-center">
                <Spinner size={24} />
              </div>
            </div>
          </div>
        </div>
      </div>
    }>
      <ChartsContent />
    </Suspense>
  )
}