'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from "@v1/ui/badge"
import { ChevronDown } from "lucide-react"
import Link from "next/link"
import { cn } from "@v1/ui/cn"
import { Skeleton } from "@v1/ui/skeleton"
import { WatchlistGroupIcon } from '@/components/watchlist-group-icon'
import { COLOR_THEMES } from '@/components/color-picker'
import { AvatarCircles } from '@v1/ui/token-stacks'
import { Checkbox } from "@v1/ui/checkbox"
import { m } from "motion/react"
import { useWatchlistByGroup, useRemoveBulkFromWatchlist } from '@/lib/convex-hooks'
import {
  useWatchlistSelection,
  useBottomNavSelectionBridge,
  useSelectRevealTransition,
  SELECT_CELL_VARIANTS,
  SELECT_CHECKBOX_VARIANTS,
  SELECT_CONTENT_VARIANTS,
} from '@/hooks/use-watchlist-selection'
import { useAnalyzeSelection } from '@/hooks/use-analyze-selection'
import { useCoinGeckoWatchlistCoins } from '@/hooks/use-coingecko-watchlist-coins'
import {
  useCoinGeckoWatchlistAggregateChartIsolated,
  getWatchlistAggregateRangeEndMs,
} from '@/hooks/use-coingecko-watchlist-aggregate-chart-isolated'
import { useWatchlist, type WatchlistGroup } from './watchlist-context'
import { cleanTokenName, getTokenLogoURL } from '@/lib/logo-overrides'
import { TokenLogo } from '@/components/token-logo'
import { Liveline } from "liveline"
import { formatUsdPrice } from '@/lib/format-usd'
import { IconTriangleFill } from "symbols-react"

type WatchlistGroupId = WatchlistGroup["_id"]

/**
 * Selection key for a coin row. Coins can appear in multiple watchlists, so
 * rows are keyed per group; bulk removal splits keys back out per group.
 */
function makeRowKey(groupId: WatchlistGroupId, coinId: string): string {
  return `${groupId}:${coinId}`
}

function parseRowKey(key: string): { groupId: string; coinId: string } {
  const idx = key.indexOf(":")
  return { groupId: key.slice(0, idx), coinId: key.slice(idx + 1) }
}

/** Per-coin row shown in the expanded accordion panel. */
interface CoinRow {
  id: string
  name: string
  symbol: string
  imageUrl: string | null
  priceUsd: number | null
  /** % change matched to the active time scale (quote-based). */
  changePct: number | null
}

/** Same derivation as the screener table: infer the USD move from spot price + % change. */
function deriveUsdMoveFromPercentChange(args: {
  priceUsd: number
  percentChange: number
}): number | null {
  const { priceUsd, percentChange } = args

  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null
  if (!Number.isFinite(percentChange)) return null

  const ratio = percentChange / 100
  const denom = 1 + ratio
  if (!Number.isFinite(denom) || denom <= 0) return null

  const previousPrice = priceUsd / denom
  const deltaUsd = priceUsd - previousPrice
  return Number.isFinite(deltaUsd) ? deltaUsd : null
}

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
  /** Per-coin rows for the expanded accordion panel (market-cap desc). */
  coins: CoinRow[]
  /** Aggregate % series for the row's inline trend chart (unix-seconds time). */
  aggregateSeries: Array<{ time: number; value: number }>
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
  const { data: rawCoins } = useCoinGeckoWatchlistCoins(coinIds)

  // Stable reference while loading: `rawCoins || []` inline would create a new
  // array every render and re-trigger the aggregate hook's layout effect.
  const coins = useMemo(() => rawCoins ?? [], [rawCoins])

  // Get aggregate chart data using isolated CoinGecko hook (time scale matches column header).
  const {
    aggregateData,
    isLoading: histLoading,
    isFetching: histFetching,
    isPlaceholderData: histPlaceholder,
    isChangeUnavailable,
    changePctByCoinId,
  } = useCoinGeckoWatchlistAggregateChartIsolated({
    coins,
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
    const holdingsByCoinId = new Map<string, number>()
    for (const item of groupWatchlist ?? []) {
      const qty = item.holdings
      if (typeof qty !== "number" || !Number.isFinite(qty) || qty < 0) continue
      holdingsByCoinId.set(item.coinId, qty)
      holdingsPositionsCount += 1
      const priceUsd = priceUsdByCoinId.get(item.coinId)
      if (priceUsd !== undefined) holdingsNotionalSum += qty * priceUsd
    }
    const holdingsValueUsd = holdingsPositionsCount === 0 ? null : holdingsNotionalSum

    // Per-coin rows for the expanded accordion panel (market-cap desc)
    const coinRows: CoinRow[] = coins
      .slice()
      .sort((a, b) => (b.quote?.USD?.market_cap ?? 0) - (a.quote?.USD?.market_cap ?? 0))
      .map((coin) => {
        const priceUsd = priceUsdByCoinId.get(coin.id) ?? null
        return {
          id: coin.id,
          name: cleanTokenName(coin.name),
          symbol: coin.symbol,
          imageUrl: getTokenLogoURL(coin.symbol, coin.image) ?? null,
          priceUsd,
          // Chart-derived return over the exact interval (works for 1Y too);
          // quote-based estimate only while the chart series is still loading.
          changePct:
            changePctByCoinId[coin.id] ?? pickQuoteIntervalChange(coin, activeTimeScale),
        }
      })

    // Aggregate % series for the inline trend chart (Time → unix seconds).
    const aggregateSeries = chartAggregateReady
      ? aggregateData.map((p) => ({ time: Number(p.time), value: p.value }))
      : []

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
        profileUrl: `/watchlists/${coin.coinId}`
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
      coins: coinRows,
      aggregateSeries,
      isLoading: false
    }
  }, [
    groupId,
    coins,
    aggregateData,
    groupWatchlist,
    activeTimeScale,
    isChangeUnavailable,
    histLoading,
    histFetching,
    histPlaceholder,
    quoteEstimate,
    changePctByCoinId,
  ])

  return watchlistData
}

