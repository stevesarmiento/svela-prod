'use client'

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@v1/ui/tabs"
import { Badge } from "@v1/ui/badge"
import { Button } from "@v1/ui/button"
import { cn } from "@v1/ui/cn"
import { Skeleton } from "@v1/ui/skeleton"
import { TokenLogo } from "@/components/token-logo"
import { formatUsdPrice } from "@/lib/format-usd"
import { getTokenLogoURL } from "@/lib/logo-overrides"
import { IconTriangleFill } from "symbols-react"
import { Spinner } from "@v1/ui/spinner"
import { toast } from "@v1/ui/use-toast"

export type MoversWindow = "24h" | "7d"
type OverviewStatus = "missing" | "fresh" | "stale"

interface OverviewMoversCardProps {
  window?: MoversWindow
  onWindowChange?: (window: MoversWindow) => void
  status: OverviewStatus
  watchlistCoinCount: number
  limited: boolean
  movers24h: MoversSnapshot
  movers7d: MoversSnapshot
  onRefreshNow: () => Promise<{
    scheduled: boolean
    reason: string
    coinsCount: number
    walletsCount: number
  }>
}

export interface MoverRow {
  coingeckoId: string
  name: string
  symbol: string
  logoUrl: string | null
  priceUsd: number
  changePct: number
  impactUsd: number | null
}

export interface MoversSnapshot {
  generatedAt: number
  coinCount: number
  missingMarketDataCount: number
  gainers: MoverRow[]
  losers: MoverRow[]
}

const SKELETON_ROW_KEYS = ["a", "b", "c", "d", "e"] as const

function clampPercentChange(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value > 9999) return 9999
  if (value < -9999) return -9999
  return value
}

function ChangeBadge(props: { pct: number }) {
  const pct = clampPercentChange(props.pct)
  const isPositive = pct > 0
  const isNegative = pct < 0
  const isNeutral = !isPositive && !isNegative

  return (
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
      {Math.abs(pct).toFixed(2)}%
    </Badge>
  )
}

