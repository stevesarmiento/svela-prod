'use client'

import { useMemo, useState } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../../convex/_generated/api"
import { Badge } from "@v1/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card"
import { cn } from "@v1/ui/cn"
import { AvatarCircles } from "@v1/ui/token-stacks"
import { TimeScaleSelector } from "../charts/_components/multi-line-lightweight-time-scale-selector"
import { formatUsdPrice } from "@/lib/format-usd"
import { useCoinGeckoQuotesBulk } from "@/hooks/use-coingecko-quotes"
import {
  HoldingsValueChart,
  type HoldingsChartHoverPoint,
} from "@/components/charts/holdings-value-chart"
import { useHoldingsValueOverTime } from "@/hooks/use-holdings-value-over-time"
import { COLOR_THEMES } from "@/components/color-picker"
import { generatePastelColors } from "@/lib/chart-colors"
import { getTokenLogoURL } from "@/lib/logo-overrides"
import { IconTriangleFill } from "symbols-react"

interface HoldingsGroupRow {
  group: {
    _id: string
    name: string
    icon?: string
    color?: string
  }
  positions: Array<{ coinId: string; holdings: number }>
  totalHoldings: number
  coinsWithHoldings: number
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/** Matches watchlist screener “Daily performance” cell (USD + Badge + %). */
function ChartRangePerformanceLabel(props: { deltaUsd: number; deltaPct: number }) {
  const { deltaUsd, deltaPct } = props
  const isPositive = deltaUsd > 0
  const isNegative = deltaUsd < 0
  const isNeutral = !isPositive && !isNegative
  const usdSign = isPositive ? "+" : isNegative ? "-" : ""

  return (
    <div className="mt-2 inline-flex flex-wrap items-center justify-start gap-2">
      <span
        className={cn(
          "font-berkeley-mono text-[11px] tabular-nums",
          isPositive && "text-emerald-400",
          isNegative && "text-rose-400",
          isNeutral && "text-muted-foreground",
        )}
      >
        {`${usdSign}${formatUsdPrice(Math.abs(deltaUsd))}`}
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
          className={cn("size-[4px] shrink-0 fill-current", isNegative && "rotate-180")}
        />
        {Math.abs(deltaPct).toFixed(2)}%
      </Badge>
    </div>
  )
}

export function OverviewHoldingsSection() {
  const [activeTimeScale, setActiveTimeScale] = useState<string>("30d")
  const [scrubHover, setScrubHover] = useState<HoldingsChartHoverPoint | null>(null)

  const groupsBreakdown = useQuery(api.watchlists.getMyHoldingsBreakdownByWatchlistGroup, {}) as
    | HoldingsGroupRow[]
    | undefined

  const positions = useMemo(() => {
    const byCoinId = new Map<string, number>()
    for (const row of groupsBreakdown ?? []) {
      for (const position of row.positions) {
        if (!Number.isFinite(position.holdings) || position.holdings <= 0) continue
        byCoinId.set(position.coinId, (byCoinId.get(position.coinId) ?? 0) + position.holdings)
      }
    }

    return Array.from(byCoinId.entries()).map(([coinId, holdings]) => ({ coinId, holdings }))
  }, [groupsBreakdown])

  const coinIds = useMemo(() => positions.map((row) => row.coinId), [positions])
  const quotesQuery = useCoinGeckoQuotesBulk(coinIds, { mode: "bestEffort" })

  const totalValueUsd = useMemo(() => {
    const quotes = quotesQuery.data ?? {}

    let sum = 0
    for (const row of positions) {
      const price = quotes[row.coinId]?.current_price ?? 0
      sum += row.holdings * price
    }
    return sum
  }, [positions, quotesQuery.data])

  const groupRows = useMemo(() => {
    const quotes = quotesQuery.data ?? {}
    const total = totalValueUsd

    const rows = (groupsBreakdown ?? []).map((row) => {
      let valueUsd = 0
      for (const position of row.positions) {
        const price = quotes[position.coinId]?.current_price ?? 0
        valueUsd += position.holdings * price
      }

      const percent = total > 0 ? clampPercent(valueUsd / total) : 0

      const tokensByValue = row.positions
        .map((position) => {
          const price = quotes[position.coinId]?.current_price ?? 0
          return {
            coinId: position.coinId,
            valueUsd: position.holdings * price,
          }
        })
        .filter((token) => Number.isFinite(token.valueUsd) && token.valueUsd > 0)
        .sort((a, b) => b.valueUsd - a.valueUsd)

      const tokenColors = generatePastelColors(tokensByValue.length)
      const tokenSegments = tokensByValue.map((token, index) => {
        const segmentPercent = valueUsd > 0 ? clampPercent(token.valueUsd / valueUsd) : 0
        return {
          coinId: token.coinId,
          percent: segmentPercent,
          color: tokenColors[index] ?? "hsl(0,0%,75%)",
        }
      })

      const tokenAvatarUrls = tokensByValue
        .slice(0, 4)
        .map((token) => {
          const quote = quotes[token.coinId]
          if (!quote) return null
          const imageUrl = getTokenLogoURL(quote.symbol, quote.image)
          if (!imageUrl) return null
          return { imageUrl, profileUrl: `/charts/${token.coinId}` }
        })
        .filter((avatar): avatar is { imageUrl: string; profileUrl: string } => avatar !== null)

      const tokenExtraCount = Math.max(0, tokensByValue.length - tokenAvatarUrls.length)

      const themeKey = (row.group.color ?? "default") as keyof typeof COLOR_THEMES
      const theme = COLOR_THEMES[themeKey] ?? COLOR_THEMES.default

      return {
        id: row.group._id,
        name: row.group.name,
        color: row.group.color ?? "default",
        valueUsd,
        percent,
        barClassName: theme.bg,
        tokenSegments,
        tokenAvatarUrls,
        tokenExtraCount,
      }
    })

    rows.sort((a, b) => b.valueUsd - a.valueUsd)
    return rows
  }, [groupsBreakdown, quotesQuery.data, totalValueUsd])

  const valueSeries = useHoldingsValueOverTime({ positions, timeScale: activeTimeScale })

  const hasHoldings = positions.length > 0
  const hasScrubHover = scrubHover !== null

  const displayValueUsd = hasScrubHover ? scrubHover.value : totalValueUsd

  const rangeChange = useMemo(() => {
    const points = valueSeries.points
    if (points.length < 2) return { deltaUsd: 0, deltaPct: 0, isAvailable: false }

    const startValue = points[0]?.value ?? 0
    const endValue = hasScrubHover ? scrubHover!.value : (points[points.length - 1]?.value ?? 0)

    if (!Number.isFinite(startValue) || startValue <= 0) return { deltaUsd: 0, deltaPct: 0, isAvailable: false }
    if (!Number.isFinite(endValue)) return { deltaUsd: 0, deltaPct: 0, isAvailable: false }

    const deltaUsd = endValue - startValue
    const deltaPct = (deltaUsd / startValue) * 100
    return {
      deltaUsd: Number.isFinite(deltaUsd) ? deltaUsd : 0,
      deltaPct: Number.isFinite(deltaPct) ? deltaPct : 0,
      isAvailable: true,
    }
  }, [hasScrubHover, scrubHover, valueSeries.points])

  return (
    <div className="w-full px-4 sm:px-6 py-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card
          className={cn(
            "lg:col-span-4 bg-white dark:bg-zinc-950/50 backdrop-blur-xl border border-zinc-800/20 dark:border-zinc-800/30 rounded-[20px] overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_1990px_rgba(47,44,48,0.3),0_4px_16px_rgba(0,0,0,0.6)] will-change-auto",
          )}
        >
          <CardHeader className="p-5 pt-0">
            <CardTitle className="sr-only mb-0 text-pretty text-balance text-sm font-medium text-zinc-600 dark:text-white/60">
              Portfolio value
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="flex flex-col items-start text-left">
              <div className="text-pretty text-balance text-3xl font-semibold tabular-nums text-zinc-950 dark:text-white">
                {formatUsdPrice(displayValueUsd)}
              </div>
              {hasHoldings && rangeChange.isAvailable ? (
                <ChartRangePerformanceLabel
                  deltaUsd={rangeChange.deltaUsd}
                  deltaPct={rangeChange.deltaPct}
                />
              ) : null}
            </div>

            {hasHoldings && groupRows.length > 0 ? (
              <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-[2px]">
                  <div className="flex h-full w-full gap-0.5">
                    {groupRows.map((row) => (
                      <div
                        key={row.id}
                        className={cn("h-full rounded-[2px] opacity-90", row.barClassName)}
                        style={{ width: `${Math.max(1, row.percent * 100)}%` }}
                        aria-hidden
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {!hasHoldings ? (
              <p className="mt-4 text-pretty text-xs text-zinc-600 dark:text-white/60">
                Add a quantity to any watchlist coin to see your holdings value here.
              </p>
            ) : null}

            {hasHoldings && groupRows.length > 0 ? (
              <div className="mt-5">
                <div className="mb-2 text-xs font-medium text-zinc-600 dark:text-white/60">
                  Holdings
                </div>
                <div className="space-y-2 divide-y divide-zinc-200/60 dark:divide-white/10">
                  {groupRows.map((row) => (
                    <div key={row.id} className="py-2">
                      {/* Single row: stacks | name | token bar | % */}
                      <div className="flex flex-row justify-between items-center gap-3">
                        <div className="flex flex-col">
                          <div className="flex flex-col items-start text-left gap-1">
                            <div className="min-w-0 truncate text-xs font-medium text-zinc-950 dark:text-white">
                              {row.name}
                            </div>
                            <div className="min-w-0 h-2 w-full overflow-hidden rounded-[2px]">
                              <div className="flex h-full w-full gap-0.5">
                                {row.tokenSegments.map((segment) => (
                                  <div
                                    key={segment.coinId}
                                    className="h-full rounded-[2px]"
                                    style={{
                                      width: `${Math.max(1, segment.percent * 100)}%`,
                                      backgroundColor: segment.color,
                                    }}
                                  />
                                ))}
                              </div>
                            </div>                        
                          </div>
                          <div className="text-[11px] font-medium tabular-nums text-zinc-600 dark:text-white/60">
                            {(row.percent * 100).toFixed(0)}%
                          </div>                       
                        </div>
                        <AvatarCircles
                          avatarUrls={row.tokenAvatarUrls}
                          numPeople={row.tokenExtraCount}
                          className="scale-[0.9] origin-left"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="relative lg:col-span-8 border-none bg-transparent">
         {/* Dot texture: visible in center, faded via elliptical radial mask at edges */}
          <div
            className="pointer-events-none absolute inset-0 z-[-1] size-full opacity-40 dark:opacity-30"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='1' fill='rgba(255,255,255,0.2)'/%3E%3C/svg%3E")`,
              backgroundRepeat: "repeat",
              maskImage:
                "radial-gradient(ellipse 62% 48% at 50% 48%, #000 28%, #000 42%, transparent 78%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 62% 48% at 50% 48%, #000 28%, #000 42%, transparent 78%)",
            }}
          />
          <CardHeader className="p-5 pb-2 flex flex-row items-center justify-end">
            <CardTitle className="sr-only mb-0 text-pretty text-balance text-sm font-medium text-zinc-600 dark:text-white/60">
              Value over time
            </CardTitle>
            <TimeScaleSelector activeTimeScale={activeTimeScale} setActiveTimeScale={setActiveTimeScale} />
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {!hasHoldings ? (
              <div className="flex h-[320px] items-center justify-center text-sm text-zinc-600 dark:text-white/60">
                No holdings to chart yet.
              </div>
            ) : (
              <HoldingsValueChart
                points={valueSeries.points}
                height={320}
                onHover={setScrubHover}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

