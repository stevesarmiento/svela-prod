'use client'

import type { ReactNode } from "react"
import { formatLargeNumber } from "@v1/ui/format-numbers";
import { Button } from "@v1/ui/button"
import { Badge } from "@v1/ui/badge"
import { X } from "lucide-react"
import { cn } from "@v1/ui/cn"
import { Skeleton } from "@v1/ui/skeleton"
import { Checkbox } from "@v1/ui/checkbox"
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip"
import type { ColumnDef } from '@tanstack/react-table'
import { motion } from "motion/react"
import { Spinner } from "@v1/ui/spinner"
import dynamic from "next/dynamic"
import type { CoinMarketData } from '@/types/coins'
import { TokenLogo } from "@/components/token-logo"
import { InlinePriceChart, LazyInlinePriceChart } from "@/components/charts/inline-price-chart"
import { InlineSpotTakerBuySellVolumeChart } from "@/components/charts/inline-spot-taker-buy-sell-volume-chart"
import { DURATION_UI_S, EASE_IN_OUT_CUBIC, motionDuration } from "@/lib/motion-tokens"
import { cleanTokenName, getTokenLogoURL } from "@/lib/logo-overrides"
import { formatUsdPrice } from "@/lib/format-usd"
import { IconTriangleFill } from "symbols-react"

function loadAnalysisDialog() {
  return import("@/components/navigation/analysis-dialog")
}

const AnalysisDialog = dynamic(
  () => loadAnalysisDialog().then((module) => module.AnalysisDialog),
  {
    ssr: false,
    loading: () => (
      <div className="h-6 w-6 rounded-lg bg-zinc-950/10 dark:bg-white/10" />
    ),
  },
)

interface Ref<T> {
  current: T;
}