function getTimeScaleLabel(scale: string) {
  switch (scale) {
    case '1d': return '1D'
    case '7d': return '1W'
    case '30d': return '1M'
    case 'max': return '1Y'
    case '2y': return '2Y'
    default: return scale.toUpperCase()
  }
}

/**
 * Shared watchlist-row grid (sm+): wide name column so the pill + token stack
 * always fit, slim trailing column (just the expand/collapse chevron).
 */
const ROW_GRID_COLS_SM =
  "sm:grid-cols-[minmax(0,2fr)_1fr_1fr_32px]"

/** Shared grid template so the coins sub-table header and rows stay aligned. */
const COIN_GRID_CLASS =
  "grid grid-cols-[minmax(0,1.6fr)_1fr_1.2fr] items-center gap-3 px-3 sm:gap-4 sm:px-4"

/** Inline aggregate trend chart for a watchlist row (colored by interval change). */
function TrendSparkline({
  series,
  change,
  isLoading,
}: {
  series: Array<{ time: number; value: number }>
  change: number
  isLoading: boolean
}) {
  const windowSecs = useMemo(() => {
    if (series.length < 2) return 30
    const first = series[0]!.time
    const last = series[series.length - 1]!.time
    return Math.max(30, last - first)
  }, [series])

  const lastValue = series.length > 0 ? series[series.length - 1]!.value : 0
  const color =
    change > 0
      ? "oklch(0.7688 0.1687 161.95)" // emerald, matches inline price charts
      : change < 0
        ? "oklch(0.7022 0.1892 22.23)" // rose
        : "oklch(1 0 0 / 0.35)"

  return (
    <div className="pointer-events-none h-7 w-[224px] overflow-hidden">
      <Liveline
        data={series}
        value={lastValue}
        theme="dark"
        color={color}
        showValue={false}
        dot={false}
        lineWidth={1}
        window={windowSecs}
        grid={false}
        badge={false}
        fill={false}
        pulse={false}
        scrub={false}
        momentum={false}
        exaggerate
        loading={isLoading || series.length < 2}
        emptyText="No data"
        formatTime={() => ""}
        padding={{ top: 4, right: 0, bottom: 4, left: 0 }}
        className="size-full"
      />
    </div>
  )
}

