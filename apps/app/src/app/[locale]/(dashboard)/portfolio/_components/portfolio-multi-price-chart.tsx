'use client'

import { memo, useDeferredValue, useMemo, useState } from "react"
import { Card, CardContent, CardHeader } from "@v1/ui/card"
import { cn } from "@v1/ui/cn"
import { AvatarCircles } from "@v1/ui/token-stacks"
import type { CoinMarketData } from "@/types/coins"
import { useIsomorphicTheme } from "@/hooks/use-isomorphic-theme"
import { useCoinGeckoBulkChartData } from "@/hooks/use-coingecko-bulk-chart-data"
import { generatePastelColors, addOpacityToColor } from "@/lib/chart-colors"
import { getTokenLogoURL } from "@/lib/logo-overrides"
import { ChartLoadingSkeleton } from "@/components/charts/chart-loading-skeleton"
import { TimeScaleSelector } from "../../charts/_components/multi-line-lightweight-time-scale-selector"
import { Liveline } from "liveline"
import type { LivelinePoint, LivelineSeries } from "liveline"

interface PortfolioMultiPriceChartProps {
  coins: CoinMarketData[]
  activeTimeScale: string
  setActiveTimeScale: (scale: string) => void
}

function toUnixSeconds(time: unknown): number | null {
  if (typeof time === "number") return Number.isFinite(time) ? time : null
  if (typeof time === "string") {
    // numeric seconds (our `/api/coingecko/market-chart` route returns seconds)
    const asNumber = Number(time)
    if (Number.isFinite(asNumber)) return asNumber

    // date string (lightweight-charts "BusinessDay" style)
    const [year, month, day] = time.split("-").map((part) => Number(part))
    if (!year || !month || !day) return null
    return Math.floor(Date.UTC(year, month - 1, day) / 1000)
  }

  if (typeof time === "object" && time) {
    const maybe = time as { year?: unknown; month?: unknown; day?: unknown }
    const year = typeof maybe.year === "number" ? maybe.year : null
    const month = typeof maybe.month === "number" ? maybe.month : null
    const day = typeof maybe.day === "number" ? maybe.day : null
    if (!year || !month || !day) return null
    return Math.floor(Date.UTC(year, month - 1, day) / 1000)
  }
  return null
}

