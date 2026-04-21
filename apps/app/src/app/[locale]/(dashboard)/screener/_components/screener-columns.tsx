'use client'

import type { ReactNode } from "react"
import type { ColumnDef } from '@tanstack/react-table'
import { Badge } from "@v1/ui/badge"
import { formatLargeNumber } from "@v1/ui/format-numbers"
import { Skeleton } from "@v1/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip"
import { cn } from "@v1/ui/cn"
import { IconTriangleFill } from "symbols-react"
import { TokenLogo } from "@/components/token-logo"
import { formatUsdPrice } from "@/lib/format-usd"
import { cleanTokenName, getTokenLogoURL } from "@/lib/logo-overrides"
import type { CoinMarketData } from '@/types/coins'
import { ScreenerInlineTrailCell } from "./screener-inline-trail-cell"
import { ScreenerTakerVolumeCell } from "./screener-taker-volume-cell"
import { ScreenerAnalysisActionCell } from "./screener-analysis-action-cell"

function deriveUsdMoveFromPercentChange(args: {
  priceUsd: number
  percentChange: number
}): number | null {
  const priceUsd = args.priceUsd
  const percentChange = args.percentChange

  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null
  if (!Number.isFinite(percentChange)) return null

  const ratio = percentChange / 100
  const denom = 1 + ratio
  if (!Number.isFinite(denom) || denom <= 0) return null

  const previousPrice = priceUsd / denom
  const deltaUsd = priceUsd - previousPrice
  return Number.isFinite(deltaUsd) ? deltaUsd : null
}
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

export function createScreenerColumns(): ColumnDef<CoinMarketData>[] {
  return [
    {
      id: 'token',
      header: () => <div className="text-left flex items-center gap-1">Token</div>,
      cell: ({ row }) => {
        const tokenName = cleanTokenName(row.original.name)
        const tokenLogoUrl = getTokenLogoURL(row.original.symbol, row.original.image)
        const safeTokenLogoUrl =
          tokenLogoUrl && (tokenLogoUrl.startsWith("http") || tokenLogoUrl.startsWith("/"))
            ? tokenLogoUrl
            : undefined

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
              <div className="translate-y-[-1px]">
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
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: 'token-sort',
      accessorKey: 'name',
      header: () => <div className="text-left flex items-center gap-1">Token</div>,
      cell: () => null,
      enableSorting: true,
    },
    {
      id: 'price',
      accessorKey: 'quote.USD.price',
      header: () => (
        <div className="flex w-full items-center justify-end gap-1 text-right">
          <ColumnHeaderTooltip text="Spot price in USD from aggregated market data. Not an executable quote.">
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
          <ColumnHeaderTooltip text="Current USD market cap (price × circulating supply, when available).">
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
          <ColumnHeaderTooltip text="Total notional USD traded across tracked venues in the last 24 hours.">
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
          <ColumnHeaderTooltip text="Rolling 24-hour performance. Shows the 24h percent change and inferred USD move.">
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
          <ColumnHeaderTooltip text="Taker volume on Binance spot (USDT pair): market orders hitting the book.">
            Taker buy/sell volume
          </ColumnHeaderTooltip>
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex min-w-0 w-full items-center justify-end">
          {row.original.quote.USD.price > 0 ? (
            <ScreenerTakerVolumeCell baseSymbol={row.original.symbol} />
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
          <ColumnHeaderTooltip text="14-day USD price trail. The first 7 days render neutral; the most recent 7 days render green or red based on performance.">
            2 week price trail
          </ColumnHeaderTooltip>
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex min-w-0 w-full items-center justify-end">
          {row.original.quote.USD.price > 0 ? (
            <ScreenerInlineTrailCell
              coinId={row.original.id}
              symbol={row.original.symbol}
              sparkline7d={row.original.sparkline7d}
              initialData={row.original.quote.USD}
              percentChange24h={row.original.quote.USD.percent_change_24h}
            />
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
              <ScreenerAnalysisActionCell
                coinId={String(row.original.id)}
                tokenData={{
                  name: tokenName,
                  symbol: row.original.symbol,
                  id: String(row.original.id),
                  logoUrl: safeTokenLogoUrl,
                }}
              />
            )}
          </div>
        )
      },
      enableSorting: false,
    },
  ]
}
