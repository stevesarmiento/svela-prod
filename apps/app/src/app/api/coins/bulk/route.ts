import { NextRequest, NextResponse } from 'next/server'

const CMC_API_KEY = process.env.COINMARKETCAP_API_KEY
const CMC_BASE_URL = 'https://pro-api.coinmarketcap.com'

interface CoinInfo {
  id: number
  name: string
  symbol: string
  category: string
  description: string
  slug: string
  logo: string
  subreddit?: string
  notice?: string
  tags: string[]
  'tag-names': string[]
  'tag-groups': string[]
  urls: Record<string, string[]>
  platform?: Record<string, unknown>
  date_added: string
  twitter_username?: string
  is_hidden: number
  date_launched?: string
  contract_address?: Record<string, unknown>[]
  self_reported_circulating_supply?: number
  self_reported_tags?: string[]
  self_reported_market_cap?: number
  infinite_supply: boolean
}

interface USDQuote {
  price: number
  volume_24h: number
  volume_change_24h: number
  percent_change_1h: number
  percent_change_24h: number
  percent_change_7d: number
  percent_change_30d: number
  percent_change_60d: number
  percent_change_90d: number
  market_cap: number
  market_cap_dominance: number
  fully_diluted_market_cap: number
  tvl?: number
  last_updated: string
}

interface CoinQuote {
  id: number
  name: string
  symbol: string
  slug: string
  num_market_pairs: number
  date_added: string
  tags: string[]
  max_supply: number | null
  circulating_supply: number
  total_supply: number
  platform?: Record<string, unknown>
  is_active: number
  infinite_supply: boolean
  cmc_rank: number
  is_fiat: number
  self_reported_circulating_supply?: number
  self_reported_market_cap?: number
  tvl_ratio?: number
  last_updated: string
  quote: {
    USD: USDQuote
  }
}

interface HistoricalDataResponse {
  data: {
    id: number
    name?: string
    symbol?: string
    is_active?: number
    is_fiat?: number
    quotes: Array<{
      timestamp: string
      quote: {
        USD: {
          price: number
          volume_24h: number
          market_cap: number
        }
      }
    }>
  }
  status: {
    error_code: number
    error_message: string
  }
}

interface OHLCVResponse {
  data: {
    id: number
    name?: string
    symbol?: string
    quotes: Array<{
      time_open: string
      time_close: string
      time_high: string
      time_low: string
      quote: {
        USD: {
          open: number
          high: number
          low: number
          close: number
          volume: number
          market_cap: number
          timestamp: string
        }
      }
    }>
  }
  status: {
    error_code: number
    error_message: string
  }
}

interface BulkCoinData {
  coinId: number
  ohlcv?: OHLCVResponse
  historical?: HistoricalDataResponse
  quote?: CoinQuote
  info?: CoinInfo
  error?: string
}

async function fetchWithErrorHandling(url: string, options?: RequestInit) {
  if (!CMC_API_KEY) {
    throw new Error('CoinMarketCap API key is not configured')
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'X-CMC_PRO_API_KEY': CMC_API_KEY,
        'Accept': 'application/json',
        ...options?.headers,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.status?.error_message || `API error: ${response.status}`)
    }

    return response.json()
  } catch (error) {
    console.error('CoinMarketCap API error:', error)
    throw error
  }
}

