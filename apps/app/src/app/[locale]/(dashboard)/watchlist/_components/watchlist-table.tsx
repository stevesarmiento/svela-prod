'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from "@v1/ui/button"
import { X } from "lucide-react"
import Link from "next/link"
import { cn } from "@v1/ui/cn"
import { toast } from "@v1/ui/use-toast"
import { Skeleton } from "@v1/ui/skeleton"
import { Spinner } from "@v1/ui/spinner"
import { env } from "@/env.mjs"
import { WatchlistGroupIcon } from '@/components/watchlist-group-icon'
import { AvatarCircles } from '@v1/ui/token-stacks'
import { useWatchlistByGroup } from '@/lib/convex-hooks'
import { useCoinGeckoWatchlistCoins } from '@/hooks/use-coingecko-watchlist-coins'
import {
  useCoinGeckoWatchlistAggregateChartIsolated,
  getWatchlistAggregateRangeEndMs,
} from '@/hooks/use-coingecko-watchlist-aggregate-chart-isolated'
import { useDeleteWatchlistGroup } from '@/lib/convex-hooks'
import { useWatchlist, type WatchlistGroup } from './watchlist-context'
import { getTokenLogoURL } from '@/lib/logo-overrides'
import { formatUsdPrice } from '@/lib/format-usd'
import { IconTriangleFill } from "symbols-react"

type WatchlistGroupId = WatchlistGroup["_id"]

const isDebug = env.NODE_ENV === "development"

interface WatchlistData {
  id: WatchlistGroupId
  name: string
  icon?: string
  coinsCount: number
  aggregateChange: number
  /** True while market-chart aggregate is not ready (show skeleton unless quote estimate is shown). */
  aggregateChangeLoading: boolean
  /** Equal-weight quote % fallback when chart is loading or chart series empty. */
  aggregateChangeIsEstimate: boolean
  /** No chart aggregate for this interval (e.g. 2Y). */
  aggregateChangeUnavailable: boolean
  totalMarketCap: number
  totalVolume: number
  coinImages: Array<{ imageUrl: string; profileUrl: string }>
  /** Sum of holdings × spot USD for items with holdings set; null if none set. */
  holdingsValueUsd: number | null
  /** Count of watchlist rows with a holdings quantity set. */
  holdingsPositionsCount: number
  isLoading?: boolean
}

/** Coin row shape needed for equal-weight quote % fallback (matches useCoinGeckoWatchlistCoins). */
interface QuoteChangeCoin {
  quote: {
    USD: {
      percent_change_24h: number
      percent_change_7d?: number
      percent_change_30d?: number
    }
  }
}

function pickQuoteIntervalChange(coin: QuoteChangeCoin, timeScale: string): number | null {
  const u = coin.quote.USD
  switch (timeScale) {
    case '1d':
      return Number.isFinite(u.percent_change_24h) ? u.percent_change_24h : null
    case '7d': {
      const v = u.percent_change_7d ?? u.percent_change_24h
      return typeof v === 'number' && Number.isFinite(v) ? v : null
    }
    case '30d': {
      const v = u.percent_change_30d ?? u.percent_change_7d ?? u.percent_change_24h
      return typeof v === 'number' && Number.isFinite(v) ? v : null
    }
    case 'max': {
      const v = u.percent_change_30d ?? u.percent_change_7d ?? u.percent_change_24h
      return typeof v === 'number' && Number.isFinite(v) ? v : null
    }
    default:
      return Number.isFinite(u.percent_change_24h) ? u.percent_change_24h : null
  }
}

/** Fast equal-weight % from quote fields (approximates chart aggregate while charts load). */
function approximateEqualWeightQuoteChange(
  coins: QuoteChangeCoin[],
  timeScale: string,
): number | null {
  if (timeScale === '2y') return null
  const vals: number[] = []
  for (const c of coins) {
    const p = pickQuoteIntervalChange(c, timeScale)
    if (p !== null) vals.push(p)
  }
  if (vals.length === 0) return null
  return vals.reduce((s, x) => s + x, 0) / vals.length
}

