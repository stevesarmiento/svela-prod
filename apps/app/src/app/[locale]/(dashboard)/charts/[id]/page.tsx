import { 
  Card, 
  CardContent, 
  //CardHeader, 
  //CardTitle 
} from "@v1/ui/card"
import { getCoinData } from "@/lib/coinmarketcap" 
import { PriceChart } from "./price-chart"
import { MarketMetrics } from "./market-metrics"
import { IconChevronBackward } from 'symbols-react'
import Link from 'next/link'
import { CoinMarketData } from '@/types/coins'
import Image from "next/image"
//import { TokenAnalysis } from './token-analysis'

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
      <div className="min-h-screen w-full px-4">
        <header className="border-b sticky top-0 bg-background/90 backdrop-blur-xl z-50">
          <div className="container flex w-full mx-auto items-center justify-between h-16 px-4">
            <div className="flex items-center gap-4">
              <Link href="/charts" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                <IconChevronBackward className="h-4 w-4 fill-primary" />
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <Image
                    src={`https://s2.coinmarketcap.com/static/img/coins/64x64/${tokenData.id}.png`}
                    alt={tokenData.name}
                    className="w-10 h-10 rounded-full ring-1 ring-primary/5"
                    width={40}
                    height={40}
                  />
                  <div>
                    <h1 className="text-xl font-semibold font-mono">{tokenData.name}</h1>
                    <p className="text-sm text-muted-foreground">
                      {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto py-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* PriceChart over MarketMetrics on the Right */}
            <div className="col-span-8">
              <PriceChart 
                coinId={id}
                initialData={tokenData.quote.USD} 
              />              
            </div>
            <div className="col-span-4">
              <MarketMetrics data={tokenData} />
            </div>
          </div>
          {/* Market Summary on the Left */}
          {/* <Card className="col-span-12">
              <CardHeader className="border-b border-foreground/10 pb-4 pt-6">
                <CardTitle className="text-lg font-medium font-mono">Market Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <TokenAnalysis tokenData={tokenData} />
              </CardContent>
            </Card> */}
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