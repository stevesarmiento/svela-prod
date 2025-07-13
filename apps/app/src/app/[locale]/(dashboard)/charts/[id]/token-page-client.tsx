'use client'

import React, { useState, useEffect } from 'react'
import { PriceChart } from "./price-chart"
import { MarketMetrics } from "./market-metrics"
import { CoinMarketData } from '@/types/coins'
import { LiquidationHistoryChart } from "./liquidation-history-chart"
import { SectionHeader } from "../_components/section-header"
import { IconBinocularsFill, IconDropFill, IconCircleDottedAndCircle } from "symbols-react"
import { OpenInterestChart } from './open-interest-chart'
import { TakerBuySell } from './taker-buy-sell'
import { MarketVisionChart } from './marketvision-chart'
import { BollingerBandsChart } from './bollinger-bands-chart'
import { useCoinGeckoChartData } from '@/hooks/use-coingecko-chart-data'
import { marketVisionConfig } from '@/hooks/market-vision/market-vision-config'


interface TokenPageClientProps {
  id: string
  tokenData: CoinMarketData
}

export function TokenPageClient({ id, tokenData }: TokenPageClientProps) {
  const [activeTimeScale, setActiveTimeScale] = useState<string>("max")
  const [isSticky, setIsSticky] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      // Check if we've scrolled past the initial position where sticky would trigger
      // Adjust this threshold based on your header height and layout
      const scrollThreshold = 100 // Adjust this value as needed
      setIsSticky(window.scrollY > scrollThreshold)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Get CoinGecko chart data including real OHLC and volume data
  const { volumeData, ohlcData, isLoading } = useCoinGeckoChartData(
    id, 
    activeTimeScale, 
    tokenData.quote.USD
  )

  // Use real OHLC data from CoinGecko with volume data
  const indicatorData = React.useMemo(() => {
    if (ohlcData.length > 0) {
      return ohlcData.map((point, index) => ({
        time: typeof point.time === 'string' ? parseInt(point.time) : point.time as number,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: volumeData[index]?.value || 0 // Add volume from market-chart data
      }))
    }
    
    return []
  }, [ohlcData, volumeData])

  return (
    <main className="mx-auto py-6 px-4 relative z-10">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className={`col-span-12 sm:space-y-0 sticky top-0 z-[100] transition-all duration-300 ${isSticky ? 'pt-4' : 'pt-0'}`}>
          <PriceChart 
            coinId={id}
            initialData={tokenData.quote.USD}
            activeTimeScale={activeTimeScale}
            setActiveTimeScale={setActiveTimeScale}
          />              
        </div>
        
        <div className="col-span-12">
          <MarketMetrics data={tokenData} />
        </div>

        <SectionHeader title="Market Vision" icon={IconCircleDottedAndCircle} className="col-span-12 mt-24" />

        <div className="col-span-12">
          {isLoading ? (
            <div className="h-[250px] bg-zinc-950/50 border border-zinc-800/30 rounded-[20px] flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2"></div>
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
            <div className="h-[250px] bg-zinc-950/50 border border-zinc-800/30 rounded-[20px] flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2"></div>
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

        <SectionHeader title="Liquidation & Open Interest" icon={IconDropFill} className="col-span-12 mt-24" />

        <div className="col-span-12">
          <LiquidationHistoryChart
            coinId={id}
            interval="1d"
            exchangeList="Binance, Bybit, OKX, Gate, HTX, Hyperliquid, CoinEx, Bitmex, Bitfinex"
            limit={200}
          />              
        </div>

        <div className="col-span-12">
        <OpenInterestChart
          coinId={id}
          interval="1d"
          limit={30}
          unit="usd"
        />              
        </div>
        
        <SectionHeader title="Buy/Sell Pressure by Exchange" icon={IconBinocularsFill} className="col-span-12 mt-24" />

        <div className="col-span-12">
          <TakerBuySell
            coinId={id}
            range="24h"
          />
        </div>
      </div>
    </main>
  )
}