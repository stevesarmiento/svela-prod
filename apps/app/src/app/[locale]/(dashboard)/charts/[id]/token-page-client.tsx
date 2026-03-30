'use client'

import React, { useState, useTransition, useDeferredValue, useCallback, memo } from 'react'
import { PriceChart } from "./price-chart"
import { MarketMetrics } from "./market-metrics"
import type { CoinMarketData } from '@/types/coins'
import { LiquidationHistoryChart } from "./liquidation-history-chart"
import { SectionHeader } from "../_components/section-header"
import { IconBinocularsFill, IconDropFill, IconCircleDottedAndCircle } from "symbols-react"
import { OpenInterestChart } from './open-interest-chart'
import { TakerBuySell } from './taker-buy-sell'
import { MarketVisionChart } from './marketvision-chart'
import { BollingerBandsChart } from './bollinger-bands-chart'
import { BBWPChart } from './bbwp-chart'
import { useCoinGeckoChartData } from '@/hooks/use-coingecko-chart-data'
import { useCoinGeckoQuote } from '@/hooks/use-coingecko-quotes'
import { marketVisionConfig } from '@/hooks/market-vision/market-vision-config'
import { useScrollThreshold } from '@/hooks/use-scroll-effect'

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


interface TokenPageClientProps {
  id: string
  tokenData: CoinMarketData
  isPending?: boolean
}

