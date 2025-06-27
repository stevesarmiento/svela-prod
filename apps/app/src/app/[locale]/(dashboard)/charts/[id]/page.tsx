import { 
  Card, 
  CardContent, 
} from "@v1/ui/card"
import { getCoinData } from "@/lib/coinmarketcap" 
import { PriceChart } from "./price-chart"
import { MarketMetrics } from "./market-metrics"
//import { FundingRateExchanges } from "./funding-rate-exchanges"
//import { DerivativesMetrics } from "./derivatives-metrics"
import { CoinMarketData } from '@/types/coins'
import Image from "next/image"
import { LiquidationHistoryChart } from "./liquidation-history-chart"
import { SectionHeader } from "../_components/section-header"
import { IconBinocularsFill, IconDropFill } from "symbols-react"
import { OpenInterestChart } from './open-interest-chart'
import { TakerBuySell } from './taker-buy-sell'

interface PageProps {
  params: {
    id: string
  }
}

export default async function TokenPage({ params }: PageProps) {  
  try {
    const id = params.id
    const tokenData: CoinMarketData = await getCoinData(id)
    
    if (!tokenData || !tokenData.quote?.USD) {
      throw new Error('Invalid token data received')
    }

    return (
      <div className="min-h-screen w-full px-4 relative">
        {/* Blurred background token image with custom styles */}
        <div 
          className="absolute z-0 pointer-events-none"
          style={{
            width: '700px',
            height: '700px',
            filter: 'blur(360px)',
            willChange: 'filter',
            opacity: 1,
            left: '-10vw',
            top: '-350px',
            mixBlendMode: 'overlay'
          }}
        >
          <Image
            src={`https://s2.coinmarketcap.com/static/img/coins/64x64/${id}.png`}
            alt={`${tokenData.name} background`}
            className="w-full h-full object-cover"
            width={700}
            height={700}
          />
        </div>

        <div 
          className="absolute z-0 pointer-events-none saturate-200"
          style={{
            width: '479px',
            height: '479px',
            filter: 'blur(360px)',
            willChange: 'filter',
            opacity: 1,
            right: '-5vw',
            top: '236px',     
            mixBlendMode: 'overlay'
          }}
        >
          <Image
            src={`https://s2.coinmarketcap.com/static/img/coins/64x64/${id}.png`}
            alt={`${tokenData.name} background`}
            className="w-full h-full object-cover"
            width={700}
            height={700}
          />
        </div>

        <main className="mx-auto py-6 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="col-span-12">
              <PriceChart 
                coinId={id}
                initialData={tokenData.quote.USD} 
              />              
            </div>
            
            <div className="col-span-12 py-6 pt-6">
              <MarketMetrics data={tokenData} />
            </div>

            <SectionHeader title="Liquidation and Open Interest Overview" icon={IconDropFill} className="col-span-12 mt-24" />

            <div className="col-span-6">
              <LiquidationHistoryChart
                coinId={params.id}
                interval="1d"
                exchangeList="Binance, Bybit, OKX, Gate, HTX, Hyperliquid, CoinEx, Bitmex, Bitfinex"
                limit={200}
              />              
            </div>

            <div className="col-span-6">
            <OpenInterestChart
              coinId={params.id}
              interval="1d"
              limit={30}
              unit="usd"
            />              
            </div>
            <SectionHeader title="Buy/Sell Pressure by Exchange" icon={IconBinocularsFill} className="col-span-12 mt-24" />

            <div className="col-span-12">
              <TakerBuySell
                coinId={params.id}
                range="24h"
              />
            </div>
          </div>
        </main>
      </div>
    )
  } catch (error) {
    console.error('Error loading token page:', error)
    return (
      <div className="container mx-auto px-4 py-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">
              Failed to load token data. Please try again later.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }
}