export const PortfolioMultiPriceChart = memo(function PortfolioMultiPriceChart({
  coins,
  activeTimeScale,
  setActiveTimeScale,
}: PortfolioMultiPriceChartProps) {
  const { isDarkMode } = useIsomorphicTheme()
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const deferredCoins = useDeferredValue(coins)
  const deferredTimeScale = useDeferredValue(activeTimeScale)

  const { series, isLoading } = useCoinGeckoBulkChartData(deferredCoins, deferredTimeScale)

  const seriesWithColors = useMemo(() => {
    if (!series.length) return []
    const colors = generatePastelColors(series.length)

    return series.map((row, index) => {
      const baseColor = colors[index] || `hsl(${Math.random() * 360}, 40%, 75%)`
      const themeAwareColor = isDarkMode
        ? baseColor
        : baseColor.replace(
            /hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/,
            (_, h, s, l) => `hsl(${h}, ${Math.min(100, Number.parseInt(s) + 20)}%, ${Math.max(30, Number.parseInt(l) - 40)}%)`,
          )

      return { ...row, color: themeAwareColor }
    })
  }, [isDarkMode, series])

  const latestValuesById = useMemo(() => {
    const map = new Map<string, { latestValue: number; color: string; symbol: string; name: string }>()
    for (const row of seriesWithColors) {
      const last = row.data[row.data.length - 1]
      const latestValue = typeof last?.value === "number" ? last.value : 0
      map.set(row.id, {
        latestValue,
        color: row.color ?? "hsl(0,0%,60%)",
        symbol: row.symbol,
        name: row.name,
      })
    }
    return map
  }, [seriesWithColors])

  const livelineSeries = useMemo((): LivelineSeries[] => {
    const isHovering = Boolean(hoveredId)

    return seriesWithColors
      .map((row): LivelineSeries | null => {
        const data: LivelinePoint[] = []
        for (const point of row.data) {
          const time = toUnixSeconds(point.time)
          if (time === null) continue
          if (!Number.isFinite(point.value)) continue
          data.push({ time, value: point.value })
        }

        const latestValue = data[data.length - 1]?.value
        if (typeof latestValue !== "number") return null

        const isDimmed = isHovering && hoveredId !== row.id
        const baseColor = row.color ?? "hsl(0,0%,60%)"
        const color = isDimmed ? addOpacityToColor(baseColor, 0.25) : baseColor
        const latestPctText = `${latestValue > 0 ? "+" : ""}${latestValue.toFixed(2)}%`

        return {
          id: row.id,
          data,
          value: latestValue,
          color,
          label: `${row.symbol.toUpperCase()} ${latestPctText}`,
        }
      })
      .filter((row): row is LivelineSeries => row !== null)
  }, [hoveredId, seriesWithColors])

  const windowSecs = useMemo(() => {
    let min: number | null = null
    let max: number | null = null

    for (const s of livelineSeries) {
      const first = s.data[0]?.time
      const last = s.data[s.data.length - 1]?.time
      if (typeof first !== "number" || typeof last !== "number") continue
      if (min === null || first < min) min = first
      if (max === null || last > max) max = last
    }

    if (min === null || max === null) return 30
    return Math.max(30, max - min)
  }, [livelineSeries])

  const avatarData = useMemo(() => {
    return deferredCoins
      .slice(0, 6)
      .map((coin) => {
        const logoUrl = getTokenLogoURL(coin.symbol, coin.image)
        if (!logoUrl) return null
        return { imageUrl: logoUrl, profileUrl: `/charts/${coin.id}` }
      })
      .filter((item): item is { imageUrl: string; profileUrl: string } => item !== null)
  }, [deferredCoins])

  return (
    <div
      className={cn(
        "grid grid-cols-12 gap-0 rounded-[16px] dark:bg-zinc-950/50 bg-zinc-100/50 border dark:border-zinc-800/50 border-zinc-800/10 overflow-hidden p-1",
      )}
    >
      {/* Legend */}
      <div className="flex flex-col col-span-3 p-3 pt-3 space-y-2">
        <div className="text-xs text-muted-foreground">
          {coins.length} token{coins.length === 1 ? "" : "s"}
        </div>

        <div className="flex flex-col gap-2">
          {deferredCoins.map((coin) => {
            const meta = latestValuesById.get(coin.id.toString())
            if (!meta) return null

            return (
              <div
                key={coin.id}
                className={cn(
                  "relative -m-2 flex items-center gap-2 overflow-hidden rounded-lg p-2 group hover:bg-white/10",
                  hoveredId && hoveredId !== coin.id.toString() ? "opacity-40" : "opacity-100",
                )}
                style={{ backgroundColor: addOpacityToColor(meta.color, 0.1) }}
                onMouseEnter={() => setHoveredId(coin.id.toString())}
                onMouseLeave={() => setHoveredId(null)}
              >
                <div className="h-8 w-1 rounded-full" style={{ backgroundColor: meta.color }} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{meta.symbol.toUpperCase()}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{meta.name}</div>
                </div>
                <div
                  className={cn(
                    "text-xs font-diatype-mono tabular-nums",
                    meta.latestValue >= 0 ? "text-green-600" : "text-red-600",
                  )}
                >
                  {meta.latestValue >= 0 ? "+" : ""}
                  {meta.latestValue.toFixed(2)}%
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Chart */}
      <div className="col-span-9 dark:bg-zinc-950/50 bg-white border dark:border-zinc-800/30 border-zinc-800/20 rounded-[13px] overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_1990px_rgba(47,44,48,0.3),0_4px_16px_rgba(0,0,0,0.6)]">
        <div className="p-0 relative">
          <Card className="border-none bg-transparent">
            <CardHeader className="flex flex-row items-center justify-between">
              {avatarData.length > 0 ? (
                <AvatarCircles avatarUrls={avatarData} className="scale-75 -ml-2" />
              ) : (
                <div />
              )}
              <TimeScaleSelector activeTimeScale={activeTimeScale} setActiveTimeScale={setActiveTimeScale} />
            </CardHeader>
            <CardContent className="pl-8">
              <div className="p-0 relative">
                {coins.length > 0 && livelineSeries.length === 0 ? (
                  <div className="relative h-[400px]">
                    <ChartLoadingSkeleton height={400} lines={Math.max(1, coins.length)} className="opacity-80" />
                  </div>
                ) : livelineSeries.length === 0 && !isLoading ? (
                  <div className="flex items-center justify-center h-[400px]">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">No tokens to display</p>
                    </div>
                  </div>
                ) : (
                  <div className="h-[400px] w-full">
                    <Liveline
                      data={[]}
                      value={0}
                      series={livelineSeries}
                      theme={isDarkMode ? "dark" : "light"}
                      color={isDarkMode ? "#e5e7eb" : "#0f172a"}
                      lineWidth={2}
                      window={windowSecs}
                      grid={false}
                      fill={false}
                      pulse={false}
                      badge={false}
                      momentum={false}
                      scrub
                      tooltipY={-9999}
                      tooltipOutline={false}
                      formatTime={() => ""}
                      formatValue={(v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`}
                      padding={{ top: 12, right: 12, bottom: 12, left: 12 }}
                      className="size-full"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
})

