'use client'

import { CoinMarketData } from '@/types/coins'
import Image from "next/image"
import { TokenPageClient } from './token-page-client'
import { use } from 'react'
interface PageProps {
  params: Promise<{
    id: string
  }>
}

// Fallback data structure for initial render (CoinGecko compatible)
const createFallbackData = (id: string): CoinMarketData => ({
  id: id, // Keep as string for CoinGecko compatibility
  name: 'Loading...',
  symbol: 'LOADING',
  slug: `coin-${id}`,
  cmc_rank: 0,
  circulating_supply: 0,
  max_supply: null,
  quote: {
    USD: {
      price: 0,
      volume_24h: 0,
      market_cap: 0,
      percent_change_24h: 0,
    }
  }
})

export default function TokenPage({ params }: PageProps) {  
  const { id } = use(params)
  
  // Use fallback data since chart components will fetch their own CoinGecko data
  const tokenData = createFallbackData(id)

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
          mixBlendMode: 'soft-light'
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
          mixBlendMode: 'soft-light'
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
}