interface WatchlistTableProps {
  activeTimeScale: string
}

// ✅ IMPROVED: Convert to custom hook that returns data instead of using callback pattern
function useWatchlistData(
  groupId: WatchlistGroupId,
  activeTimeScale: string,
  rangeEndTimeMs: number,
): WatchlistData | null {
  // Get watchlist coins for this group
  const groupWatchlist = useWatchlistByGroup(groupId)
  
  // Transform to array of CoinGecko string IDs
  const coinIds = useMemo(() => {
    if (!groupWatchlist || !Array.isArray(groupWatchlist)) return []
    return groupWatchlist.map(item => item.coinId)
  }, [groupWatchlist])
  
  // Get coin data using CoinGecko
  const { data: coins } = useCoinGeckoWatchlistCoins(coinIds)
  
  // Get aggregate chart data using isolated CoinGecko hook (time scale matches column header).
  const {
    aggregateData,
    isLoading: histLoading,
    isFetching: histFetching,
    isPlaceholderData: histPlaceholder,
    isChangeUnavailable,
  } = useCoinGeckoWatchlistAggregateChartIsolated({
    coins: coins || [],
    timeScale: activeTimeScale,
    rangeEndTimeMs,
  })

  const quoteEstimate = useMemo(
    () => approximateEqualWeightQuoteChange(coins ?? [], activeTimeScale),
    [coins, activeTimeScale],
  )

  // ✅ IMPROVED: Calculate data with useMemo instead of useEffect + callback
  const watchlistData = useMemo((): WatchlistData | null => {
    if (!coins?.length) {
      return null
    }

    const chartAggregateReady =
      !isChangeUnavailable &&
      !histPlaceholder &&
      aggregateData.length > 0

    const aggregateChangeLoading =
      !isChangeUnavailable &&
      coins.length > 0 &&
      !chartAggregateReady &&
      (histLoading || histFetching || histPlaceholder)

    let aggregateChange = 0
    let aggregateChangeIsEstimate = false

    if (isChangeUnavailable) {
      aggregateChange = 0
    } else if (chartAggregateReady) {
      aggregateChange = aggregateData[aggregateData.length - 1]?.value ?? 0
    } else if (quoteEstimate !== null) {
      aggregateChange = quoteEstimate
      aggregateChangeIsEstimate = true
    }

    // Spot USD by coin id (ignore invalid / loading placeholder prices)
    const priceUsdByCoinId = new Map<string, number>()
    for (const coin of coins) {
      const p = coin.quote?.USD?.price
      if (typeof p === "number" && Number.isFinite(p) && p > 0) {
        priceUsdByCoinId.set(coin.id, p)
      }
    }

    // Total notional for rows with holdings set (same idea as chart-table holdings badge)
    let holdingsPositionsCount = 0
    let holdingsNotionalSum = 0
    for (const item of groupWatchlist ?? []) {
      const qty = item.holdings
      if (typeof qty !== "number" || !Number.isFinite(qty) || qty < 0) continue
      holdingsPositionsCount += 1
      const priceUsd = priceUsdByCoinId.get(item.coinId)
      if (priceUsd !== undefined) holdingsNotionalSum += qty * priceUsd
    }
    const holdingsValueUsd = holdingsPositionsCount === 0 ? null : holdingsNotionalSum

    // Calculate aggregates from coin data
    const totalMarketCap = coins.reduce((sum, coin) => sum + (coin.quote.USD.market_cap || 0), 0)
    const totalVolume = coins.reduce((sum, coin) => sum + (coin.quote.USD.volume_24h || 0), 0)

    // Create coin images array for token stacks
    const coinImages = (coins || [])
      .slice()
      // Highest item first: pick avatars by 24h volume (descending).
      .sort((a, b) => (b.quote?.USD?.volume_24h ?? 0) - (a.quote?.USD?.volume_24h ?? 0))
      .map((coin) => {
        const logoUrl = getTokenLogoURL(coin.symbol, coin.image)
        if (!logoUrl) return null
        return { logoUrl, coinId: coin.id }
      })
      .filter((item): item is { logoUrl: string; coinId: string } => item !== null)
      .slice(0, 5) // Limit to first 5 coins
      .map((coin) => ({
        imageUrl: coin.logoUrl,
        profileUrl: `/charts/${coin.coinId}`
      }))

    return {
      id: groupId,
      name: '', // Will be set by parent component
      coinsCount: coins.length,
      aggregateChange,
      aggregateChangeLoading,
      aggregateChangeIsEstimate,
      aggregateChangeUnavailable: isChangeUnavailable,
      totalMarketCap,
      totalVolume,
      coinImages,
      holdingsValueUsd,
      holdingsPositionsCount,
      isLoading: false
    }
  }, [
    groupId,
    coins,
    aggregateData,
    groupWatchlist,
    isChangeUnavailable,
    histLoading,
    histFetching,
    histPlaceholder,
    quoteEstimate,
  ])

  return watchlistData
}