export const TokenPageClient = memo(function TokenPageClient({ id, tokenData, isPending }: TokenPageClientProps) {
  // React 19: Add concurrent features
  const [isTransitionPending, startTransition] = useTransition()
  
  // React 19: Defer expensive computations
  const deferredId = useDeferredValue(id)
  const deferredTokenData = useDeferredValue(tokenData)

  // Use optimized scroll hook - eliminates useState/useEffect pattern
  const isSticky = useScrollThreshold(100)
  
  // Local state for active time scale (this is fine - it's not derived from props)
  const [activeTimeScale, setActiveTimeScale] = useState<string>("30d")
  const deferredTimeScale = useDeferredValue(activeTimeScale)

  // React 19: Use deferred values for data fetching
  const { volumeData, ohlcData, isLoading } = useCoinGeckoChartData(
    deferredId, 
    deferredTimeScale, 
    deferredTokenData.quote.USD
  )

  // Canonical quote source for headline + metrics (keeps price consistent everywhere).
  const quoteQuery = useCoinGeckoQuote(deferredId)

  const metricsData = React.useMemo(() => {
    const quote = quoteQuery.data
    if (!quote) return null

    return {
      current_price: quote.current_price,
      total_volume: quote.total_volume,
      market_cap: quote.market_cap,
      price_change_percentage_24h: quote.price_change_percentage_24h,
      market_cap_rank: quote.market_cap_rank,
      circulating_supply: quote.circulating_supply ?? null,
      max_supply: quote.max_supply ?? null,
      symbol: quote.symbol,
    }
  }, [quoteQuery.data])

  // React 19: Enhanced time scale change handler with transition
  const handleTimeScaleChange = useCallback((scale: string) => {
    startTransition(() => {
      setActiveTimeScale(scale)
    })
  }, [setActiveTimeScale])

  // React 19: Optimized indicator data with deferred values
  const indicatorData = React.useMemo(() => {
    if (ohlcData.length === 0) return []

    const volumeByEpoch = new Map<number, number>()
    for (const volumePoint of volumeData) {
      const epoch = toEpochSeconds(volumePoint.time)
      if (epoch == null) continue
      if (!Number.isFinite(volumePoint.value)) continue
      volumeByEpoch.set(epoch, volumePoint.value)
    }

    const outByEpoch = new Map<number, { time: number; open: number; high: number; low: number; close: number; volume: number }>()

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

  // React 19: Show pending states
  const showPending = isPending || isTransitionPending || isLoading || quoteQuery.isLoading

  return (
    <main className={`mx-auto py-6 px-4 relative z-10 ${showPending ? 'opacity-90 transition-opacity duration-200' : ''}`}>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="col-span-12 sm:space-y-0 sticky top-0 z-[100] will-change-transform">
          <div className={`${isSticky ? 'pt-4' : 'pt-0'}`}>
            <PriceChart 
              coinId={deferredId}
              initialData={deferredTokenData.quote.USD}
              activeTimeScale={deferredTimeScale}
              setActiveTimeScale={handleTimeScaleChange}
              isPending={showPending}
            />              
          </div>
        </div>
        
        <div className="col-span-12">
          {metricsData ? (
            <MarketMetrics data={metricsData} isPending={showPending} />
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

        <SectionHeader title="Market Vision" icon={IconCircleDottedAndCircle} className="col-span-12 mt-24" />

        <div className="col-span-12">
          {isLoading ? (
            <div className={`h-[250px] bg-zinc-950/50 border border-zinc-800/30 rounded-[20px] flex items-center justify-center ${showPending ? 'opacity-60' : ''}`}>
              <div className="text-center">
                <div className="animate-spin motion-reduce:animate-none rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Loading Market Vision data...</p>
              </div>
            </div>
          ) : (
            <MarketVisionChart
              data={indicatorData}
              config={marketVisionConfig}
              height={250}
              showTimeAxis={false}
            />
          )}
        </div>

        <div className="col-span-12">
          {isLoading ? (
            <div className={`h-[250px] bg-zinc-950/50 border border-zinc-800/30 rounded-[20px] flex items-center justify-center ${showPending ? 'opacity-60' : ''}`}>
              <div className="text-center">
                <div className="animate-spin motion-reduce:animate-none rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Loading Bollinger Bands data...</p>
              </div>
            </div>
          ) : (
            <BollingerBandsChart
              data={indicatorData}
              config={{
                drawRSI: true,
                drawMFI: false,
                highlightBreaches: true,
                length: 14,
                source: 'hlc3',
                bbLength: 20, // Reduced from 50 to 20 for testing
                multiplier: 2.0,
                lineWidth: 2,
                fillOpacity: 0.1
              }}
              height={250}
              showTimeAxis={false}
            />
          )}
        </div>

        <div className="col-span-12">
          {isLoading ? (
            <div className={`h-[250px] bg-zinc-950/50 border border-zinc-800/30 rounded-[20px] flex items-center justify-center ${showPending ? 'opacity-60' : ''}`}>
              <div className="text-center">
                <div className="animate-spin motion-reduce:animate-none rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Loading BBWP data...</p>
              </div>
            </div>
          ) : (
            <BBWPChart
              data={indicatorData}
              config={{
                priceSource: 'close',
                basisType: 'SMA',
                basisLength: 7,
                lookback: 100,
                maType: 'SMA',
                maLength: 5,
                extremeHigh: 98,
                extremeLow: 2,
                colorType: 'Spectrum',
                spectrumPreset: '5point',
                lineWidth: 2,
                maWidth: 2,
              }}
              height={250}
              showTimeAxis={false}
            />
          )}
        </div>

        <SectionHeader title="Liquidation & Open Interest" icon={IconDropFill} className="col-span-12 mt-24" />

        <div className={`col-span-12 ${showPending ? 'opacity-90' : ''}`}>
          <LiquidationHistoryChart
            coinId={deferredId}
            interval="1d"
            exchangeList="Binance, Bybit, OKX, Gate, HTX, Hyperliquid, CoinEx, Bitmex, Bitfinex"
            limit={200}
          />              
        </div>

        <div className={`col-span-12 ${showPending ? 'opacity-90' : ''}`}>
        <OpenInterestChart
          coinId={deferredId}
          interval="1d"
          limit={30}
          unit="usd"
        />              
        </div>
        
        <SectionHeader title="Buy/Sell Pressure by Exchange" icon={IconBinocularsFill} className="col-span-12 mt-24" />

        <div className={`col-span-12 ${showPending ? 'opacity-90' : ''}`}>
          <TakerBuySell
            coinId={deferredId}
            range="24h"
          />
        </div>
      </div>
    </main>
  )
})