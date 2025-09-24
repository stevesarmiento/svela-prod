'use client'

import { useMemo, useState } from 'react'
import { Button } from "@v1/ui/button"
import { X } from "lucide-react"
import Link from "next/link"
import { cn } from "@v1/ui/cn"
import { toast } from "@v1/ui/use-toast"
import { Skeleton } from "@v1/ui/skeleton"
import { Spinner } from "@v1/ui/spinner"
import { WatchlistGroupIcon } from '@/components/watchlist-group-icon'
import { AvatarCircles } from '@v1/ui/token-stacks'
import { useWatchlistGroups, useDeleteWatchlistGroup, useWatchlistByGroup } from '@v1/convex/hooks'
import { useCoinGeckoWatchlistCoins } from '@/hooks/use-coingecko-watchlist-coins'
import { useCoinGeckoWatchlistAggregateChartIsolated } from '@/hooks/use-coingecko-watchlist-aggregate-chart-isolated'

interface WatchlistData {
  id: string
  name: string
  icon?: string
  coinsCount: number
  aggregateChange: number
  totalMarketCap: number
  totalVolume: number
  coinImages: Array<{ imageUrl: string; profileUrl: string }>
  isLoading?: boolean
}

interface WatchlistTableProps {
  activeTimeScale: string
}

// ✅ IMPROVED: Convert to custom hook that returns data instead of using callback pattern
function useWatchlistData(groupId: string): WatchlistData | null {
  // Get watchlist coins for this group
  const groupWatchlist = useWatchlistByGroup(groupId)
  
  // Transform to array of CoinGecko string IDs
  const coinIds = useMemo(() => {
    if (!groupWatchlist || !Array.isArray(groupWatchlist)) return []
    return groupWatchlist.map(item => item.coinId)
  }, [groupWatchlist])
  
  // Get coin data using CoinGecko
  const { data: coins } = useCoinGeckoWatchlistCoins(coinIds)
  
  // Get aggregate chart data using isolated CoinGecko hook
  const { aggregateData } = useCoinGeckoWatchlistAggregateChartIsolated({
    coins: coins || []
  })

  // ✅ IMPROVED: Calculate data with useMemo instead of useEffect + callback
  const watchlistData = useMemo((): WatchlistData | null => {
    if (!coins?.length) {
      return null
    }

    // Calculate aggregates from coin data
    const totalMarketCap = coins.reduce((sum, coin) => sum + (coin.quote.USD.market_cap || 0), 0)
    const totalVolume = coins.reduce((sum, coin) => sum + (coin.quote.USD.volume_24h || 0), 0)
    const latestChange = aggregateData?.[aggregateData.length - 1]?.value || 0

    // Create coin images array for token stacks
    const coinImages = (coins || [])
      .filter(coin => coin.image && (coin.image.startsWith('http') || coin.image.startsWith('/')))
      .slice(0, 5) // Limit to first 5 coins
      .map(coin => ({
        imageUrl: coin.image,
        profileUrl: `/charts/${coin.id}`
      }))

    return {
      id: groupId,
      name: '', // Will be set by parent component
      coinsCount: coins.length,
      aggregateChange: latestChange,
      totalMarketCap,
      totalVolume,
      coinImages,
      isLoading: false
    }
  }, [groupId, coins, aggregateData])

  return watchlistData
}

