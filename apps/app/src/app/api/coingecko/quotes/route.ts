import { NextRequest, NextResponse } from 'next/server'
import { getCoinsMarketData } from '@/lib/coingecko'
import { auth } from '@clerk/nextjs/server'
import { getUserApiKey } from '@/lib/user-api-keys'

export const dynamic = 'force-dynamic'

interface CoinGeckoMarketData {
  id: string
  name: string
  symbol: string
  market_cap_rank: number
  image: string
  current_price: number
  market_cap: number
  fully_diluted_valuation: number | null
  total_volume: number
  high_24h: number
  low_24h: number
  price_change_24h: number
  price_change_percentage_24h: number
  price_change_percentage_7d_in_currency: number | null
  price_change_percentage_14d_in_currency: number | null
  price_change_percentage_30d_in_currency: number | null
  price_change_percentage_200d_in_currency: number | null
  price_change_percentage_1y_in_currency: number | null
  price_change_percentage_1h_in_currency: number | null
  market_cap_change_24h: number
  market_cap_change_percentage_24h: number
  circulating_supply: number
  total_supply: number | null
  max_supply: number | null
  ath: number
  ath_change_percentage: number
  ath_date: string
  atl: number
  atl_change_percentage: number
  atl_date: string
  roi: { times: number; currency: string; percentage: number } | null
  last_updated: string
  sparkline_in_7d: { price: number[] }
}

interface SearchParams {
  ids?: string
  symbols?: string
  names?: string
  category?: string
  limit?: number
}

export async function GET(request: NextRequest) {
  try {
    // Get user authentication (optional for API key resolution)
    // Note: auth() may fail in API routes due to middleware config, so we handle it gracefully
    let clerkId: string | null = null;
    try {
      const authResult = await auth();
      clerkId = authResult.userId;
    } catch (error) {
      // Auth failed, will use environment fallback
      console.log('Auth not available in API route, using environment fallback:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    // Get API key - user's key takes precedence over environment variable
    const apiKeyResult = await getUserApiKey(clerkId, 'coingecko', 'X_CG_PRO_API_KEY');
    
    if (!apiKeyResult.key) {
      return NextResponse.json(
        { error: 'CoinGecko API key not available. Please add your API key in settings or configure X_CG_PRO_API_KEY environment variable.' },
        { status: 500 }
      );
    }
    
    const searchParams = request.nextUrl.searchParams
    
    // Extract all possible search parameters
    const params: SearchParams = {
      ids: searchParams.get('ids') || undefined,
      symbols: searchParams.get('symbols') || undefined,
      names: searchParams.get('names') || undefined,
      category: searchParams.get('category') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100
    }

    // If no search parameters are provided, default to top coins by market cap
    
    // Build the query parameters for CoinGecko API
    let idsArray: string[] = []
    let useDirectAPI = false

    if (params.ids) {
      idsArray = params.ids.split(',').map(id => id.trim())
    } else {
      // For symbol, name, category searches, or top coins request, we'll use the markets endpoint directly
      useDirectAPI = true
    }

    if (idsArray.length === 0 && !useDirectAPI) {
      return NextResponse.json(
        { data: {} },
        { 
          status: 200,
          headers: {
            'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
          }
        }
      )
    }

    let marketData: CoinGeckoMarketData[]

    if (useDirectAPI) {
      // Use the enhanced markets endpoint with symbol/name/category search or top coins
      const apiParams = new URLSearchParams({
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: Math.min(params.limit || 100, 250).toString(),
        page: '1',
        sparkline: 'true',
        price_change_percentage: '1h,24h,7d,14d,30d,200d,1y'
      })

      // Add search-specific parameters based on priority (category > names > symbols)
      // If no search params, this will just get top coins by market cap
      if (params.category) {
        apiParams.append('category', params.category)
      } else if (params.names) {
        // URL encode names for spaces
        const encodedNames = params.names.split(',')
          .map(name => encodeURIComponent(name.trim()))
          .join(',')
        apiParams.append('names', encodedNames)
      } else if (params.symbols) {
        apiParams.append('symbols', params.symbols.toLowerCase())
        apiParams.append('include_tokens', 'all') // Include all matching tokens for symbols
      }
      // If none of the above, it will just fetch top coins by market cap (default behavior)

      // Call CoinGecko API directly with enhanced parameters
      const response = await fetch(
        `https://pro-api.coingecko.com/api/v3/coins/markets?${apiParams}`,
        {
          headers: {
            'x-cg-pro-api-key': apiKeyResult.key,
            'Content-Type': 'application/json',
          },
        }
      )

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`)
      }

      marketData = await response.json()
    } else {
      // Use existing method for ID-based searches
      marketData = await getCoinsMarketData(
        idsArray,
        'usd',
        'market_cap_desc',
        Math.min(params.limit || 100, 250),
        1,
        true, // include sparkline
        '1h,24h,7d,14d,30d,200d,1y'
      ) as CoinGeckoMarketData[]
    }

    // Transform CoinGecko data to match our expected format
    const transformedData: Record<string, CoinGeckoMarketData> = {}
    
    marketData.forEach((coin: CoinGeckoMarketData) => {
      transformedData[coin.id] = {
        id: coin.id,
        name: coin.name,
        symbol: coin.symbol.toUpperCase(),
        market_cap_rank: coin.market_cap_rank,
        image: coin.image,
        current_price: coin.current_price,
        market_cap: coin.market_cap,
        fully_diluted_valuation: coin.fully_diluted_valuation,
        total_volume: coin.total_volume,
        high_24h: coin.high_24h,
        low_24h: coin.low_24h,
        price_change_24h: coin.price_change_24h,
        price_change_percentage_24h: coin.price_change_percentage_24h,
        price_change_percentage_7d_in_currency: coin.price_change_percentage_7d_in_currency,
        price_change_percentage_14d_in_currency: coin.price_change_percentage_14d_in_currency,
        price_change_percentage_30d_in_currency: coin.price_change_percentage_30d_in_currency,
        price_change_percentage_200d_in_currency: coin.price_change_percentage_200d_in_currency,
        price_change_percentage_1y_in_currency: coin.price_change_percentage_1y_in_currency,
        market_cap_change_24h: coin.market_cap_change_24h,
        market_cap_change_percentage_24h: coin.market_cap_change_percentage_24h,
        circulating_supply: coin.circulating_supply,
        total_supply: coin.total_supply,
        max_supply: coin.max_supply,
        ath: coin.ath,
        ath_change_percentage: coin.ath_change_percentage,
        ath_date: coin.ath_date,
        atl: coin.atl,
        atl_change_percentage: coin.atl_change_percentage,
        atl_date: coin.atl_date,
        roi: coin.roi,
        last_updated: coin.last_updated,
        sparkline_in_7d: coin.sparkline_in_7d,
        price_change_percentage_1h_in_currency: coin.price_change_percentage_1h_in_currency
      }
    })

    return NextResponse.json(
      { 
        data: transformedData,
        status: {
          timestamp: new Date().toISOString(),
          error_code: 0,
          error_message: '',
          elapsed: 0,
          credit_count: marketData.length,
          search_type: useDirectAPI ? 'direct_api' : 'ids',
          total_results: marketData.length
        }
      },
      { 
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
        }
      }
    )

  } catch (error) {
    console.error('CoinGecko quotes API error:', error)
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch CoinGecko data',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    )
  }
} 