'use client'

import React, {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react'
import dynamic from 'next/dynamic'
import { cn } from '@v1/ui/cn'
import type { CoinMarketData } from '@/types/coins'
import { getAlignedPriceFromChartPoints } from '@/lib/aligned-price'
import { useCoinGeckoChartData } from '@/hooks/use-coingecko-chart-data'
import { useCoinGeckoQuote } from '@/hooks/use-coingecko-quotes'
import { useRealtimeQuote } from "@/hooks/use-realtime-quote"
import { PriceChart } from "./price-chart"
import { MarketMetrics } from "./market-metrics"
import { FloatingMarketFeedPageContext } from '@/components/floating-market-feed/floating-market-feed'
import type { IndicatorOhlcvBar } from './token-indicators-section'

const LazyTokenIndicatorsSection = dynamic(
  () =>
    import('./token-indicators-section').then(
      (module) => module.TokenIndicatorsSection,
    ),
  {
    ssr: false,
    loading: () => <TechnicalIndicatorsSkeleton />,
  },
)

interface OhlcvBar {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

function toEpochSeconds(time: unknown): number | null {
  if (typeof time === "number") return Math.floor(time > 1e10 ? time / 1000 : time)
  if (typeof time === "string") {
    const parsed = Number(time)
    if (Number.isFinite(parsed)) return Math.floor(parsed > 1e10 ? parsed / 1000 : parsed)
    const ms = Date.parse(time)
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
  }
  return null
}

function bucketizeOhlcv(
  points: ReadonlyArray<OhlcvBar>,
  bucketSeconds: number,
): OhlcvBar[] {
  if (!points.length) return []

  const out: Array<OhlcvBar> = []
  let currentBucketStart: number | null = null
  let current: OhlcvBar | null = null

  for (const point of points) {
    if (!Number.isFinite(point.time)) continue
    const bucketStart = Math.floor(point.time / bucketSeconds) * bucketSeconds

    if (currentBucketStart === bucketStart && current) {
      current.high = Math.max(current.high, point.high)
      current.low = Math.min(current.low, point.low)
      current.close = point.close
      current.volume += point.volume
      continue
    }

    if (current) out.push(current)
    currentBucketStart = bucketStart
    current = {
      time: bucketStart,
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      volume: point.volume,
    }
  }

  if (current) out.push(current)
  return out
}

const SECONDS_PER_DAY = 24 * 60 * 60

function TechnicalIndicatorsSkeleton() {
  return (
    <>
      <div className="col-span-12 mt-16 mb-4">
        <span className="text-2xl font-semibold text-white">Technical Indicators</span>
      </div>
      <div className="grid grid-cols-1 gap-6 col-span-12 md:grid-cols-12">
        <div className="col-span-12 md:col-span-6 h-[340px] rounded-2xl border border-zinc-800/70 bg-black/80 animate-pulse" />
        <div className="col-span-12 md:col-span-6 h-[340px] rounded-2xl border border-zinc-800/70 bg-black/80 animate-pulse" />
        <div className="col-span-12 h-[340px] rounded-2xl border border-zinc-800/70 bg-black/80 animate-pulse" />
      </div>
    </>
  )
}

interface TokenPageClientProps {
  id: string
  tokenData: CoinMarketData
  isPending?: boolean
}

export const TokenPageClient = memo(function TokenPageClient({
  id,
  tokenData,
  isPending,
}: TokenPageClientProps) {
  const [isTransitionPending, startTransition] = useTransition()
  const [activeTimeScale, setActiveTimeScale] = useState<string>("30d")
  const [shouldLoadIndicators, setShouldLoadIndicators] = useState(false)

  const deferredId = useDeferredValue(id)
  const deferredTokenData = useDeferredValue(tokenData)
  const deferredTimeScale = useDeferredValue(activeTimeScale)
  const indicatorsSentinelRef = useRef<HTMLDivElement | null>(null)

  const indicatorWindowDays = React.useMemo(() => {
    if (deferredTimeScale === '2y') return 60
    if (deferredTimeScale === 'max') return 30
    return 14
  }, [deferredTimeScale])

  const { chartData, volumeData, ohlcData, isLoading } = useCoinGeckoChartData(
    deferredId,
    deferredTimeScale,
    deferredTokenData.quote.USD,
  )

  const canStartRealtimeStream = Boolean(deferredId) && !isLoading && chartData.length >= 2
  const quoteQuery = useCoinGeckoQuote(deferredId)
  const realtimeSymbol = quoteQuery.data?.symbol ?? deferredTokenData.symbol

  const spotStatus = useRealtimeQuote({
    coingeckoId: deferredId,
    symbol: realtimeSymbol,
    enabled: Boolean(deferredId),
    streamEnabled: canStartRealtimeStream,
  })

  const metricsData = React.useMemo(() => {
    const quote = quoteQuery.data
    if (!quote) return null

    const alignedPrice = getAlignedPriceFromChartPoints(chartData) ?? quote.current_price

    return {
      current_price: alignedPrice,
      total_volume: quote.total_volume,
      market_cap: quote.market_cap,
      price_change_percentage_24h: quote.price_change_percentage_24h,
      market_cap_rank: quote.market_cap_rank,
      circulating_supply: quote.circulating_supply ?? null,
      max_supply: quote.max_supply ?? null,
      symbol: quote.symbol,
    }
  }, [chartData, quoteQuery.data])

  const explainTokenName = quoteQuery.data?.name ?? deferredTokenData.name

  const handleTimeScaleChange = useCallback((scale: string) => {
    startTransition(() => {
      setActiveTimeScale(scale)
    })
  }, [])

  const indicatorData = React.useMemo<IndicatorOhlcvBar[]>(() => {
    if (ohlcData.length === 0) return []

    const volumeByEpoch = new Map<number, number>()
    for (const volumePoint of volumeData) {
      const epoch = toEpochSeconds(volumePoint.time)
      if (epoch == null) continue
      if (!Number.isFinite(volumePoint.value)) continue
      volumeByEpoch.set(epoch, volumePoint.value)
    }

    const outByEpoch = new Map<number, IndicatorOhlcvBar>()
    for (const point of ohlcData) {
      const epoch = toEpochSeconds(point.time)
      if (epoch == null) continue

      outByEpoch.set(epoch, {
        time: epoch,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: volumeByEpoch.get(epoch) ?? 0,
      })
    }

    return Array.from(outByEpoch.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, value]) => value)
  }, [ohlcData, volumeData])

  const dailyOhlcv = React.useMemo(() => {
    if (indicatorData.length === 0) return []
    const daily = bucketizeOhlcv(indicatorData, SECONDS_PER_DAY)
    return daily.map((bar) => ({
      time: bar.time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }))
  }, [indicatorData])

  useEffect(() => {
    if (shouldLoadIndicators) return
    const node = indicatorsSentinelRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setShouldLoadIndicators(true)
        observer.disconnect()
      },
      { rootMargin: '800px 0px' },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [shouldLoadIndicators])

  const showPending = isPending || isTransitionPending || isLoading || quoteQuery.isLoading

  return (
    <main className={cn("mx-auto py-6 relative z-10", showPending && "opacity-90 transition-opacity duration-200")}>
      {/* News moved into the floating market feed (bottom right); scope it to this coin. */}
      <FloatingMarketFeedPageContext
        displayName={explainTokenName}
        tokenSymbol={deferredTokenData.symbol}
        tokenLogoURI={deferredTokenData.image}
        tokenFeedCoinId={deferredId}
      />
      <div className="grid grid-cols-1 md:grid-cols-12">
        <div className="col-span-12 min-w-0 sm:space-y-0">
          <PriceChart
            coinId={deferredId}
            initialData={deferredTokenData.quote.USD}
            activeTimeScale={deferredTimeScale}
            setActiveTimeScale={handleTimeScaleChange}
            isPending={showPending}
            spotStatus={spotStatus}
          />
        </div>

        <div className="col-span-12 my-12 mt-8">
          {metricsData ? (
            <MarketMetrics data={metricsData} isPending={showPending} dailyOhlcv={dailyOhlcv} />
          ) : quoteQuery.error ? (
            <div className={`h-[120px] bg-zinc-950/50 border border-zinc-800/30 rounded-[20px] flex items-center justify-center ${showPending ? 'opacity-60' : ''}`}>
              <div className="text-center">
                <p className="text-xs text-red-400 mb-2">Failed to load market data</p>
                <p className="text-xs text-muted-foreground">ID: {deferredId}</p>
                <p className="text-xs text-muted-foreground">Error: {quoteQuery.error?.message}</p>
              </div>
            </div>
          ) : (
            <div className={`h-[120px] bg-zinc-950/50 border border-zinc-800/30 rounded-[20px] flex items-center justify-center ${showPending ? 'opacity-60' : ''}`}>
              <div className="text-center">
                <div className="animate-spin motion-reduce:animate-none rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Loading market data...</p>
                <p className="text-xs text-muted-foreground">ID: {deferredId}</p>
              </div>
            </div>
          )}
        </div>

        <div ref={indicatorsSentinelRef} className="col-span-12" />
        {shouldLoadIndicators ? (
          <LazyTokenIndicatorsSection
            coinId={deferredId}
            tokenName={explainTokenName}
            tokenSymbol={deferredTokenData.symbol}
            tokenImage={deferredTokenData.image}
            timeframe={deferredTimeScale}
            indicatorData={indicatorData}
            indicatorWindowDays={indicatorWindowDays}
            showPending={showPending}
            isLoading={isLoading}
            metricsData={metricsData}
          />
        ) : (
          <TechnicalIndicatorsSkeleton />
        )}
      </div>
    </main>
  )
})