// ✅ IMPROVED: Component that uses the custom hook for individual watchlist cards
function WatchlistCard({ 
  group, 
  activeTimeScale,
  rangeEndTimeMs,
  onRemove,
  isRemoving,
  onHoldingsValueKnown,
}: { 
  group: WatchlistGroup
  activeTimeScale: string
  rangeEndTimeMs: number
  onRemove: (groupId: WatchlistGroupId) => void
  isRemoving: boolean
  /** Fired when quote/holdings data is ready so parent can sort rows by holdings value (desc). */
  onHoldingsValueKnown: (groupId: WatchlistGroupId, holdingsValueUsd: number | null) => void
}) {
  // Use our custom hook to get watchlist data
  const watchlistData = useWatchlistData(group._id, activeTimeScale, rangeEndTimeMs)

  useEffect(() => {
    if (watchlistData !== null) {
      onHoldingsValueKnown(group._id, watchlistData.holdingsValueUsd)
    }
  }, [group._id, watchlistData, onHoldingsValueKnown])
  
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
      aggregateChangeLoading: true,
      aggregateChangeIsEstimate: false,
      aggregateChangeUnavailable: false,
      totalMarketCap: 0,
      totalVolume: 0,
      coinImages: [],
      holdingsValueUsd: null,
      holdingsPositionsCount: 0,
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
      <div className="hidden px-3 py-2 sm:block">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          <div className="grid grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <WatchlistGroupIcon 
                icon={watchlist.icon} 
                className="size-4"
                size={16}
              />
              <span className="text-muted-foreground">
                {watchlist.isLoading ? "Loading..." : watchlist.name}
              </span>
            </div>

            <div className="flex items-center justify-end">
              Holdings Value
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
      <div className="bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm overflow-hidden hover:ring-2 hover:ring-zinc-200/30 transition-shadow duration-[var(--duration-micro)]">
        {watchlist.isLoading ? (
          // Show loading state
          <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-3 px-3 py-3 opacity-60 sm:grid-cols-4 sm:gap-4 sm:px-4 sm:py-2 sm:pr-2">
            {/* Watchlist Name */}
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:flex-nowrap">
              <Skeleton className="h-3 w-16 rounded-full" />
              <span className="text-primary/40 text-xs whitespace-nowrap">watchlist has</span>
              <Skeleton className="h-3 w-8 rounded-full" />
              <span className="text-primary/40 text-xs whitespace-nowrap">coins</span>
            </div>

            {/* Holdings Value */}
            <div className="col-start-1 row-start-2 flex min-w-0 flex-col gap-1 sm:col-start-auto sm:row-start-auto sm:flex-row sm:items-center sm:justify-end">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:hidden">
                Holdings
              </span>
              <Skeleton className="h-3 w-14 rounded-full" />
            </div>

            {/* Change */}
            <div className="col-start-2 row-start-2 flex min-w-0 flex-col items-end gap-1 sm:col-start-auto sm:row-start-auto sm:flex-row sm:items-center sm:justify-end">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:hidden">
                {getTimeScaleLabel(activeTimeScale)}
              </span>
              <Skeleton className="h-3 w-10 rounded-full" />
            </div>

            {/* Remove */}
            <div className="col-start-2 row-start-1 flex items-center justify-end sm:col-start-auto sm:row-start-auto">
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
            href={group.slug ? `/watchlist?wg=${encodeURIComponent(group.slug)}&wt=chart` : "/watchlist?wt=chart"}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-3 px-3 py-3 hover:bg-primary/[0.02] transition-colors duration-200 cursor-pointer sm:grid-cols-4 sm:gap-4 sm:px-4 sm:py-2 sm:pr-2"
          >
            {/* Watchlist Info */}
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:flex-nowrap">
              <span className="min-w-0 truncate font-bold text-xs sm:text-nowrap">{watchlist.name}</span>
              <span className="text-primary/40 text-nowrap text-xs">
                <span className="sm:hidden">has</span>
                <span className="hidden sm:inline">watchlist has</span>
              </span>
              <span className="font-berkeley-mono text-nowrap text-xs font-semibold bg-black/20 border border-primary/10 px-1 py-0.5 rounded-md">
                {watchlist.coinsCount}
              </span>
              <span className="text-primary/40 text-xs">{watchlist.coinsCount === 1 ? 'token' : 'tokens'}</span>
              {!watchlist.isLoading && watchlist.coinImages.length > 0 && (
                <AvatarCircles 
                  avatarUrls={watchlist.coinImages}
                  numPeople={Math.max(0, watchlist.coinsCount - watchlist.coinImages.length)}
                  className="-ml-1 scale-75"
                />
              )}
            </div>

            {/* Holdings Value (Σ holdings × spot USD when any holdings set) */}
            <div className="col-start-1 row-start-2 flex min-w-0 flex-col gap-1 sm:col-start-auto sm:row-start-auto sm:flex-row sm:items-center sm:justify-end">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:hidden">
                Holdings
              </span>
              {watchlist.holdingsValueUsd === null ? (
                <span className="font-berkeley-mono text-xs tabular-nums text-muted-foreground">—</span>
              ) : (
                <span className="font-berkeley-mono text-xs font-semibold tabular-nums">
                  {formatUsdPrice(watchlist.holdingsValueUsd)}
                </span>
              )}
            </div>

            {/* Aggregate Change (chart aggregate, or quote est. while loading / if chart empty) */}
            <div className="col-start-2 row-start-2 flex min-w-0 flex-col items-end gap-1 sm:col-start-auto sm:row-start-auto sm:flex-row sm:items-center sm:justify-end">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:hidden">
                {getTimeScaleLabel(activeTimeScale)}
              </span>
              {watchlist.aggregateChangeUnavailable ? (
                <span className="font-berkeley-mono text-xs tabular-nums text-muted-foreground">
                  N/A
                </span>
              ) : watchlist.aggregateChangeLoading &&
                !watchlist.aggregateChangeIsEstimate ? (
                <Skeleton className="h-3 w-10 rounded-full" />
              ) : (
                (() => {
                  const change = watchlist.aggregateChange
                  const isPositive = change > 0
                  const isNegative = change < 0
                  const isNeutral = !isPositive && !isNegative

                  return (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 font-berkeley-mono text-xs tabular-nums",
                        isPositive && "text-emerald-500",
                        isNegative && "text-rose-500",
                        isNeutral && "text-muted-foreground",
                      )}
                      title={
                        watchlist.aggregateChangeIsEstimate
                          ? "Approximate equal-weight % from quote data; refines when chart data loads."
                          : undefined
                      }
                    >
                      <IconTriangleFill
                        aria-hidden="true"
                        className={cn(
                          "size-2 shrink-0 mr-1",
                          isPositive && "fill-emerald-500",
                          isNegative && "fill-rose-500 rotate-180",
                          isNeutral && "fill-zinc-500/60",
                        )}
                      />
                      {(isNegative ? Math.abs(change) : change).toFixed(2)}%
                      {watchlist.aggregateChangeIsEstimate ? (
                        <span className="text-[10px] font-normal text-muted-foreground">
                          est.
                        </span>
                      ) : null}
                    </span>
                  )
                })()
              )}
            </div>

            {/* Remove */}
            <div className="col-start-2 row-start-1 flex items-center justify-end sm:col-start-auto sm:row-start-auto">
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
  const deleteGroup = useDeleteWatchlistGroup()
  const { watchlistGroups } = useWatchlist()
  const [removingWatchlists, setRemovingWatchlists] = useState<Set<WatchlistGroupId>>(
    new Set(),
  )
  /** Populated by each card when CoinGecko + Convex data is ready; used to sort by holdings value. */
  const [holdingsValueByGroupId, setHoldingsValueByGroupId] = useState<
    Map<WatchlistGroupId, number | null>
  >(() => new Map())

  const registerHoldingsValue = useCallback(
    (groupId: WatchlistGroupId, holdingsValueUsd: number | null) => {
      setHoldingsValueByGroupId((prev) => {
        if (prev.get(groupId) === holdingsValueUsd) return prev
        const next = new Map(prev)
        next.set(groupId, holdingsValueUsd)
        return next
      })
    },
    [],
  )
  
  const rangeEndTimeMs = useMemo(
    () => getWatchlistAggregateRangeEndMs(activeTimeScale),
    [activeTimeScale],
  )

  const sortedWatchlistGroups = useMemo((): WatchlistGroup[] => {
    if (watchlistGroups.length === 0) return []
    const groups = watchlistGroups.slice()
    groups.sort((a, b) => {
      const aReady = holdingsValueByGroupId.has(a._id)
      const bReady = holdingsValueByGroupId.has(b._id)
      if (aReady && !bReady) return -1
      if (!aReady && bReady) return 1
      if (!aReady && !bReady) return 0

      const aRaw = holdingsValueByGroupId.get(a._id)
      const bRaw = holdingsValueByGroupId.get(b._id)
      if (aRaw === undefined || bRaw === undefined) return 0
      const aScore = aRaw === null ? Number.NEGATIVE_INFINITY : aRaw
      const bScore = bRaw === null ? Number.NEGATIVE_INFINITY : bRaw
      if (bScore !== aScore) return bScore - aScore
      return 0
    })
    return groups
  }, [watchlistGroups, holdingsValueByGroupId])

  const handleRemove = async (watchlistId: WatchlistGroupId) => {
    setRemovingWatchlists(prev => new Set([...prev, watchlistId]))
    
    try {
      await deleteGroup(watchlistId)
        toast({
          title: "Removed",
          description: "Watchlist removed successfully",
        })
    } catch (error) {
      toast({
        title: "Request Error",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      })
      if (isDebug) console.error("Failed to remove watchlist:", error)
    }
    
    // Clean up removing state
    setRemovingWatchlists(prev => {
      const newSet = new Set(prev)
      newSet.delete(watchlistId)
      return newSet
    })
  }

  if (watchlistGroups.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      {sortedWatchlistGroups.map(group => (
        <WatchlistCard
          key={group._id}
          group={group}
          activeTimeScale={activeTimeScale}
          rangeEndTimeMs={rangeEndTimeMs}
          onRemove={handleRemove}
          isRemoving={removingWatchlists.has(group._id)}
          onHoldingsValueKnown={registerHoldingsValue}
        />
      ))}
    </div>
  )
}