// Memoized with a boolean `isSelected` (not the selection Set, whose identity
// changes on every toggle): a selection click re-renders only the rows whose
// visual state actually changed instead of every row in every group.
const CoinRowItem = memo(function CoinRowItem({
  coin,
  groupId,
  isSelected,
  hasSelectedCoins,
  onCoinSelect,
}: {
  coin: CoinRow
  groupId: WatchlistGroupId
  isSelected: boolean
  hasSelectedCoins: boolean
  onCoinSelect: (rowKey: string, selected: boolean) => void
}) {
  const change = coin.changePct
  const isPositive = typeof change === 'number' && change > 0
  const isNegative = typeof change === 'number' && change < 0
  const rowKey = makeRowKey(groupId, coin.id)
  const selectRevealTransition = useSelectRevealTransition()

  return (
    <Link
      href={`/watchlists/${encodeURIComponent(coin.id)}`}
      aria-selected={hasSelectedCoins ? isSelected : undefined}
      onClick={
        hasSelectedCoins
          ? (e) => {
              e.preventDefault()
              onCoinSelect(rowKey, !isSelected)
            }
          : undefined
      }
      className={cn(
        COIN_GRID_CLASS,
        "py-2 hover:rounded-[7px] hover:bg-primary/[0.04] hover:ring-2 hover:ring-inset hover:ring-zinc-200/30",
        "transition-opacity duration-200",
        hasSelectedCoins && !isSelected && "opacity-40",
      )}
    >
      {/* First cell — merged select + token, toggles selection on click */}
      {/* react-doctor-disable-next-line react-doctor/prefer-tag-over-role -- wraps a Radix checkbox button inside the row Link; a real button would nest interactive elements (invalid HTML) */}
      <div
        role="button"
        tabIndex={0}
        className="flex min-w-0 items-center"
        onClick={(e) => {
          e.preventDefault() // Always prevent navigation for first cell (selection mode)
          e.stopPropagation()

          // Let the checkbox handle its own toggling (avoid double-toggle).
          const target = e.target as HTMLElement
          if (target.closest('[data-watchlist-row-checkbox="true"]')) return

          onCoinSelect(rowKey, !isSelected)
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return
          e.preventDefault()
          e.stopPropagation()

          const target = e.target as HTMLElement
          if (target.closest('[data-watchlist-row-checkbox="true"]')) return

          onCoinSelect(rowKey, !isSelected)
        }}
      >
        <m.div
          className="relative flex h-full w-full min-w-0 items-center justify-start"
          // Ensure non-hovered rows animate when selection mode flips on/off.
          // Starting from "rest" prevents "jump-to-endstate" on remounts.
          variants={SELECT_CELL_VARIANTS}
          initial="rest"
          animate={hasSelectedCoins ? "revealed" : "rest"}
          whileHover={hasSelectedCoins ? undefined : "revealed"}
        >
          {/* Checkbox - stable DOM to avoid "jump" on select/deselect */}
          <m.div
            className="absolute left-0 z-10 px-1"
            variants={SELECT_CHECKBOX_VARIANTS}
            transition={selectRevealTransition}
          >
            <Checkbox
              data-watchlist-row-checkbox="true"
              checked={isSelected}
              tabIndex={hasSelectedCoins ? 0 : -1}
              onCheckedChange={(checked) => onCoinSelect(rowKey, checked === true)}
              aria-label={`Select ${coin.name}`}
            />
          </m.div>

          {/* Token content slides right to make room for the checkbox */}
          <m.div
            className="flex min-w-0 items-center gap-2"
            variants={SELECT_CONTENT_VARIANTS}
            transition={selectRevealTransition}
          >
            <TokenLogo
              src={coin.imageUrl}
              alt={coin.name}
              sizePx={16}
              fallbackText={coin.symbol}
              className="shrink-0 rounded-full ring-1 ring-zinc-200 dark:ring-black/80"
            />
            <span className="shrink-0 text-xs font-bold">{coin.symbol.toUpperCase()}</span>
            <span className="min-w-0 truncate font-berkeley-mono text-xs text-muted-foreground">{coin.name}</span>
          </m.div>
        </m.div>
      </div>

      {/* Price */}
      <div className="text-right font-berkeley-mono text-xs tabular-nums">
        {coin.priceUsd === null ? '—' : formatUsdPrice(coin.priceUsd)}
      </div>

      {/* Returns (matched to active time scale): USD move left, % in a badge — same as screener */}
      <div className="flex items-center justify-end">
        {change === null ? (
          <span className="font-berkeley-mono text-xs tabular-nums text-muted-foreground">N/A</span>
        ) : (
          (() => {
            const isNeutral = !isPositive && !isNegative
            const usdMove =
              coin.priceUsd !== null
                ? deriveUsdMoveFromPercentChange({
                    priceUsd: coin.priceUsd,
                    percentChange: change,
                  })
                : null
            const usdSign = isPositive ? "+" : isNegative ? "-" : ""

            return (
              <div className="inline-flex items-center justify-end gap-2">
                <span
                  className={cn(
                    "font-berkeley-mono text-[11px] tabular-nums",
                    isPositive && "text-emerald-400",
                    isNegative && "text-rose-400",
                    isNeutral && "text-muted-foreground",
                  )}
                >
                  {usdMove === null ? "—" : `${usdSign}${formatUsdPrice(Math.abs(usdMove))}`}
                </span>
                <Badge
                  variant={isPositive ? "success" : isNegative ? "destructive" : "outline"}
                  className={cn(
                    isNeutral && "border-zinc-200/60 text-muted-foreground dark:border-white/10",
                    "h-5 px-1.5 font-berkeley-mono text-[11px] tabular-nums gap-1",
                  )}
                >
                  <IconTriangleFill
                    aria-hidden="true"
                    className={cn(
                      "size-[4px] shrink-0 fill-current",
                      isNegative && "rotate-180",
                    )}
                  />
                  {Math.abs(change).toFixed(2)}%
                </Badge>
              </div>
            )
          })()
        )}
      </div>
    </Link>
  )
})

