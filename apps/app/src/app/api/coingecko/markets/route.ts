import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { ConvexHttpClient } from "convex/browser"
import { api } from "../../../../../convex/_generated/api"

const MarketsParamsSchema = z.object({
  ids: z.string(), // Comma-separated CoinGecko IDs (e.g., "bitcoin,ethereum")
  vs_currency: z.string().optional().default('usd'),
  include_24hr_change: z.boolean().optional().default(true),
  include_24hr_vol: z.boolean().optional().default(true),
  include_last_updated_at: z.boolean().optional().default(true),
})

// Initialize Convex client for caching
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

interface CoinGeckoMarketData {
  id: string
  symbol: string
  name: string
  image: string
  current_price: number | null
  market_cap: number | null
  market_cap_rank: number | null
  fully_diluted_valuation: number | null
  total_volume: number | null
  high_24h: number | null
  low_24h: number | null
  price_change_24h: number | null
  price_change_percentage_24h: number | null
  market_cap_change_24h: number | null
  market_cap_change_percentage_24h: number | null
  circulating_supply: number | null
  total_supply: number | null
  max_supply: number | null
  ath: number | null
  ath_change_percentage: number | null
  ath_date: string | null
  atl: number | null
  atl_change_percentage: number | null
  atl_date: string | null
  roi: {
    times: number
    currency: string  
    percentage: number
  } | null
  last_updated: string
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  const params = MarketsParamsSchema.safeParse({
    ids: searchParams.get('ids'),
    vs_currency: searchParams.get('vs_currency') || undefined,
    include_24hr_change: searchParams.get('include_24hr_change') === 'true',
    include_24hr_vol: searchParams.get('include_24hr_vol') === 'true',
    include_last_updated_at: searchParams.get('include_last_updated_at') === 'true',
  })

  if (!params.success) {
    return NextResponse.json(
      { error: "Invalid parameters", details: params.error.issues },
      { status: 400 }
    )
  }

  const { ids, vs_currency, include_24hr_change, include_24hr_vol, include_last_updated_at } = params.data

  try {
    console.log('🎯 CoinGecko Markets API request:', {
      ids,
      vs_currency,
      include_24hr_change,
      include_24hr_vol,
      include_last_updated_at
    })
    
    // Debug environment variables
    console.log('🌍 Environment check:', {
      NODE_ENV: process.env.NODE_ENV,
      available_env_vars: Object.keys(process.env).filter(key => key.includes('CG') || key.includes('COINGECKO')),
      X_CG_PRO_API_KEY_exists: !!process.env.X_CG_PRO_API_KEY,
      COINGECKO_API_KEY_exists: !!process.env.COINGECKO_API_KEY
    })

    // Check Convex configuration
    if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
      console.warn('⚠️ NEXT_PUBLIC_CONVEX_URL not configured - database storage will fail')
    }

    // Get CoinGecko API key
    const cgApiKey = process.env.X_CG_PRO_API_KEY
    console.log('🔑 API Key check:', {
      hasKey: !!cgApiKey,
      keyLength: cgApiKey?.length || 0,
      envVarName: 'X_CG_PRO_API_KEY'
    })
    
    if (!cgApiKey) {
      throw new Error('CoinGecko API key not configured. Please set X_CG_PRO_API_KEY in your environment.')
    }

    const url = new URL(`https://pro-api.coingecko.com/api/v3/coins/markets`)
    url.searchParams.set('vs_currency', vs_currency)
    url.searchParams.set('ids', ids)
    if (include_24hr_change) url.searchParams.set('price_change_percentage', '24h')
    url.searchParams.set('order', 'market_cap_desc')
    url.searchParams.set('per_page', '250')
    url.searchParams.set('page', '1')
    url.searchParams.set('sparkline', 'false')

    console.log('🌐 Fetching markets data from CoinGecko:', url.toString())

    const response = await fetch(url.toString(), {
      headers: {
        'x-cg-pro-api-key': cgApiKey,
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`)
    }

    const rawData: CoinGeckoMarketData[] = await response.json()
    console.log(`📊 Received ${rawData.length} market data points from CoinGecko`)
    
    // Log detailed data for debugging
    if (rawData.length > 0 && rawData[0]) {
      const sample = rawData[0]
      console.log('🔍 Full market data structure:', {
        id: sample.id,
        symbol: sample.symbol,
        name: sample.name,
        image: sample.image,
        current_price: sample.current_price,
        market_cap: sample.market_cap,
        market_cap_rank: sample.market_cap_rank,
        total_volume: sample.total_volume,
        price_change_24h: sample.price_change_24h,
        price_change_percentage_24h: sample.price_change_percentage_24h,
        circulating_supply: sample.circulating_supply,
        max_supply: sample.max_supply,
        last_updated: sample.last_updated
      })
      
      console.log('🔍 Raw API response (first item):', JSON.stringify(sample, null, 2))
    }
    
    // Log all coin IDs we got back
    console.log('🪙 Received coin IDs:', rawData.map(coin => coin.id))

    // Store in Convex database
    if (process.env.NEXT_PUBLIC_CONVEX_URL && rawData.length > 0) {
      try {
        console.log('💾 Storing market data in Convex...')
        
        for (const coinData of rawData) {
          await convex.mutation(api.coingeckoMarkets.upsertMarketData, {
            coingeckoId: coinData.id,
            symbol: coinData.symbol,
            name: coinData.name,
            image: coinData.image,
            currentPrice: coinData.current_price ?? undefined,
            marketCap: coinData.market_cap ?? undefined,
            marketCapRank: coinData.market_cap_rank ?? undefined,
            fullyDilutedValuation: coinData.fully_diluted_valuation ?? undefined,
            totalVolume: coinData.total_volume ?? undefined,
            high24h: coinData.high_24h ?? undefined,
            low24h: coinData.low_24h ?? undefined,
            priceChange24h: coinData.price_change_24h ?? undefined,
            priceChangePercentage24h: coinData.price_change_percentage_24h ?? undefined,
            marketCapChange24h: coinData.market_cap_change_24h ?? undefined,
            marketCapChangePercentage24h: coinData.market_cap_change_percentage_24h ?? undefined,
            circulatingSupply: coinData.circulating_supply ?? undefined,
            totalSupply: coinData.total_supply ?? undefined,
            maxSupply: coinData.max_supply ?? undefined,
            ath: coinData.ath ?? undefined,
            athChangePercentage: coinData.ath_change_percentage ?? undefined,
            athDate: coinData.ath_date ?? undefined,
            atl: coinData.atl ?? undefined,
            atlChangePercentage: coinData.atl_change_percentage ?? undefined,
            atlDate: coinData.atl_date ?? undefined,
            lastUpdated: coinData.last_updated,
          })
        }
        
        console.log('✅ Successfully stored market data in Convex')
      } catch (convexError) {
        console.error('❌ Failed to store in Convex:', convexError)
        // Don't fail the API request if Convex storage fails
      }
    }

    // Prepare response data
    const responseData = {
      data: rawData,
      cached: false,
      timestamp: Date.now()
    }
    
    console.log('📤 Sending response:', {
      data_count: rawData.length,
      response_structure: {
        data: 'array',
        cached: responseData.cached,
        timestamp: responseData.timestamp
      },
      first_coin_id: rawData[0]?.id,
      success: true
    })

    // Return the formatted data
    return NextResponse.json(responseData)

  } catch (error) {
    console.error('❌ Markets API Error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch market data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
} 