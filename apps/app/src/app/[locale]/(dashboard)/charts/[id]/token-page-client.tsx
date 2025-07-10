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
import { useChartData } from '@/hooks/use-chart-data'
import { marketVisionConfig } from '@/hooks/market-vision/market-vision-config'
import type { Time } from 'lightweight-charts'

interface TokenPageClientProps {
  id: string
  tokenData: CoinMarketData
}

export function TokenPageClient({ id, tokenData }: TokenPageClientProps) {
  const [activeTimeScale, setActiveTimeScale] = useState<string>("1d")
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

  // Get chart data for indicators - use the same timeScale as the main chart
  const { chartData, volumeData } = useChartData(id, activeTimeScale, tokenData.quote.USD)

  // Convert price/volume data to OHLCV format for indicators
  const ohlcvData = React.useMemo(() => {
    if (!chartData.length) return []

    // Always use the current chartData/volumeData that matches the active time scale
    // Don't rely on tokenData.fullData which might be stale or not time-scale specific
    return chartData.map((point: { time: Time; value: number }, index: number) => {
      const price = point.value
      const volume = volumeData[index]?.value || 0
      const prevPrice = index > 0 ? chartData[index - 1]?.value || price : price
      
      // Create realistic OHLC with price movement patterns
      const priceChange = price - prevPrice
      const volatility = Math.abs(priceChange) * 0.5 + price * 0.001 // Add some base volatility
      
      // Simulate realistic open/close based on price direction
      const open = prevPrice
      const close = price
      const high = Math.max(open, close) + volatility * Math.random()
      const low = Math.min(open, close) - volatility * Math.random()
      
      return {
        time: point.time,
        open,
        high,
        low,
        close,
        volume
      }
    })
  }, [chartData, volumeData])

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
          <MarketVisionChart
            data={ohlcvData}
            config={marketVisionConfig}
            height={250}
            showTimeAxis={false}
          />
        </div>

        <div className="col-span-12">
          <BollingerBandsChart
            data={ohlcvData}
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