async function fetchWithRetry(url: string, maxRetries: number = 3, initialDelay: number = 1000) {
  let lastError: Error
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithErrorHandling(url)
      return response
    } catch (error) {
      lastError = error as Error
      
      // Check if it's a rate limit error
      if (lastError.message.includes('rate limit') && attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt) // Exponential backoff
        console.log(`Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      
      // If not rate limit error or max retries reached, throw
      throw lastError
    }
  }
  
  throw lastError!
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const coinIds = searchParams.get('coinIds')?.split(',').map(Number) || []
  const timeScale = searchParams.get('timeScale') || '30d'
  
  if (!coinIds.length) {
    return NextResponse.json({ error: 'No coin IDs provided' }, { status: 400 })
  }

  if (coinIds.length > 10) {
    return NextResponse.json({ error: 'Maximum 10 coins per request' }, { status: 400 })
  }

  console.log(`📦 Bulk API: Fetching ${coinIds.length} coins for timeScale ${timeScale}`)

  try {
    const results: BulkCoinData[] = []
    const coinIdsStr = coinIds.join(',')

    // 1. Batch fetch coin info (1 API call for all coins)
    let infoData: Record<number, CoinInfo> = {}
    try {
      const infoResponse = await fetchWithErrorHandling(
        `${CMC_BASE_URL}/v1/cryptocurrency/info?id=${coinIdsStr}`
      )
      infoData = infoResponse.data || {}
    } catch (error) {
      console.warn('Bulk info fetch failed:', error)
    }

    // 2. Batch fetch current quotes (1 API call for all coins)
    let quotesData: Record<number, CoinQuote> = {}
    try {
      const quotesResponse = await fetchWithErrorHandling(
        `${CMC_BASE_URL}/v1/cryptocurrency/quotes/latest?id=${coinIdsStr}`
      )
      quotesData = quotesResponse.data || {}
    } catch (error) {
      console.warn('Bulk quotes fetch failed:', error)
    }

    // 3. Historical data - throttled individual calls with rate limit handling
    const historicalPromises = coinIds.map(async (coinId, index) => {
      // Add progressive delay to avoid rate limits (200ms per coin)
      const delay = index * 200
      await new Promise(resolve => setTimeout(resolve, delay))
      
      try {
        // Try OHLCV first (best quality) with rate limit retry
        let ohlcvData = null
        try {
          const timeStart = getTimeStart(timeScale)
          ohlcvData = await fetchWithRetry(
            `${CMC_BASE_URL}/v2/cryptocurrency/ohlcv/historical?id=${coinId}&time_start=${timeStart}&interval=daily&count=1000`,
            3, // max retries
            1000 // initial delay
          )
        } catch (ohlcvError) {
          console.warn(`OHLCV failed for coin ${coinId}:`, ohlcvError)
        }

        // Fallback to regular historical if OHLCV fails
        let historicalData = null
        if (!ohlcvData?.data?.quotes?.length) {
          try {
            const timeStart = getTimeStart(timeScale)
            historicalData = await fetchWithRetry(
              `${CMC_BASE_URL}/v2/cryptocurrency/quotes/historical?id=${coinId}&time_start=${timeStart}&interval=daily&count=365`,
              3, // max retries  
              1000 // initial delay
            )
          } catch (historicalError) {
            console.warn(`Historical failed for coin ${coinId}:`, historicalError)
          }
        }

        return {
          coinId,
          ohlcv: ohlcvData,
          historical: historicalData,
          quote: quotesData[coinId],
          info: infoData[coinId],
        }
      } catch (error) {
        console.error(`Failed to fetch data for coin ${coinId}:`, error)
        return {
          coinId,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    })

    const historicalResults = await Promise.allSettled(historicalPromises)
    
    historicalResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        results.push({
          coinId: coinIds[index]!,
          error: 'Failed to fetch historical data',
        })
      }
    })

    console.log(`📦 Bulk API: Successfully fetched ${results.filter(r => !r.error).length}/${coinIds.length} coins`)

    return NextResponse.json({
      success: true,
      data: results,
      meta: {
        totalCoins: coinIds.length,
        successfulCoins: results.filter(r => !r.error).length,
        timeScale,
        timestamp: new Date().toISOString(),
      },
    })

  } catch (error) {
    console.error('Bulk API error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch bulk coin data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

function getTimeStart(timeScale: string): string {
  const now = new Date()
  
  switch (timeScale) {
    case '1d':
      return new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
    case '7d':
      return new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString()
    case '30d':
      return new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString()
    case '2y':
      return new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString()
    case 'max':
    default:
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString()
  }
} 