// ✅ IMPROVED: Component that uses the custom hook for individual watchlist cards
function WatchlistCard({ 
  group, 
  activeTimeScale,
  onRemove,
  isRemoving 
}: { 
  group: { _id: string; name: string; icon?: string; slug: string }
  activeTimeScale: string
  onRemove: (groupId: string) => void
  isRemoving: boolean
}) {
  // Use our custom hook to get watchlist data
  const watchlistData = useWatchlistData(group._id)
  
  // Combine group metadata with fetched data
  const watchlist = useMemo(() => {
    if (watchlistData) {
      return {
        ...watchlistData,
        name: group.name,
        icon: group.icon
      }
    }
    return {
      id: group._id,
      name: group.name,
      icon: group.icon,
      coinsCount: 0,
      aggregateChange: 0,
      totalMarketCap: 0,
      totalVolume: 0,
      coinImages: [],
      isLoading: true
    }
  }, [watchlistData, group])

  const getTimeScaleLabel = (scale: string) => {
    switch (scale) {
      case '1d': return '1D'
      case '7d': return '1W'
      case '30d': return '1M'
      case 'max': return '1Y'
      case '2y': return '2Y'
      default: return scale.toUpperCase()
    }
  }

  return (
    <div className="rounded-[10px] bg-primary/5 p-0.5">
      {/* Header with Watchlist Name */}
      <div className="px-3 py-2">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <WatchlistGroupIcon 
                icon={watchlist.icon} 
                className="w-4 h-4 text-muted-foreground/70"
                size={16}
              />
              <span className="text-muted-foreground/70">
                {watchlist.isLoading ? "Loading..." : watchlist.name}
              </span>
            </div>

            <div className="flex items-center gap-1 justify-end">
              {getTimeScaleLabel(activeTimeScale)} Change
            </div>
            <div className="flex items-center justify-end gap-1">
              Action
            </div>
          </div>
        </div>
      </div>

      {/* Table Body */}
      <div className="bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm overflow-hidden">
        {watchlist.isLoading ? (
          // Show loading state
          <div className="grid grid-cols-3 gap-4 px-4 py-2 pr-2 opacity-60">
            {/* Watchlist Name */}
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-16 rounded-full" />
              <span className="text-primary/40 text-xs">watchlist has</span>
              <Skeleton className="h-3 w-8 rounded-full" />
              <span className="text-primary/40 text-xs">coins</span>
            </div>

            {/* Change */}
            <div className="flex items-center justify-end">
              <Skeleton className="h-3 w-10 rounded-full" />
            </div>

            {/* Remove */}
            <div className="flex items-center justify-end">
              <Button
                variant="ghost"
                size="sm"
                disabled
                className="h-6 w-6 p-0 rounded-lg bg-transparent opacity-50"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
        ) : (
          // Show clickable link for real watchlists
          <Link 
            href={`/watchlist?wg=${watchlist.id}`}
            className="grid grid-cols-3 gap-4 px-4 py-2 pr-2 hover:bg-primary/[0.02] transition-colors duration-200 cursor-pointer"
          >
            {/* Watchlist Info */}
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs">{watchlist.name}</span>
              <span className="text-primary/40 text-xs">watchlist has</span>
              <span className="font-mono text-xs font-semibold bg-primary/5 border border-primary/10 px-1.5 py-0.5 rounded-md">
                {watchlist.coinsCount}
              </span>
              <span className="text-primary/40 text-xs">{watchlist.coinsCount === 1 ? 'token' : 'tokens'}</span>
              {!watchlist.isLoading && watchlist.coinImages.length > 0 && (
                <AvatarCircles 
                  avatarUrls={watchlist.coinImages}
                  numPeople={Math.max(0, watchlist.coinsCount - watchlist.coinImages.length)}
                  className="scale-75 -ml-1"
                />
              )}
            </div>

            {/* Aggregate Change */}
            <div className="flex items-center justify-end">
              <span className={cn(
                "font-mono text-xs",
                watchlist.aggregateChange > 0 ? 'text-green-600' : 'text-red-600'
              )}>
                {watchlist.aggregateChange > 0 ? '+' : ''}{watchlist.aggregateChange.toFixed(2)}%
              </span>
            </div>

            {/* Remove */}
            <div 
              className="flex items-center justify-end"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onRemove(watchlist.id)
                }}
                disabled={isRemoving}
                className="h-6 w-6 p-0 rounded-lg bg-transparent hover:bg-rose-500/10 transition-colors group"
              >
                {isRemoving ? (
                  <Spinner size={16} />
                ) : (
                  <X className="h-4 w-4 text-muted-foreground group-hover:text-rose-500 transition-colors" />
                )}
              </Button>
            </div>
          </Link>
        )}
      </div>
    </div>
  )
}

export function WatchlistTable({ activeTimeScale }: WatchlistTableProps) {
  const deleteWatchlistGroup = useDeleteWatchlistGroup()
  const [removingWatchlists, setRemovingWatchlists] = useState<Set<string>>(new Set())
  
  const watchlistGroupsData = useWatchlistGroups()

  const handleRemove = async (watchlistId: string) => {
    setRemovingWatchlists(prev => new Set([...prev, watchlistId]))
    
    try {
      await deleteWatchlistGroup(watchlistId)
      toast({
        title: "Removed",
        description: "Watchlist removed successfully",
      })
    } catch {
      toast({
        title: "Error",
        description: "Failed to remove watchlist",
        variant: "destructive",
      })
    } finally {
      setRemovingWatchlists(prev => {
        const newSet = new Set(prev)
        newSet.delete(watchlistId)
        return newSet
      })
    }
  }

  if (!watchlistGroupsData?.length) {
    return (
      <div className="py-6 border border-dashed border-border rounded-lg">
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="text-center">
            <h3 className="font-medium">No watchlists found</h3>
            <p className="text-sm text-muted-foreground">Create a watchlist to get started</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {watchlistGroupsData.map(group => (
        <WatchlistCard
          key={group._id}
          group={group}
          activeTimeScale={activeTimeScale}
          onRemove={handleRemove}
          isRemoving={removingWatchlists.has(group._id)}
        />
      ))}
    </div>
  )
}