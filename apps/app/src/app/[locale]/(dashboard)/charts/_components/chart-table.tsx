'use client'

import {
  useMemo,
  useDeferredValue,
  memo,
  useCallback,
  useState,
  useEffect,
  useRef,
} from 'react'
import { useSearchParams } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { Input } from "@v1/ui/input"
import { Checkbox } from "@v1/ui/checkbox"
import { useWatchlist } from "../../watchlist/_components/watchlist-context"
import {
  useWatchlistSelection,
  useBottomNavSelectionBridge,
} from "@/hooks/use-watchlist-selection"
import { useAnalyzeSelection } from "@/hooks/use-analyze-selection"
import Link from "next/link"
import { cn } from "@v1/ui/cn"
import { toast } from "@v1/ui/use-toast"
import { Skeleton } from "@v1/ui/skeleton"
import { Spinner } from "@v1/ui/spinner"
import { cleanTokenName, getTokenLogoURL } from "@/lib/logo-overrides"
import { formatUsdPrice } from "@/lib/format-usd"
import { useSetWatchlistItemHoldings } from "@/lib/convex-hooks"
import { Badge } from "@v1/ui/badge"
import { IconTriangleFill } from "symbols-react"
import { TokenLogo } from "@/components/token-logo"
import { motion } from "motion/react"
import {
  SELECT_CELL_VARIANTS,
  SELECT_CHECKBOX_VARIANTS,
  SELECT_CONTENT_VARIANTS,
  useSelectRevealTransition,
} from "@/hooks/use-watchlist-selection"

// Accept whatever data format the existing hook provides
interface OptimisticCoinData {
  id: string | number;
  name: string;
  symbol: string;
  image?: string; // CoinGecko image URL when available
  quote: {
    USD: {
      price: number;
      percent_change_24h: number;
      percent_change_1h?: number;
      percent_change_7d?: number;
      percent_change_30d?: number;
      market_cap: number;
      volume_24h: number;
    };
  };
  isOptimistic?: boolean;
  /** Token quantity from Convex watchlist row (optional). */
  holdings?: number;
}

interface ChartHoldingsCellProps {
  coinId: string
  holdings: number | undefined
  /** Spot USD price for notional (holdings × price). */
  priceUsd: number
  isOptimistic: boolean
  showPending: boolean
  groupId: string | null
  canEdit: boolean
}

function parseDraftQty(draft: string): number | undefined {
  const t = draft.trim()
  if (t === "") return undefined
  const n = Number(t.replace(/,/g, ""))
  if (!Number.isFinite(n) || n < 0) return undefined
  return n
}

function notionalUsdForCell(
  editing: boolean,
  draft: string,
  holdings: number | undefined,
  priceUsd: number,
): number | null {
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null
  const qty = editing ? parseDraftQty(draft) : holdings
  if (qty === undefined) return null
  return qty * priceUsd
}

const holdingsDisplayFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 8,
})