interface WatchlistColumnsProps {
  handleRemove: (coinId: number | string) => void;
  selectedCoinsRef: Ref<Set<string>>;
  onCoinSelect: (coinId: string, selected: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  totalCoins: number;
  removingCoinsRef: Ref<Set<string>>;
  hasSelectedCoinsRef: Ref<boolean>;
  shouldReduceMotion?: boolean;
  onInlineChartError?: () => void;
  mode?: "watchlist" | "screener";
}

function deriveUsdMoveFromPercentChange(args: {
  priceUsd: number
  percentChange: number
}): number | null {
  const priceUsd = args.priceUsd
  const percentChange = args.percentChange

  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null
  if (!Number.isFinite(percentChange)) return null

  const r = percentChange / 100
  const denom = 1 + r
  if (!Number.isFinite(denom) || denom <= 0) return null

  const previousPrice = priceUsd / denom
  const deltaUsd = priceUsd - previousPrice
  if (!Number.isFinite(deltaUsd)) return null

  return deltaUsd
}

/** Hover hint for dense table headers (provider is on dashboard layout). */
function ColumnHeaderTooltip({
  children,
  text,
}: {
  children: ReactNode
  text: string
}) {
  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center">{children}</span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="p-2.5 rounded-md max-w-xs text-pretty text-[11px] font-normal normal-case tracking-normal"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  )
}

export function createWatchlistColumns({
  handleRemove,
  selectedCoinsRef,
  onCoinSelect,
  onSelectAll,
  totalCoins,
  removingCoinsRef,
  hasSelectedCoinsRef,
  shouldReduceMotion = false,
  onInlineChartError,
  mode = "watchlist",
}: WatchlistColumnsProps): ColumnDef<CoinMarketData>[] {
  const enableSelection = mode === "watchlist"
  return [
    {
      id: 'select',
      header: () => (
        enableSelection ? (
          <div
            className={cn(
              "transition-opacity duration-200",
              hasSelectedCoinsRef.current ? "opacity-100" : "opacity-0",
            )}
          >
            <Checkbox
              checked={selectedCoinsRef.current.size === totalCoins && totalCoins > 0}
              onCheckedChange={onSelectAll}
              aria-label="Select all"
            />
          </div>
        ) : null
      ),
      cell: ({ row }) => {
        const coinId = row.original.id.toString()
        const isRowLoading = row.original.quote.USD.price <= 0
        const isRowSelected = selectedCoinsRef.current.has(coinId)
        const tokenName = cleanTokenName(row.original.name)
        const tokenLogoUrl = getTokenLogoURL(row.original.symbol, row.original.image)
        const safeTokenLogoUrl =
          tokenLogoUrl && (tokenLogoUrl.startsWith("http") || tokenLogoUrl.startsWith("/"))
            ? tokenLogoUrl
            : undefined

        if (!enableSelection) {
          return (
            <div className="flex items-center gap-2">
              <div className="relative">
                {row.original.quote.USD.price > 0 ? (
                  <TokenLogo
                    src={safeTokenLogoUrl}
                    alt={tokenName}
                    sizePx={20}
                    fallbackText={row.original.symbol}
                    className="mr-1 ring-0 bg-primary/20 border-[1.5px] border-zinc-200 dark:border-black/60"
                    quality={70}
                  />
                ) : (
                  <Skeleton className="w-[20px] h-[20px] rounded-full" />
                )}
              </div>
              <div className="flex flex-row items-center gap-2">
                <div className="font-bold text-sm text-nowrap">
                  {row.original.quote.USD.price > 0 ? (
                    <span className="text-zinc-950 dark:text-white">
                      {row.original.symbol.toUpperCase()}
                    </span>
                  ) : (
                    <Skeleton className="h-4 w-8 rounded" />
                  )}
                </div>
                <div className=" translate-y-[-1px]">
                  {row.original.quote.USD.price > 0 ? (
                    <span className="text-nowrap text-muted-foreground font-diatype-medium text-[11px]">
                      {tokenName}
                    </span>
                  ) : (
                    <Skeleton className="h-3 w-16 rounded" />
                  )}
                </div>
              </div>
            </div>
          )
        }

        // When any rows are selected, lock the reveal state for all rows (selection mode).
        // Otherwise, reveal on hover (handled by Motion `whileHover` below).
        const isSelectionMode = hasSelectedCoinsRef.current
        const transition = {
          type: "tween" as const,
          duration: motionDuration(shouldReduceMotion, DURATION_UI_S),
          ease: EASE_IN_OUT_CUBIC,
        }
        const cellVariants = {
          rest: {},
          revealed: {},
        } as const
        const checkboxVariants = {
          rest: { opacity: 0, x: -20, pointerEvents: "none" as const },
          revealed: { opacity: 1, x: 0, pointerEvents: "auto" as const },
        } as const

        const contentVariants = {
          rest: { x: 0, opacity: 1 },
          revealed: { x: 40, opacity: 0.9 },
        } as const
        
        return (
          <motion.div
            className="relative h-full flex items-center justify-start"
            // Ensure non-hovered rows animate when selection mode flips on/off.
            // Some table updates can remount cells; starting from `"rest"` prevents "jump-to-endstate".
            variants={cellVariants}
            initial="rest"
            animate={isSelectionMode ? "revealed" : "rest"}
            whileHover={isSelectionMode ? undefined : "revealed"}
          >
            {/* Checkbox - stable DOM to avoid "jump" on select/deselect */}
            <motion.div
              className="absolute left-0 z-10 px-1"
              variants={checkboxVariants}
              transition={transition}
            >
              <Checkbox
                data-watchlist-row-checkbox="true"
                checked={isRowSelected}
                disabled={isRowLoading}
                tabIndex={isSelectionMode && !isRowLoading ? 0 : -1}
                onCheckedChange={(value) => onCoinSelect(coinId, !!value)}
                aria-label="Select row"
                className="mt-[6px] data-[state=checked]:mt-[2px]"
              />
            </motion.div>
            
            {/* Token content - no link here, entire row will be linked */}
            <motion.div
              className="flex items-center gap-2"
              variants={contentVariants}
              transition={transition}
            >
              <div className="relative">
                {row.original.quote.USD.price > 0 ? (
                  <TokenLogo
                    src={safeTokenLogoUrl}
                    alt={tokenName}
                    sizePx={20}
                    fallbackText={row.original.symbol}
                    className="mr-1 ring-0 bg-primary/20 border-[1.5px] border-zinc-200 dark:border-black/60"
                    quality={70}
                  />
                ) : (
                  <Skeleton className="w-[20px] h-[20px] rounded-full" />
                )}
              </div>
              <div className="flex flex-row items-center gap-2">
                <div className="font-bold text-sm text-nowrap">
                  {row.original.quote.USD.price > 0 ? (
                    <span className={cn(
                      hasSelectedCoinsRef.current ? "text-primary" : "text-zinc-950 dark:text-white",
                    )}>
                      {row.original.symbol.toUpperCase()}
                    </span>
                  ) : (
                    <Skeleton className="h-4 w-8 rounded" />
                  )}
                </div>
                <div className=" translate-y-[-1px]">
                  {row.original.quote.USD.price > 0 ? (
                    <span className="text-nowrap text-muted-foreground font-diatype-medium text-[11px]">{tokenName}</span>
                  ) : (
                    <Skeleton className="h-3 w-16 rounded" />
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        );
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: 'token-sort',
      accessorKey: 'name',
      // Visible "Token" header (and optional count badge) is rendered in `watchlist-table-header.tsx`
      // via the first grid cell; this column only participates in sorting.
      header: () => (
        <div className="text-left flex items-center gap-1">
          Token
        </div>
      ),
      cell: () => null,
      enableSorting: true,
    },
    {
      id: 'price',
      accessorKey: 'quote.USD.price',
      header: () => (
        <div className="flex w-full items-center justify-end gap-1 text-right">
          <ColumnHeaderTooltip text="Spot price in USD from aggregated market data (typically via CoinGecko). Not an executable quote.">
            Price
          </ColumnHeaderTooltip>
        </div>
      ),
      cell: ({ row }) => (
        <span className="block w-full text-right font-berkeley-mono text-[11px] tabular-nums">
          {row.original.quote.USD.price > 0 ? (
            formatUsdPrice(row.original.quote.USD.price)
          ) : (
            <Skeleton className="ms-auto inline-block h-4 w-16 rounded-full" />
          )}
        </span>
      ),
      enableSorting: true,
    },
    {
      id: "marketCap",
      accessorKey: "quote.USD.market_cap",
      header: () => (
        <div className="flex w-full items-center justify-end gap-1 text-right">
          <ColumnHeaderTooltip text="Current USD market cap (price × circulating supply, when available). Useful for quickly spotting majors (BTC/ETH) vs smaller caps.">
            Market cap
          </ColumnHeaderTooltip>
        </div>
      ),
      cell: ({ row }) => (
        <span className="block w-full text-right font-berkeley-mono text-[11px] tabular-nums">
          {row.original.quote.USD.price > 0 ? (
            `$${formatLargeNumber(row.original.quote.USD.market_cap || 0)}`
          ) : (
            <Skeleton className="ms-auto inline-block h-4 w-16 rounded-full" />
          )}
        </span>
      ),
      enableSorting: true,
      sortDescFirst: true,
    },
    {
      id: 'volume',
      accessorKey: 'quote.USD.volume_24h',
      header: () => (
        <div className="flex w-full items-center justify-end gap-1 text-right">
          <ColumnHeaderTooltip text="Total notional USD traded across tracked venues in the last 24 hours. Higher volume usually means more liquidity and tighter spreads.">
            24h volume
          </ColumnHeaderTooltip>
        </div>
      ),
      cell: ({ row }) => (
        <span className="block w-full text-right font-berkeley-mono text-[11px] tabular-nums">
          {row.original.quote.USD.price > 0 ? (
            `$${formatLargeNumber(row.original.quote.USD.volume_24h || 0)}`
          ) : (
            <Skeleton className="ms-auto inline-block h-4 w-16 rounded-full" />
          )}
        </span>
      ),
      enableSorting: true,
      sortDescFirst: true,
    },
    {
      id: "dailyPerformance",
      accessorFn: (row) => row.quote.USD.percent_change_24h ?? 0,
      header: () => (
        <div className="flex w-full items-center justify-end gap-1 text-right">
          <ColumnHeaderTooltip text="Rolling 24-hour performance. Shows the 24h percent change and the inferred USD move (derived from current price + percent change).">
            Daily performance
          </ColumnHeaderTooltip>
        </div>
      ),
      cell: ({ row }) =>
        row.original.quote.USD.price > 0 ? (
          (() => {
            const change24h = row.original.quote.USD.percent_change_24h
            const isPositive = change24h > 0
            const isNegative = change24h < 0
            const isNeutral = !isPositive && !isNegative
            const usdMove = deriveUsdMoveFromPercentChange({
              priceUsd: row.original.quote.USD.price,
              percentChange: change24h,
            })
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
                    "h-5 px-1.5 font-berkeley-mono text-[11px] tabular-nums gap-1",
                    isNeutral && "border-zinc-200/60 text-muted-foreground dark:border-white/10",
                  )}
                >
                  <IconTriangleFill
                    aria-hidden="true"
                    className={cn(
                      "size-[4px] shrink-0 fill-current",
                      isNegative && "rotate-180",
                    )}
                  />
                  {Math.abs(change24h).toFixed(2)}%
                </Badge>
              </div>
            )
          })()
        ) : (
          <div className="inline-flex items-center justify-end gap-2">
            <Skeleton className="h-4 w-14 rounded-full" />
            <Skeleton className="h-4 w-12 rounded-full" />
          </div>
        ),
      enableSorting: true,
    },
    {
      id: 'takerBuySellVolume',
      header: () => (
        <div className="flex w-full items-center justify-end gap-1 text-right">
          <ColumnHeaderTooltip text="Taker volume on Binance spot (USDT pair): market orders hitting the book. Buy stack vs sell stack over recent 4h slices—more aggressive buying lifts the buy side; more aggressive selling lifts the sell side.">
            Taker buy/sell volume
          </ColumnHeaderTooltip>
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex min-w-0 w-full items-center justify-end">
          {row.original.quote.USD.price > 0 ? (
            <InlineSpotTakerBuySellVolumeChart
              baseSymbol={row.original.symbol}
              className="max-w-56"
            />
          ) : (
            <Skeleton className="h-8 w-full max-w-56 rounded-sm" />
          )}
        </div>
      ),
      enableSorting: false,
    },
    {
      id: 'chart',
      header: () => (
        <div className="flex w-full items-center justify-end gap-1 text-right">
          <ColumnHeaderTooltip text="14-day USD price trail. The first 7 days render neutral; the most recent 7 days render green/red based on performance over that window.">
            2 week price trail
          </ColumnHeaderTooltip>
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex min-w-0 w-full items-center justify-end">
          {row.original.quote.USD.price > 0 ? (
            <div
              className="w-full max-w-56 overflow-hidden [mask-image:linear-gradient(to_right,transparent_0%,black_12%,black_100%)]"
              style={{
                WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 12%, black 100%)",
                maskImage: "linear-gradient(to right, transparent 0%, black 12%, black 100%)",
              }}
            >
              {mode === "screener" ? (
                <LazyInlinePriceChart
                  className="w-full"
                  coingeckoId={row.original.id}
                  percentChange24h={row.original.quote.USD.percent_change_24h}
                  symbol={row.original.symbol}
                  sparkline7d={row.original.sparkline7d}
                  initialData={row.original.quote.USD}
                  onError={onInlineChartError}
                  rootMarginPx={600}
                />
              ) : (
                <InlinePriceChart
                  className="w-full"
                  coingeckoId={row.original.id}
                  percentChange24h={row.original.quote.USD.percent_change_24h}
                  symbol={row.original.symbol}
                  sparkline7d={row.original.sparkline7d}
                  initialData={row.original.quote.USD}
                  onError={onInlineChartError}
                />
              )}
            </div>
          ) : (
            <Skeleton className="h-8 w-full max-w-56 rounded-sm" />
          )}
        </div>
      ),
      enableSorting: false,
    },
    {
      id: 'actions',
      header: () => (
        <div className="flex w-full items-center justify-end gap-1 text-right whitespace-nowrap">
          Actions
        </div>
      ),
      cell: ({ row }) => {
        const isRowLoading = row.original.quote.USD.price <= 0
        const tokenName = cleanTokenName(row.original.name)
        const tokenLogoUrl = getTokenLogoURL(row.original.symbol, row.original.image)
        const safeTokenLogoUrl =
          tokenLogoUrl && (tokenLogoUrl.startsWith("http") || tokenLogoUrl.startsWith("/"))
            ? tokenLogoUrl
            : undefined

        return (
          <div className="flex items-center justify-end gap-1.5 flex-nowrap whitespace-nowrap">
            {isRowLoading ? (
              <Skeleton className="h-6 w-16 rounded-lg" />
            ) : (
              <>
                <AnalysisDialog
                  coinId={String(row.original.id)}
                  tokenData={{
                    name: tokenName,
                    symbol: row.original.symbol,
                    id: String(row.original.id),
                    logoUrl: safeTokenLogoUrl,
                  }}
                  triggerVariant="icon"
                  triggerTooltip="Deep Analysis"
                  triggerAriaLabel="Deep Analysis"
                />
                {/* <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleRemove(row.original.id)
                  }}
                  disabled={removingCoinsRef.current.has(row.original.id.toString())}
                  aria-label="Remove from watchlist"
                  className="h-6 w-6 p-0 rounded-lg bg-transparent hover:bg-rose-500/10 transition-colors group"
                >
                  {removingCoinsRef.current.has(row.original.id.toString()) ? (
                    <Spinner size={16} />
                  ) : (
                    <X className="h-4 w-4 text-muted-foreground group-hover:text-rose-500 transition-colors" />
                  )}
                </Button> */}
              </>
            )}
          </div>
        )
      },
      enableSorting: false,
      size: 80,
      minSize: 72,
    },
  ];
}
