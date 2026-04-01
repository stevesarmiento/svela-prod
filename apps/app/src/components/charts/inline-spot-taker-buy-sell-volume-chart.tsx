'use client'

import { useEffect, useMemo, useRef, useState } from "react"
import { Skeleton } from "@v1/ui/skeleton"
import { useSpotTakerBuySellVolumeHistory } from "@/hooks/use-spot-taker-buy-sell-volume-history"
import { cn } from "@v1/ui/cn"
import { useIsomorphicTheme } from "@/hooks/use-isomorphic-theme"
import { motion, useReducedMotion } from "motion/react"

interface InlineSpotTakerBuySellVolumeChartProps {
  baseSymbol: string
  quoteSymbol?: string
  exchange?: string
  interval?: string
  limit?: number
  className?: string
}

function toPairSymbol(baseSymbol: string, quoteSymbol: string): string | null {
  const base = baseSymbol.trim().toUpperCase()
  const quote = quoteSymbol.trim().toUpperCase()
  if (!base || !quote) return null
  if (base === quote) return null
  return `${base}${quote}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

const SPOT_SCALE_CAP = 4
// Darker pastels for dark mode (less neon), mapped as: buy=top, sell=bottom.
const BUY_PASTEL = "hsl(0, 0.00%, 68.60%)" // amber
const SELL_PASTEL = "hsl(0, 0.00%, 45.50%)" // yellow

function toThemeAwareColor(color: string, isDarkMode: boolean): string {
  if (isDarkMode) return color
  return color.replace(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/, (_m, h, s, l) => {
    // On light backgrounds, increase contrast without going muddy.
    const nextS = clamp(Number.parseInt(s) + 12, 0, 100)
    const nextL = clamp(Number.parseInt(l) - 24, 0, 100)
    return `hsl(${h}, ${nextS}%, ${nextL}%)`
  })
}

export function InlineSpotTakerBuySellVolumeChart({
  baseSymbol,
  quoteSymbol = "USDT",
  exchange = "Binance",
  interval = "4h",
  limit = 42,
  className,
}: InlineSpotTakerBuySellVolumeChartProps) {
  const { isDarkMode } = useIsomorphicTheme()
  const shouldReduceMotion = useReducedMotion()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          setIsInView(true)
          observer.disconnect()
          return
        }
      },
      { root: null, rootMargin: "200px 0px" },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const pairSymbol = useMemo(() => toPairSymbol(baseSymbol, quoteSymbol), [baseSymbol, quoteSymbol])

  const historyQuery = useSpotTakerBuySellVolumeHistory({
    exchange,
    symbol: pairSymbol ?? "",
    interval,
    limit,
    enabled: isInView && pairSymbol !== null,
  })

  const spotPoints = historyQuery.data?.spot ?? []
  const futuresPoints = historyQuery.data?.futures ?? []

  const series = useMemo(() => {
    const spotByTime = new Map<number, { buy: number; sell: number }>()
    const futuresByTime = new Map<number, { buy: number; sell: number }>()

    for (const p of spotPoints) {
      if (typeof p.time !== "number") continue
      if (!Number.isFinite(p.takerBuyVolumeUsd) || !Number.isFinite(p.takerSellVolumeUsd)) continue
      spotByTime.set(p.time, { buy: p.takerBuyVolumeUsd, sell: p.takerSellVolumeUsd })
    }

    for (const p of futuresPoints) {
      if (typeof p.time !== "number") continue
      if (!Number.isFinite(p.takerBuyVolumeUsd) || !Number.isFinite(p.takerSellVolumeUsd)) continue
      futuresByTime.set(p.time, { buy: p.takerBuyVolumeUsd, sell: p.takerSellVolumeUsd })
    }

    const times = Array.from(new Set([...spotByTime.keys(), ...futuresByTime.keys()])).sort((a, b) => a - b)
    const visibleTimes = times.slice(Math.max(0, times.length - limit))

    const spotBuy: Array<number> = []
    const spotSell: Array<number> = []
    const futuresBuy: Array<number> = []
    const futuresSell: Array<number> = []

    let maxVolume = 0
    for (const t of visibleTimes) {
      const s = spotByTime.get(t)
      const f = futuresByTime.get(t)
      const sb = s?.buy ?? 0
      const ss = s?.sell ?? 0
      const fb = f?.buy ?? 0
      const fs = f?.sell ?? 0
      spotBuy.push(sb)
      spotSell.push(ss)
      futuresBuy.push(fb)
      futuresSell.push(fs)
      maxVolume = Math.max(maxVolume, sb, ss, fb, fs)
    }

    const spotMax = Math.max(
      spotBuy.reduce((acc, v) => Math.max(acc, v), 0),
      spotSell.reduce((acc, v) => Math.max(acc, v), 0),
    )
    const futuresMax = Math.max(
      futuresBuy.reduce((acc, v) => Math.max(acc, v), 0),
      futuresSell.reduce((acc, v) => Math.max(acc, v), 0),
    )

    const baseMax = Math.max(spotMax, futuresMax)
    const spotScale = spotMax > 0 && baseMax > spotMax ? Math.min(SPOT_SCALE_CAP, baseMax / spotMax) : 1

    return {
      spotBuy,
      spotSell,
      futuresBuy,
      futuresSell,
      maxVolume: baseMax,
      spotScale,
      count: visibleTimes.length,
    }
  }, [spotPoints, futuresPoints, limit])

  const title = useMemo(() => {
    if (!pairSymbol) return "Taker buy/sell unavailable"
    if (historyQuery.isLoading) return `${exchange} ${pairSymbol} taker buy/sell loading...`
    if (historyQuery.isError) return `${exchange} ${pairSymbol} taker buy/sell failed`
    const scaleText = series.spotScale > 1.01 ? `, spot scaled ×${series.spotScale.toFixed(1)}` : ""
    return `${exchange} ${pairSymbol} taker buy/sell volume (${interval}) — solid=futures, faint=spot${scaleText}`
  }, [pairSymbol, historyQuery.isLoading, historyQuery.isError, exchange, interval, series.spotScale])

  const buyColor = useMemo(() => toThemeAwareColor(BUY_PASTEL, isDarkMode), [isDarkMode])
  const sellColor = useMemo(() => toThemeAwareColor(SELL_PASTEL, isDarkMode), [isDarkMode])

  function DataUnavailable() {
    return (
      <div
        ref={containerRef}
        className={cn(
          "h-8 text-center rounded-sm overflow-hidden bg-transparent flex items-center justify-center",
          "text-[10px] font-medium text-muted-foreground/70 font-berkeley-mono",
          className ?? "w-full",
        )}
        title={title}
      >
        Data Unavailable
      </div>
    )
  }

  if (!pairSymbol) return <DataUnavailable />

  if (historyQuery.isLoading && spotPoints.length === 0 && futuresPoints.length === 0) {
    return <Skeleton className={cn("h-8 rounded-sm", className ?? "w-56")} />
  }

  if (historyQuery.isError) return <DataUnavailable />
  if (spotPoints.length === 0 && futuresPoints.length === 0) return <DataUnavailable />
  if (series.maxVolume <= 0) return <DataUnavailable />
  if (series.count <= 0) return <DataUnavailable />

  const width = 180
  const height = 32
  const baselineY = 16
  const barMax = 14
  const gap = 2
  const count = series.count
  const barWidth = count > 0 ? (width - gap * Math.max(0, count - 1)) / count : 0
  const futuresWidth = Math.max(0, barWidth)

  const bars = Array.from({ length: count }, (_, index) => {
    const maxVolume = series.maxVolume

    const futuresBuy = series.futuresBuy[index] ?? 0
    const futuresSell = series.futuresSell[index] ?? 0
    const spotBuy = series.spotBuy[index] ?? 0
    const spotSell = series.spotSell[index] ?? 0

    const futuresBuyH = clamp(maxVolume > 0 ? (futuresBuy / maxVolume) * barMax : 0, 0, barMax)
    const futuresSellH = clamp(maxVolume > 0 ? (futuresSell / maxVolume) * barMax : 0, 0, barMax)
    const spotBuyH = clamp(
      maxVolume > 0 ? ((spotBuy * series.spotScale) / maxVolume) * barMax : 0,
      0,
      barMax,
    )
    const spotSellH = clamp(
      maxVolume > 0 ? ((spotSell * series.spotScale) / maxVolume) * barMax : 0,
      0,
      barMax,
    )

    const x = index * (barWidth + gap)
    const futuresX = x
    const futuresCapInset = Math.min(0.4, futuresWidth / 2)
    const futuresCapX1 = futuresX + futuresCapInset
    const futuresCapX2 = futuresX + Math.max(0, futuresWidth) - futuresCapInset
    const futuresCapStrokeWidth = 0.5
    const barKey = `${exchange}-${interval}-${index}`

    return (
      <g key={barKey}>
        {/* Spot (faint, behind) */}
        <rect
          x={x}
          y={baselineY - spotBuyH}
          width={Math.max(0, barWidth)}
          height={spotBuyH}
          fill={buyColor}
          opacity={0.9}
        />
        <rect
          x={x}
          y={baselineY}
          width={Math.max(0, barWidth)}
          height={spotSellH}
          fill={sellColor}
          opacity={0.9}
        />

        {/* Futures (solid, on top) */}
        <rect
          x={futuresX}
          y={baselineY - futuresBuyH}
          width={Math.max(0, futuresWidth)}
          height={futuresBuyH}
          fill={buyColor}
          opacity={0.28}
        />
        {futuresBuyH > 0 && futuresCapX2 > futuresCapX1 ? (
          <line
            x1={futuresCapX1}
            y1={baselineY - futuresBuyH}
            x2={futuresCapX2}
            y2={baselineY - futuresBuyH}
            stroke={buyColor}
            strokeOpacity={1}
            strokeWidth={futuresCapStrokeWidth}
            strokeLinecap="butt"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        <rect
          x={futuresX}
          y={baselineY}
          width={Math.max(0, futuresWidth)}
          height={futuresSellH}
          fill={sellColor}
          opacity={0.28}
        />
        {futuresSellH > 0 && futuresCapX2 > futuresCapX1 ? (
          <line
            x1={futuresCapX1}
            y1={baselineY + futuresSellH}
            x2={futuresCapX2}
            y2={baselineY + futuresSellH}
            stroke={sellColor}
            strokeOpacity={1}
            strokeWidth={futuresCapStrokeWidth}
            strokeLinecap="butt"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </g>
    )
  })

  return (
    <div
      ref={containerRef}
      className={cn("h-8 rounded-sm overflow-hidden bg-transparent", className ?? "w-56")}
      title={title}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="100%"
        className="size-full"
        shapeRendering="crispEdges"
      >
        {shouldReduceMotion ? (
          <g>{bars}</g>
        ) : (
          <motion.g
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            style={{ transformBox: "view-box", transformOrigin: "50% 50%" }}
          >
            {bars}
          </motion.g>
        )}
      </svg>
    </div>
  )
}

