import { 
  Card, 
  CardContent, 
} from "@v1/ui/card"
import { getCoinData } from "@/lib/coinmarketcap" 
import { CoinMarketData } from '@/types/coins'
import Image from "next/image"
import { TokenPageClient } from './token-page-client'

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

        <TokenPageClient 
          id={id}
          tokenData={tokenData}
        />
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