function MoversSkeleton() {
  return (
    <Card className="border border-zinc-800/20 dark:border-zinc-800/30 rounded-[20px] bg-white dark:bg-zinc-950/50 overflow-hidden">
      <CardHeader className="p-5 pb-3">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-28" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-28 rounded-[10px]" />
            <Skeleton className="h-8 w-24 rounded-[10px]" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 pt-0 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <div className="space-y-2">
              {SKELETON_ROW_KEYS.map((k) => (
                <div key={`g-${k}`} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Skeleton className="size-7 rounded-full" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-5 w-14 rounded-md" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <div className="space-y-2">
              {SKELETON_ROW_KEYS.map((k) => (
                <div key={`l-${k}`} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Skeleton className="size-7 rounded-full" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-5 w-14 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function MoversList(props: {
  title: string
  rows: MoverRow[]
  tone: "positive" | "negative"
}) {
  return (
    <div className="space-y-2 min-w-0">
      <div className="text-xs font-medium text-zinc-600 dark:text-white/60">
        {props.title}
      </div>
      {props.rows.length === 0 ? (
        <div className="text-xs text-muted-foreground text-pretty">No data yet.</div>
      ) : (
        <ul className="space-y-2">
          {props.rows.map((row) => {
            const logo = getTokenLogoURL(row.symbol, row.logoUrl ?? undefined)
            return (
              <li key={row.coingeckoId} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <TokenLogo
                    src={logo}
                    alt={row.name}
                    sizePx={28}
                    fallbackText={row.symbol}
                    unoptimizedRemote
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-zinc-950 dark:text-white truncate">
                      {row.symbol.toUpperCase()}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {row.name}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <ChangeBadge pct={row.changePct} />
                  {row.impactUsd !== null ? (
                    <div
                      className={cn(
                        "text-[11px] font-berkeley-mono tabular-nums",
                        row.impactUsd > 0 && "text-emerald-400",
                        row.impactUsd < 0 && "text-rose-400",
                        row.impactUsd === 0 && "text-muted-foreground",
                      )}
                    >
                      {row.impactUsd > 0 ? "+" : row.impactUsd < 0 ? "-" : ""}
                      {formatUsdPrice(Math.abs(row.impactUsd))}
                    </div>
                  ) : (
                    <div className="text-[11px] font-berkeley-mono tabular-nums text-muted-foreground">
                      —
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function OverviewMoversCard(props: OverviewMoversCardProps) {
  const [windowInternal, setWindowInternal] = useState<MoversWindow>("24h")

  const window = props.window ?? windowInternal
  const setWindow = props.onWindowChange ?? setWindowInternal

  return (
    <OverviewMoversCardInner
      status={props.status}
      watchlistCoinCount={props.watchlistCoinCount}
      limited={props.limited}
      movers24h={props.movers24h}
      movers7d={props.movers7d}
      onRefreshNow={props.onRefreshNow}
      window={window}
      setWindow={setWindow}
    />
  )
}

function OverviewMoversCardInner(props: {
  window: MoversWindow
  setWindow: (window: MoversWindow) => void
} & Omit<OverviewMoversCardProps, "window" | "onWindowChange">) {
  const [isRefreshing, setIsRefreshing] = useState(false)

  const isLoading = props.status === "missing"
  if (isLoading) return <MoversSkeleton />

  const data = props.window === "7d" ? props.movers7d : props.movers24h

  const gainers = useMemo(() => data?.gainers ?? [], [data?.gainers])
  const losers = useMemo(() => data?.losers ?? [], [data?.losers])

  const hasAny = gainers.length > 0 || losers.length > 0

  return (
    <Card className="border border-zinc-800/20 dark:border-zinc-800/30 rounded-[20px] bg-white dark:bg-zinc-950/50 overflow-hidden">
      <CardHeader className="p-5 pb-3 space-y-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm font-medium text-zinc-950 dark:text-white text-balance">
              Movers
            </CardTitle>
            <div className="mt-1 text-[11px] text-muted-foreground text-pretty">
              {data.coinCount > 0
                ? `${data.coinCount} tokens${props.limited ? " • limited" : ""}${
                    data.missingMarketDataCount > 0
                      ? ` • ${data.missingMarketDataCount} missing quotes`
                      : ""
                  }`
                : "Add coins to a watchlist to track movers."}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={props.status === "fresh" ? "success" : "warning"}
              className="font-berkeley-mono text-[11px]"
            >
              {props.status === "fresh" ? "Fresh" : "Stale"}
            </Badge>

            <Tabs
              value={props.window}
              onValueChange={(value) => props.setWindow(value as MoversWindow)}
            >
              <TabsList className="p-0.5">
                <TabsTrigger value="24h" className="px-2 py-1 text-[12px]">
                  24h
                </TabsTrigger>
                <TabsTrigger value="7d" className="px-2 py-1 text-[12px]">
                  7d
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isRefreshing}
              onClick={async () => {
                if (isRefreshing) return
                setIsRefreshing(true)
                try {
                  const result = await props.onRefreshNow()
                  if (!result.scheduled) {
                    toast({
                      title: "Refresh skipped",
                      description:
                        result.reason === "cooldown"
                          ? "You refreshed recently. Try again in a moment."
                          : "Refresh could not be scheduled.",
                    })
                    return
                  }
                  toast({
                    title: "Refresh scheduled",
                    description: `Refreshing ${result.coinsCount} tokens and ${result.walletsCount} wallets.`,
                  })
                } catch (error) {
                  toast({
                    title: "Refresh failed",
                    description: error instanceof Error ? error.message : "Failed to refresh data.",
                    variant: "destructive",
                  })
                } finally {
                  setIsRefreshing(false)
                }
              }}
              className="h-8 rounded-[10px]"
            >
              {isRefreshing ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size={14} />
                  Refreshing…
                </span>
              ) : (
                "Refresh"
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-0">
        {!hasAny ? (
          <div className="text-xs text-muted-foreground text-pretty">
            No movers available for this selection yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MoversList title="Top gainers" rows={gainers} tone="positive" />
            <MoversList title="Top losers" rows={losers} tone="negative" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