export const ChartHoldingsCell = memo(function ChartHoldingsCell({
  coinId,
  holdings,
  priceUsd,
  isOptimistic,
  showPending,
  groupId,
  canEdit,
}: ChartHoldingsCellProps) {
  const setHoldings = useSetWatchlistItemHoldings()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) {
      setDraft(holdings !== undefined ? String(holdings) : "")
    }
  }, [holdings, editing])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = useCallback(async () => {
    if (!canEdit || !groupId) return
    const t = draft.trim()
    if (t === "") {
      try {
        await setHoldings(groupId, coinId, null)
        setEditing(false)
      } catch {
        toast({
          title: "Could not update holdings",
          description: "Try again in a moment.",
          variant: "destructive",
        })
      }
      return
    }
    const n = Number(t.replace(/,/g, ""))
    if (!Number.isFinite(n) || n < 0) {
      toast({
        title: "Invalid amount",
        description: "Enter a non-negative number or leave empty to clear.",
        variant: "destructive",
      })
      setDraft(holdings !== undefined ? String(holdings) : "")
      setEditing(false)
      return
    }
    try {
      await setHoldings(groupId, coinId, n)
      setEditing(false)
    } catch {
      toast({
        title: "Could not update holdings",
        description: "Try again in a moment.",
        variant: "destructive",
      })
    }
  }, [canEdit, groupId, coinId, draft, holdings, setHoldings])

  const cancel = useCallback(() => {
    setDraft(holdings !== undefined ? String(holdings) : "")
    setEditing(false)
  }, [holdings])

  if (isOptimistic) {
    return (
      <div className="flex items-center justify-end">
        <Skeleton className="h-3 w-14 rounded-full" />
      </div>
    )
  }

  const displayStr =
    holdings !== undefined ? holdingsDisplayFormatter.format(holdings) : null

  const notionalUsd = notionalUsdForCell(editing, draft, holdings, priceUsd)

  return (
    <div
      className="flex min-w-0 items-center justify-end gap-1.5"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <div className="flex min-w-0 shrink-0 items-center justify-end gap-1.5">
        {editing ? (
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              void commit()
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void commit()
              }
              if (e.key === "Escape") {
                e.preventDefault()
                cancel()
              }
            }}
            inputMode="decimal"
            disabled={showPending}
            aria-label="Token holdings quantity"
            className="h-7 w-[5.5rem] px-2 py-0 text-right font-berkeley-mono text-xs tabular-nums"
          />
        ) : (
          <button
            type="button"
            disabled={!canEdit || showPending}
            onClick={() => {
              if (canEdit) setEditing(true)
            }}
            className={cn(
              "-mx-1 rounded px-1 py-0.5 text-right font-berkeley-mono text-xs tabular-nums",
              displayStr ? "text-foreground" : "text-muted-foreground",
              canEdit && !showPending && "cursor-text hover:bg-primary/10",
              (!canEdit || showPending) && "cursor-default",
            )}
          >
            {displayStr ?? "—"}
          </button>
        )}
        {notionalUsd !== null ? (
          <Badge
            variant="outline"
            className="h-5 max-w-[6.5rem] shrink-0 truncate border-primary/5 bg-primary/5 px-1.5 text-[10px] font-normal leading-none tabular-nums text-white/60"
            title="USD notional (holdings × spot price)"
          >
            {formatUsdPrice(notionalUsd)}
          </Badge>
        ) : null}
      </div>
    </div>
  )
})

/**
 * Shared row grid (sm+) so the table header and rows stay aligned — mirrors
 * the comparison view's WatchlistTable structure: wide token column, value
 * columns, fixed trailing actions column.
 */
const ROW_GRID_COLS_SM =
  "sm:grid-cols-[minmax(0,1.6fr)_1fr_1.2fr_1.4fr]"

/** Same derivation as the comparison table: infer the USD move from spot price + % change. */
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

interface ChartTableProps {
  coins: OptimisticCoinData[]
  activeTimeScale: string
  isPending?: boolean
}

