import { NextRequest, NextResponse } from 'next/server'
import { getCoinMarketChart } from '@/lib/coingecko'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../../convex/_generated/api'
import { Effect } from "effect"
import { makeCacheQueueService } from '@/lib/effect/cache-queue'

export const dynamic = 'force-dynamic'

const isDebug = process.env.LOG_LEVEL === "debug"

// Initialize Convex client for server-side operations
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

function getServerToken(): string {
  const token = process.env.INTERNAL_CONVEX_SERVER_TOKEN
  if (!token) throw new Error("INTERNAL_CONVEX_SERVER_TOKEN is not configured")
  return token
}

// Initialize cache queue service (singleton)
let cacheQueueServiceInstance: Awaited<ReturnType<typeof makeCacheQueueService>> | null = null

async function getCacheQueueService() {
  if (!cacheQueueServiceInstance) {
    cacheQueueServiceInstance = await makeCacheQueueService(convex, api)
  }
  return cacheQueueServiceInstance
}

interface MarketChartParams {
  id?: string
  vs_currency?: string
  days?: string
  interval?: string
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  
  // Extract parameters
  const params: MarketChartParams = {
    id: searchParams.get('id') || undefined,
    vs_currency: searchParams.get('vs_currency') || 'usd',
    days: searchParams.get('days') || '7',
    interval: searchParams.get('interval') || undefined
  }

  if (!params.id) {
    return NextResponse.json(
      { error: 'Missing required parameter: id' },
      { status: 400 }
    )
  }

  // Now params.id is guaranteed to be defined
  const coinId = params.id
  const timeframe = params.days || '7'

  try {

    if (isDebug) {
      console.log('🎯 CoinGecko market chart API request:', {
        id: coinId,
        days: timeframe,
        interval: params.interval
      })
    }

    // 1. Check Convex cache first (with Effect for resilience)
    const cachedDataEffect = Effect.tryPromise({
      try: () => convex.query(api.historicalData.getCoinGeckoHistoricalData, {
        serverToken: getServerToken(),
        coingeckoId: coinId,
        timeframe: timeframe
      }),
      catch: (error) => {
        if (isDebug) console.warn('⚠️ Convex cache query failed:', error)
        return error
      }
    }).pipe(
      // Don't wait forever for cache - timeout after 800ms
      // (Convex cache should be instant if healthy, no need to retry slow responses)
      Effect.timeout("800 millis"),
      // If cache fails, return empty result (will fetch fresh data)
      Effect.catchAll(() => {
        if (isDebug) console.log('🔄 Cache unavailable, will fetch fresh data')
        return Effect.succeed({ 
          cached: false, 
          stale: false, 
          data: [], 
          dataPoints: 0, 
          lastUpdated: 0 
        })
      })
    )

    const cachedData = await Effect.runPromise(cachedDataEffect)

    if (cachedData.cached && !cachedData.stale && cachedData.data.length > 0) {
      if (isDebug) {
        console.log(`🚀 Cache hit for ${coinId} (${timeframe}):`, {
          dataPoints: cachedData.dataPoints,
          lastUpdated: new Date(cachedData.lastUpdated).toLocaleString()
        })
      }
      
      // Return cached data in chart format
      return NextResponse.json({
        data: {
          prices: cachedData.data.map(point => ({
            time: Math.floor(point.timestamp / 1000),
            value: point.price
          })),
          volumes: cachedData.data.map(point => ({
            time: Math.floor(point.timestamp / 1000),
            value: point.volume || 0
          })),
          market_caps: cachedData.data.map(point => ({
            time: Math.floor(point.timestamp / 1000),
            value: point.marketCap || 0
          }))
        },
        status: {
          timestamp: new Date().toISOString(),
          error_code: 0,
          error_message: '',
          data_source: 'convex-cache',
          total_points: cachedData.dataPoints,
          cached: true
        }
      }, {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
        }
      })
    }

    // 2. Fetch fresh data from CoinGecko API
    if (isDebug) console.log(`💾 Cache miss for ${coinId}, fetching from CoinGecko...`)
    
    const marketData = await getCoinMarketChart(
      coinId,
      params.vs_currency,
      timeframe,
      params.interval
    )

    // 3. Store in Convex database (fire and forget)
    const dataPoints = marketData.transformed.prices.map((price, index) => ({
      timestamp: price.time * 1000, // Convert back to milliseconds for storage
      price: price.value,
      volume: marketData.transformed.volumes[index]?.value || 0,
      marketCap: marketData.transformed.market_caps[index]?.value || 0,
    }))

    // Enqueue cache write (non-blocking, rate-limited via queue)
    getCacheQueueService().then(service => {
      Effect.runFork(
        service.enqueue({
          coinId,
          timeframe,
          dataPoints,
          dataSource: 'coingecko'
        })
      )
    }).catch(error => {
      if (isDebug) console.warn(`⚠️ Failed to enqueue cache write for ${coinId}:`, error)
    })

    // 4. Return fresh data
    return NextResponse.json({
      data: {
        prices: marketData.transformed.prices,
        volumes: marketData.transformed.volumes,
        market_caps: marketData.transformed.market_caps
      },
      status: {
        timestamp: new Date().toISOString(),
        error_code: 0,
        error_message: '',
        data_source: 'coingecko-fresh',
        total_points: marketData.transformed.prices.length,
        cached: false
      }
    }, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120'
      }
    })

  } catch (error) {
    console.error('CoinGecko market chart API error:', error)
    
    // Try to return stale cached data as fallback (with Effect for resilience)
    if (coinId) {
      const staleDataEffect = Effect.tryPromise({
        try: () => convex.query(api.historicalData.getCoinGeckoHistoricalData, {
          serverToken: getServerToken(),
          coingeckoId: coinId,
          timeframe: timeframe
        }),
        catch: (error) => {
          if (isDebug) console.warn('⚠️ Fallback cache query also failed:', error)
          return error
        }
      }).pipe(
        // Quick timeout for fallback (don't delay error response)
        Effect.timeout("800 millis"),
        // Return empty result if cache fails
        Effect.catchAll(() => Effect.succeed({ data: [], dataPoints: 0 }))
      )

      const staleData = await Effect.runPromise(staleDataEffect)

      if (staleData.data.length > 0) {
        if (isDebug) console.log(`🔄 Returning stale data as fallback for ${coinId}`)
        
        return NextResponse.json({
          data: {
            prices: staleData.data.map(point => ({
              time: Math.floor(point.timestamp / 1000),
              value: point.price
            })),
            volumes: staleData.data.map(point => ({
              time: Math.floor(point.timestamp / 1000),
              value: point.volume || 0
            })),
            market_caps: staleData.data.map(point => ({
              time: Math.floor(point.timestamp / 1000),
              value: point.marketCap || 0
            }))
          },
          status: {
            timestamp: new Date().toISOString(),
            error_code: 1,
            error_message: 'Using stale cached data due to API error',
            data_source: 'convex-stale',
            total_points: staleData.dataPoints,
            cached: true
          }
        }, { status: 200 })
      }
    }
    
    return NextResponse.json({
      error: 'Failed to fetch market chart data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 