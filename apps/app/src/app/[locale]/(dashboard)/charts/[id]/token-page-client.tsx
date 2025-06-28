'use client'

import { useState } from 'react'
import { PriceChart } from "./price-chart"
import { MarketMetrics } from "./market-metrics"
import { CoinMarketData } from '@/types/coins'
import { LiquidationHistoryChart } from "./liquidation-history-chart"
import { SectionHeader } from "../_components/section-header"
import { IconBinocularsFill, IconDropFill } from "symbols-react"
import { OpenInterestChart } from './open-interest-chart'
import { TakerBuySell } from './taker-buy-sell'

interface TokenPageClientProps {
  id: string
  tokenData: CoinMarketData
}

export function TokenPageClient({ id, tokenData }: TokenPageClientProps) {
  const [activeTimeScale, setActiveTimeScale] = useState<string>("7d")

  return (
    <main className="mx-auto py-6 relative z-10">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="col-span-12">
          <PriceChart 
            coinId={id}
            initialData={tokenData.quote.USD}
            activeTimeScale={activeTimeScale}
            setActiveTimeScale={setActiveTimeScale}
          />              
        </div>
        
        <div className="col-span-12 py-6 pt-6">
          <MarketMetrics data={tokenData} />
        </div>

        <SectionHeader title="Liquidation and Open Interest Overview" icon={IconDropFill} className="col-span-12 mt-24" />

        <div className="col-span-6">
          <LiquidationHistoryChart
            coinId={id}
            interval="1d"
            exchangeList="Binance, Bybit, OKX, Gate, HTX, Hyperliquid, CoinEx, Bitmex, Bitfinex"
            limit={200}
          />              
        </div>

        <div className="col-span-6">
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