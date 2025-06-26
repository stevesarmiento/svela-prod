import { 
  Card, 
  CardContent, 
} from "@v1/ui/card"
import { getCoinData } from "@/lib/coinmarketcap" 
import { PriceChart } from "./price-chart"
import { MarketMetrics } from "./market-metrics"
import { CoinMarketData } from '@/types/coins'

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