/** Placeholder trigger row shown while a watchlist's data is loading. */
function WatchlistRowSkeleton({ activeTimeScale }: { activeTimeScale: string }) {
  return (
    <div className={cn("grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-3 px-3 py-3 opacity-60 sm:gap-4 sm:px-4 sm:py-2 sm:pr-2", ROW_GRID_COLS_SM)}>
      {/* Watchlist name pill */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:flex-nowrap">
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>

      {/* Trend chart */}
      <div className="col-start-1 row-start-2 flex min-w-0 flex-col gap-1 sm:col-start-auto sm:row-start-auto sm:flex-row sm:items-center sm:justify-end">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:hidden">
          Trend
        </span>
        <TrendSparkline series={[]} change={0} isLoading />
      </div>

      {/* Change */}
      <div className="col-start-2 row-start-2 flex min-w-0 flex-col items-end gap-1 sm:col-start-auto sm:row-start-auto sm:flex-row sm:items-center sm:justify-end">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:hidden">
          {getTimeScaleLabel(activeTimeScale)}
        </span>
        <Skeleton className="h-3 w-10 rounded-full" />
      </div>

      {/* Expand/collapse indicator */}
      <div className="col-start-2 row-start-1 flex items-center justify-end sm:col-start-auto sm:row-start-auto">
        <ChevronDown className="size-4 shrink-0 -rotate-90 text-muted-foreground opacity-50" />
      </div>
    </div>
  )
}

/** Expanded accordion panel: the coins inside one watchlist. */
function WatchlistCoinsPanel({
  coins,
  coinsCount,
  isLoading,
  groupId,
  groupSlug,
  activeTimeScale,
  selectedCoins,
  hasSelectedCoins,
  onCoinSelect,
}: {
  coins: CoinRow[]
  coinsCount: number
  isLoading: boolean
  groupId: WatchlistGroupId
  groupSlug?: string
  activeTimeScale: string
  selectedCoins: Set<string>
  hasSelectedCoins: boolean
  onCoinSelect: (rowKey: string, selected: boolean) => void
}) {
  return (
    <div className="border-t border-primary/5 bg-primary/[0.02] dark:bg-black/10">
      {/* Sub-table header */}
      <div
        className={cn(
          COIN_GRID_CLASS,
          "py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
        )}
      >
        <div>Token</div>
        <div className="text-right">Price</div>
        <div className="text-right">{getTimeScaleLabel(activeTimeScale)} Returns</div>
      </div>

      <div className="divide-y divide-primary/5">
        {coins.length === 0 ? (
          // Loading / empty coins state
          <div className={cn(COIN_GRID_CLASS, "py-2")}>
            {isLoading || coinsCount > 0 ? (
              <>
                <div className="flex items-center gap-2">
                  <Skeleton className="size-4 rounded-full" />
                  <Skeleton className="h-3 w-20 rounded-full" />
                </div>
                <div className="flex justify-end"><Skeleton className="h-3 w-12 rounded-full" /></div>
                <div className="flex justify-end"><Skeleton className="h-3 w-10 rounded-full" /></div>
              </>
            ) : (
              <span className="col-span-full py-1 text-xs text-muted-foreground">
                No tokens in this watchlist yet
              </span>
            )}
          </div>
        ) : (
          coins.map((coin) => (
            <CoinRowItem
              key={coin.id}
              coin={coin}
              groupId={groupId}
              isSelected={selectedCoins.has(makeRowKey(groupId, coin.id))}
              hasSelectedCoins={hasSelectedCoins}
              onCoinSelect={onCoinSelect}
            />
          ))
        )}
      </div>

      {/* Dig deeper: full watchlist view */}
      <div className="flex justify-end border-t border-primary/5 px-3 py-1.5 sm:px-4">
        <Link
          href={groupSlug ? `/watchlists?wg=${encodeURIComponent(groupSlug)}&wt=chart` : "/watchlists?wt=chart"}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Open watchlist →
        </Link>
      </div>
    </div>
  )
}

// ✅ IMPROVED: Row component that uses the custom hook for individual watchlists
function WatchlistCard({
  group,
  activeTimeScale,
  rangeEndTimeMs,
  onHoldingsValueKnown,
  isExpanded,
  onToggleExpanded,
  selectedCoins,
  hasSelectedCoins,
  onCoinSelect,
  onVisibleCoinsChange,
}: {
  group: WatchlistGroup
  activeTimeScale: string
  rangeEndTimeMs: number
  /** Fired when quote/holdings data is ready so parent can sort rows by holdings value (desc). */
  onHoldingsValueKnown: (groupId: WatchlistGroupId, holdingsValueUsd: number | null) => void
  isExpanded: boolean
  onToggleExpanded: (groupId: WatchlistGroupId) => void
  selectedCoins: Set<string>
  hasSelectedCoins: boolean
  onCoinSelect: (rowKey: string, selected: boolean) => void
  /** Reports the coin rows currently visible (expanded) so the parent can build the selectable set and resolve token info. */
  onVisibleCoinsChange: (groupId: WatchlistGroupId, coins: CoinRow[]) => void
}) {
  // Use our custom hook to get watchlist data
  const watchlistData = useWatchlistData(group._id, activeTimeScale, rangeEndTimeMs)

  // Report visible (selectable) coin rows to the parent; collapsed panels
  // report none so their rows can't stay selected while hidden.
  const visibleCoins = useMemo(
    () => (isExpanded && watchlistData ? watchlistData.coins : []),
    [isExpanded, watchlistData],
  )
  useEffect(() => {
    // react-doctor-disable-next-line react-doctor/no-pass-data-to-parent, react-doctor/no-pass-live-state-to-parent -- headless per-card hook bridge; hooks cannot run in a loop in the parent
    onVisibleCoinsChange(group._id, visibleCoins)
  }, [group._id, visibleCoins, onVisibleCoinsChange])
  useEffect(
    () => () => {
      onVisibleCoinsChange(group._id, [])
    },
    [group._id, onVisibleCoinsChange],
  )

  const colorTheme =
    COLOR_THEMES[group.color as keyof typeof COLOR_THEMES] || COLOR_THEMES.default

  useEffect(() => {
    if (watchlistData !== null) {
      // react-doctor-disable-next-line react-doctor/no-pass-data-to-parent, react-doctor/no-pass-live-state-to-parent, react-doctor/no-prop-callback-in-effect -- headless per-card hook bridge; hooks cannot run in a loop in the parent
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
      coins: [],
      aggregateSeries: [],
      isLoading: true
    }
  }, [watchlistData, group])

  return (
    <div>
      {watchlist.isLoading ? (
          <WatchlistRowSkeleton activeTimeScale={activeTimeScale} />
        ) : (
          // Accordion trigger row: toggles the coins panel below
          <div
            role="button"
            tabIndex={0}
            aria-expanded={isExpanded}
            onClick={() => onToggleExpanded(watchlist.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onToggleExpanded(watchlist.id)
              }
            }}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-3 px-3 py-3 hover:bg-primary/[0.02] transition-colors duration-200 cursor-pointer sm:gap-4 sm:px-4 sm:py-2 sm:pr-2",
              ROW_GRID_COLS_SM,
            )}
          >
            {/* Watchlist name pill */}
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 overflow-hidden sm:flex-nowrap">
              {/* The pill is the flexible piece: long names truncate with an
                  ellipsis while the token stack stays fully visible */}
              <span
                className={cn(
                  "inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5",
                  colorTheme.bg,
                  colorTheme.border,
                )}
              >
                <WatchlistGroupIcon
                  icon={watchlist.icon}
                  className="size-3.5 shrink-0 text-white/80"
                  size={14}
                />
                <span className="min-w-0 truncate text-xs font-bold text-white">
                  {watchlist.name}
                </span>
              </span>
              {/* Token stack only while collapsed — redundant with the coin list when expanded.
                  shrink-0: always fully visible; the name pill truncates instead. */}
              {!isExpanded && !watchlist.isLoading && watchlist.coinImages.length > 0 && (
                <div className="shrink-0">
                  <AvatarCircles
                    avatarUrls={watchlist.coinImages}
                    numPeople={Math.max(0, watchlist.coinsCount - watchlist.coinImages.length)}
                    sizePx={20}
                    className="-space-x-1.5"
                  />
                </div>
              )}
            </div>

            {/* Aggregate trend chart (this watchlist over the active interval) */}
            <div className="col-start-1 row-start-2 flex min-w-0 flex-col gap-1 sm:col-start-auto sm:row-start-auto sm:flex-row sm:items-center sm:justify-end">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:hidden">
                {getTimeScaleLabel(activeTimeScale)} Trend
              </span>
              <TrendSparkline
                series={watchlist.aggregateSeries}
                change={watchlist.aggregateChange}
                isLoading={Boolean(watchlist.isLoading) || watchlist.aggregateChangeLoading}
              />
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

            {/* Expand/collapse indicator (whole row toggles) */}
            <div className="col-start-2 row-start-1 flex items-center justify-end sm:col-start-auto sm:row-start-auto">
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                  !isExpanded && "-rotate-90",
                )}
              />
            </div>
          </div>
        )}

      {/* Expanded panel: coins in this watchlist */}
      {isExpanded && (
        <WatchlistCoinsPanel
          coins={watchlist.coins}
          coinsCount={watchlist.coinsCount}
          isLoading={Boolean(watchlist.isLoading)}
          groupId={group._id}
          groupSlug={group.slug}
          activeTimeScale={activeTimeScale}
          selectedCoins={selectedCoins}
          hasSelectedCoins={hasSelectedCoins}
          onCoinSelect={onCoinSelect}
        />
      )}
    </div>
  )
}