export const ChartTable = memo(function ChartTable({ 
  coins, 
  activeTimeScale,
  isPending 
}: ChartTableProps) {
  const {
    selectedGroup,
    removeBulkFromSelectedGroup,
    removeBulkFromWatchlist,
  } = useWatchlist()
  const { user } = useUser()
  const searchParams = useSearchParams()
  const selectRevealTransition = useSelectRevealTransition()

  // Group-scoped bulk remove when a group is selected (mirrors the single
  // remove in multi-line-lightweight.tsx).
  const removeSelected = useCallback(
    async (coinIds: string[]) => {
      if (selectedGroup) {
        await removeBulkFromSelectedGroup(coinIds)
      } else {
        await removeBulkFromWatchlist(coinIds)
      }
    },
    [selectedGroup, removeBulkFromSelectedGroup, removeBulkFromWatchlist],
  )

  const selection = useWatchlistSelection({ removeSelected })
  const { selectedCoins, handleCoinSelect, hasSelectedCoins } = selection

  // React 19: Defer expensive computations
  const deferredCoins = useDeferredValue(coins)
  const deferredTimeScale = useDeferredValue(activeTimeScale)
  
  // Get current watchlist group parameter to preserve it in navigation (same as top-nav)
  const watchlistGroup = searchParams.get('wg')

  // React 19: Memoize expensive interval calculations with deferred values
  const coinsWithIntervalChange = useMemo(() => {
    const enrichedCoins = deferredCoins.map(coin => {
      let intervalChange = 0

      // Skip calculation for optimistic coins
      if (coin.isOptimistic) {
        return {
          ...coin,
          intervalChange: 0
        }
      }

      // ONLY use real data - no fake calculations or inappropriate fallbacks
      if (coin.quote?.USD) {
        switch (deferredTimeScale) {
          case '1d':
            // 1D = 24h change (matches watchlist)
            intervalChange = coin.quote.USD.percent_change_24h ?? 0
            break
          case '7d':
            // 1W = 7d change 
            intervalChange = coin.quote.USD.percent_change_7d ?? coin.quote.USD.percent_change_24h ?? 0
            break
          case '30d':
            // 1M = 30d change
            intervalChange = coin.quote.USD.percent_change_30d ?? coin.quote.USD.percent_change_7d ?? coin.quote.USD.percent_change_24h ?? 0
            break
          case 'max':
            // 1Y = longest real data CoinMarketCap provides
            intervalChange = coin.quote.USD.percent_change_30d ?? coin.quote.USD.percent_change_7d ?? coin.quote.USD.percent_change_24h ?? 0
            break
          case '2y':
            // 2Y = CoinMarketCap doesn't provide this data
            intervalChange = Number.NaN
            break
          default:
            // Default to 24h real data
            intervalChange = coin.quote.USD.percent_change_24h ?? 0
        }
      }

      return {
        ...coin,
        intervalChange
      }
    })
    
    // Highest item first: sort by 24h volume (descending).
    enrichedCoins.sort(
      (a, b) => (b.quote?.USD?.volume_24h ?? 0) - (a.quote?.USD?.volume_24h ?? 0),
    )

    return enrichedCoins
  }, [deferredCoins, deferredTimeScale])

  // Selection targets the rows actually rendered (the internally deferred
  // array), excluding optimistic placeholders.
  const selectableCoinIds = useMemo(
    () =>
      coinsWithIntervalChange
        .filter((coin) => !coin.isOptimistic)
        .map((coin) => String(coin.id)),
    [coinsWithIntervalChange],
  )

  // Analyze action for the selection dock: resolve selected rows to token
  // display info; the hook hosts the (multi-)analysis dialog here.
  const getSelectedTokens = useCallback(
    () =>
      coinsWithIntervalChange
        .filter(
          (coin) => !coin.isOptimistic && selectedCoins.has(String(coin.id)),
        )
        .map((coin) => ({
          id: String(coin.id),
          name: cleanTokenName(coin.name),
          symbol: coin.symbol,
          logoUrl: getTokenLogoURL(coin.symbol, coin.image),
        })),
    [coinsWithIntervalChange, selectedCoins],
  )
  const { onAnalyzeSelected, analyzeDialog } =
    useAnalyzeSelection(getSelectedTokens)

  useBottomNavSelectionBridge(selection, selectableCoinIds, {
    onAnalyzeSelected,
    analyzeSelectedCount: selectedCoins.size,
  })

  const getTimeScaleLabel = (scale: string) => {
    switch (scale) {
      case '1d': return '1D'    // 1 Day (24h)
      case '7d': return '1W'    // 1 Week (7d)
      case '30d': return '1M'   // 1 Month (30d)
      case 'max': return '1Y'   // 1 Year (longest available)
      case '2y': return '2Y'    // 2 Years (N/A)
      default: return scale.toUpperCase()
    }
  }

  // React 19: Show pending states
  const showPending = Boolean(isPending)
  const holdingsGroupId = selectedGroup?._id ?? null
  const canEditHoldings = Boolean(user && selectedGroup)

  if (!coins.length) return null

  return (
    <div className={cn(
      "rounded-[10px] bg-primary/5 p-0.5",
      showPending && "opacity-60 transition-opacity duration-200"
    )}>
      {/* Shared table header */}
      <div className="hidden px-4 py-2 sm:block">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          <div className={cn("grid gap-4", ROW_GRID_COLS_SM)}>
            <div className="flex items-center">
              Token
            </div>
            <div className="flex items-center justify-end">
              Price
            </div>
            <div className="flex items-center gap-1 justify-end">
              {getTimeScaleLabel(activeTimeScale)} Change
            </div>
            <div className="flex items-center justify-end">
              Holdings
            </div>
          </div>
        </div>
      </div>

      {/* Table body: contiguous rows in a single card */}
      <div className="bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm overflow-hidden divide-y divide-primary/5">
      {coinsWithIntervalChange.map((coin) => {
        const coinIdStr = String(coin.id)
        const isSelected = selectedCoins.has(coinIdStr)
        const tokenName = coin.isOptimistic ? "Loading..." : cleanTokenName(coin.name)
        const tokenLogoUrl = getTokenLogoURL(coin.symbol, coin.image)
        const safeTokenLogoUrl =
          tokenLogoUrl && (tokenLogoUrl.startsWith("http") || tokenLogoUrl.startsWith("/"))
            ? tokenLogoUrl
            : undefined

        return (
          <div key={coin.id}>
            {coin.isOptimistic ? (
              // Show non-clickable loading state for optimistic coins
              <div className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-3 px-3 py-3 pr-2 opacity-60 sm:gap-4 sm:px-4 sm:py-2",
                ROW_GRID_COLS_SM,
              )}>
                {/* Token */}
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:flex-nowrap">
                  <div className="relative shrink-0">
                    {safeTokenLogoUrl ? (
                      <TokenLogo
                        src={safeTokenLogoUrl}
                        alt={tokenName}
                        sizePx={16}
                        fallbackText={coin.symbol}
                        className="opacity-50 rounded-full ring-1 ring-zinc-200 dark:ring-black/80"
                        quality={70}
                      />
                    ) : (
                      <Skeleton className="size-4 rounded-full" />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Spinner size={12} />
                    </div>
                  </div>
                  <Skeleton className="h-3 w-8 rounded-full" />
                  <span className="text-primary/40 text-xs whitespace-nowrap sm:hidden">price is currently</span>
                  <Skeleton className="h-3 w-16 rounded-full sm:hidden" />
                </div>

                {/* Price (sm+ column) */}
                <div className="hidden min-w-0 items-center justify-end sm:flex">
                  <Skeleton className="h-3 w-16 rounded-full" />
                </div>

                {/* Interval Change */}
                <div className="col-span-2 row-start-2 flex min-w-0 flex-col gap-1 sm:col-span-1 sm:row-start-auto sm:flex-row sm:items-center sm:justify-end">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:hidden">
                    {getTimeScaleLabel(activeTimeScale)}
                  </span>
                  <Skeleton className="h-3 w-10 rounded-full" />
                </div>

                {/* Holdings */}
                <div className="col-span-2 row-start-3 flex min-w-0 flex-col gap-1 sm:col-span-1 sm:row-start-auto sm:block">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:hidden">
                    Holdings
                  </span>
                  <ChartHoldingsCell
                    coinId={String(coin.id)}
                    holdings={coin.holdings}
                    priceUsd={coin.quote.USD.price}
                    isOptimistic
                    showPending={showPending}
                    groupId={holdingsGroupId}
                    canEdit={canEditHoldings}
                  />
                </div>

              </div>
            ) : (
              // Show clickable link for real coins
              <Link
                href={watchlistGroup ? `/watchlists/${coin.id}?wg=${watchlistGroup}` : `/watchlists/${coin.id}`}
                aria-selected={hasSelectedCoins ? isSelected : undefined}
                onClick={
                  hasSelectedCoins
                    ? (e) => {
                        e.preventDefault()
                        handleCoinSelect(coinIdStr, !isSelected)
                      }
                    : undefined
                }
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-3 px-3 py-3 pr-2 cursor-pointer hover:rounded-[7px] hover:bg-primary/[0.04] hover:ring-2 hover:ring-inset hover:ring-zinc-200/30 sm:gap-4 sm:px-4 sm:py-2",
                  ROW_GRID_COLS_SM,
                  "transition-opacity duration-200",
                  hasSelectedCoins && !isSelected && "opacity-40",
                )}
              >
                {/* First cell — merged select + token, toggles selection on click */}
                <div
                  className="flex min-w-0 items-center"
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.preventDefault() // Always prevent navigation for first cell (selection mode)
                    e.stopPropagation()

                    // Let the checkbox handle its own toggling (avoid double-toggle).
                    const target = e.target as HTMLElement
                    if (target.closest('[data-chart-row-checkbox="true"]')) return

                    handleCoinSelect(coinIdStr, !isSelected)
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return
                    e.preventDefault()
                    e.stopPropagation()
                    handleCoinSelect(coinIdStr, !isSelected)
                  }}
                >
                <motion.div
                  className="relative flex h-full w-full min-w-0 items-center justify-start"
                  // Ensure non-hovered rows animate when selection mode flips on/off.
                  // Starting from "rest" prevents "jump-to-endstate" on remounts.
                  variants={SELECT_CELL_VARIANTS}
                  initial="rest"
                  animate={hasSelectedCoins ? "revealed" : "rest"}
                  whileHover={hasSelectedCoins ? undefined : "revealed"}
                >
                  {/* Checkbox - stable DOM to avoid "jump" on select/deselect */}
                  <motion.div
                    className="absolute left-0 z-10 px-1"
                    variants={SELECT_CHECKBOX_VARIANTS}
                    transition={selectRevealTransition}
                  >
                    <Checkbox
                      data-chart-row-checkbox="true"
                      checked={isSelected}
                      tabIndex={hasSelectedCoins ? 0 : -1}
                      onCheckedChange={(checked) =>
                        handleCoinSelect(coinIdStr, checked === true)
                      }
                      aria-label={`Select ${tokenName}`}
                    />
                  </motion.div>

                  {/* Token content slides right to make room for the checkbox */}
                  <motion.div
                    className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:flex-nowrap"
                    variants={SELECT_CONTENT_VARIANTS}
                    transition={selectRevealTransition}
                  >
                  {safeTokenLogoUrl ? (
                    <TokenLogo
                      src={safeTokenLogoUrl}
                      alt={tokenName}
                      sizePx={16}
                      fallbackText={coin.symbol}
                      className="shrink-0 rounded-full ring-1 ring-zinc-200 dark:ring-black/80"
                      quality={70}
                    />
                  ) : (
                    <div className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[8px] font-bold text-primary/70">
                      {coin.symbol?.charAt(0) || '?'}
                    </div>
                  )}
                  <span className="shrink-0 text-xs font-bold">{coin.symbol.toUpperCase()}</span>
                  <span className="min-w-0 truncate font-berkeley-mono text-xs text-muted-foreground">{tokenName}</span>
                  <span className="text-primary/40 text-xs whitespace-nowrap sm:hidden">price is currently</span>
                  <span className="font-berkeley-mono text-xs font-semibold tabular-nums sm:hidden">
                    {formatUsdPrice(coin.quote.USD.price)}
                  </span>
                  </motion.div>
                </motion.div>
                </div>

                {/* Price (sm+ column) */}
                <div className="hidden min-w-0 items-center justify-end font-berkeley-mono text-xs font-semibold tabular-nums sm:flex">
                  {formatUsdPrice(coin.quote.USD.price)}
                </div>

                {/* Interval Change: USD move left, % in a badge — same as the comparison table */}
                <div className="col-span-2 row-start-2 flex min-w-0 flex-col gap-1 sm:col-span-1 sm:row-start-auto sm:flex-row sm:items-center sm:justify-end">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:hidden">
                    {getTimeScaleLabel(activeTimeScale)}
                  </span>
                  {Number.isNaN(coin.intervalChange) ? (
                    <span className="font-berkeley-mono text-xs text-muted-foreground">
                      N/A
                    </span>
                  ) : (
                    (() => {
                      const change = coin.intervalChange
                      const isPositive = change > 0
                      const isNegative = change < 0
                      const isNeutral = !isPositive && !isNegative
                      const usdMove = deriveUsdMoveFromPercentChange({
                        priceUsd: coin.quote.USD.price,
                        percentChange: change,
                      })
                      const usdSign = isPositive ? "+" : isNegative ? "-" : ""

                      return (
                        <div className="inline-flex items-center gap-2 sm:justify-end">
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

                {/* Holdings (editable token quantity) */}
                <div className="col-span-2 row-start-3 flex min-w-0 flex-col gap-1 sm:col-span-1 sm:row-start-auto sm:block">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:hidden">
                    Holdings
                  </span>
                  <ChartHoldingsCell
                    coinId={String(coin.id)}
                    holdings={coin.holdings}
                    priceUsd={coin.quote.USD.price}
                    isOptimistic={false}
                    showPending={showPending}
                    groupId={holdingsGroupId}
                    canEdit={canEditHoldings}
                  />
                </div>

              </Link>
            )}
          </div>
        )
      })}
      </div>
      {analyzeDialog}
    </div>
  )
})