export function WatchlistTable({ activeTimeScale }: WatchlistTableProps) {
  const { watchlistGroups } = useWatchlist()
  const [expandedIds, setExpandedIds] = useState<Set<WatchlistGroupId>>(new Set())
  const seenGroupIdsRef = useRef<Set<WatchlistGroupId>>(new Set())

  // Row multi-selection (bottom-nav selection mode). Rows are keyed
  // `groupId:coinId` since a coin can appear in several watchlists; bulk
  // removal fans out one group-scoped call per affected watchlist.
  const removeBulkFromConvexWatchlist = useRemoveBulkFromWatchlist()
  const removeSelected = useCallback(
    async (rowKeys: string[]) => {
      const coinIdsByGroup = new Map<string, string[]>()
      for (const key of rowKeys) {
        const { groupId, coinId } = parseRowKey(key)
        const ids = coinIdsByGroup.get(groupId) ?? []
        ids.push(coinId)
        coinIdsByGroup.set(groupId, ids)
      }
      await Promise.all(
        Array.from(coinIdsByGroup, ([groupId, coinIds]) =>
          removeBulkFromConvexWatchlist(coinIds, groupId),
        ),
      )
    },
    [removeBulkFromConvexWatchlist],
  )
  const selection = useWatchlistSelection({ removeSelected })
  const { selectedCoins, handleCoinSelect, hasSelectedCoins } = selection

  /** Coin rows per expanded group, reported by each card as data loads. */
  const [visibleCoinsByGroup, setVisibleCoinsByGroup] = useState<
    Map<WatchlistGroupId, CoinRow[]>
  >(() => new Map())

  const handleVisibleCoinsChange = useCallback(
    (groupId: WatchlistGroupId, coins: CoinRow[]) => {
      setVisibleCoinsByGroup((prev) => {
        const existing = prev.get(groupId)
        const idsOf = (rows: CoinRow[]) => rows.map((c) => c.id).join(",")
        if (existing && idsOf(existing) === idsOf(coins)) return prev
        if (!existing && coins.length === 0) return prev
        const next = new Map(prev)
        if (coins.length === 0) {
          next.delete(groupId)
        } else {
          next.set(groupId, coins)
        }
        return next
      })
    },
    [],
  )

  const selectableRowKeys = useMemo(() => {
    const keys: string[] = []
    for (const [groupId, coins] of visibleCoinsByGroup) {
      for (const coin of coins) keys.push(makeRowKey(groupId, coin.id))
    }
    return keys
  }, [visibleCoinsByGroup])

  // Analyze action: distinct coins across groups (the same coin selected in
  // two groups counts once, both for the cap and the dialog).
  const analyzeSelectedCount = useMemo(
    () =>
      new Set(Array.from(selectedCoins, (key) => parseRowKey(key).coinId))
        .size,
    [selectedCoins],
  )

  const getSelectedTokens = useCallback(() => {
    const byId = new Map<
      string,
      { id: string; name?: string; symbol?: string; logoUrl?: string }
    >()
    for (const key of selectedCoins) {
      const { groupId, coinId } = parseRowKey(key)
      if (byId.has(coinId)) continue
      const row = visibleCoinsByGroup
        .get(groupId as WatchlistGroupId)
        ?.find((coin) => coin.id === coinId)
      if (row) {
        byId.set(coinId, {
          id: row.id,
          name: row.name,
          symbol: row.symbol,
          logoUrl: row.imageUrl ?? undefined,
        })
      }
    }
    return Array.from(byId.values())
  }, [selectedCoins, visibleCoinsByGroup])

  const { onAnalyzeSelected, analyzeDialog } =
    useAnalyzeSelection(getSelectedTokens)

  useBottomNavSelectionBridge(selection, selectableRowKeys, {
    onAnalyzeSelected,
    analyzeSelectedCount,
  })

  // Default: every watchlist starts expanded (newly added ones too);
  // user collapses are respected because we only auto-open unseen ids.
  useEffect(() => {
    const unseen = watchlistGroups.filter(g => !seenGroupIdsRef.current.has(g._id))
    if (unseen.length === 0) return
    for (const g of unseen) seenGroupIdsRef.current.add(g._id)
    setExpandedIds(prev => {
      const next = new Set(prev)
      for (const g of unseen) next.add(g._id)
      return next
    })
  }, [watchlistGroups])

  const toggleExpanded = useCallback((groupId: WatchlistGroupId) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }, [])
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

  if (watchlistGroups.length === 0) {
    return null
  }

  return (
    <div className="rounded-[10px] bg-primary/5 p-0.5">
      {/* Shared table header */}
      <div className="hidden px-4 py-2 sm:block">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          <div className={cn("grid gap-4", ROW_GRID_COLS_SM)}>
            <div className="flex items-center">
              Watchlist
            </div>

            <div className="flex items-center justify-end">
              {getTimeScaleLabel(activeTimeScale)} Trend
            </div>

            <div className="flex items-center gap-1 justify-end">
              {getTimeScaleLabel(activeTimeScale)} Returns
            </div>

            {/* Expand/collapse indicator column */}
            <div aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Table body: contiguous rows in a single card */}
      <div className="bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm overflow-hidden divide-y divide-primary/5">
        {sortedWatchlistGroups.map(group => (
          <WatchlistCard
            key={group._id}
            group={group}
            activeTimeScale={activeTimeScale}
            rangeEndTimeMs={rangeEndTimeMs}
            onHoldingsValueKnown={registerHoldingsValue}
            isExpanded={expandedIds.has(group._id)}
            onToggleExpanded={toggleExpanded}
            selectedCoins={selectedCoins}
            hasSelectedCoins={hasSelectedCoins}
            onCoinSelect={handleCoinSelect}
            onVisibleCoinsChange={handleVisibleCoinsChange}
          />
        ))}
      </div>
      {analyzeDialog}
    </div>
  )
}
