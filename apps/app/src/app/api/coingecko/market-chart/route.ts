import { NextRequest, NextResponse } from 'next/server'
import { getCoinMarketChart } from '@/lib/coingecko'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../../convex/_generated/api'

export const dynamic = 'force-dynamic'

// Initialize Convex client for server-side operations
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

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

    console.log('🎯 CoinGecko market chart API request:', {
      id: coinId,
      days: timeframe,
      interval: params.interval
    })

    // 1. Check Convex cache first
    const cachedData = await convex.query(api.historicalData.getCoinGeckoHistoricalData, {
      coingeckoId: coinId,
      timeframe: timeframe
    })

    if (cachedData.cached && !cachedData.stale && cachedData.data.length > 0) {
      console.log(`🚀 Cache hit for ${coinId} (${timeframe}):`, {
        dataPoints: cachedData.dataPoints,
        lastUpdated: new Date(cachedData.lastUpdated).toLocaleString()
      })
      
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
    console.log(`💾 Cache miss for ${coinId}, fetching from CoinGecko...`)
    
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

    // Cache the data asynchronously
    console.log(`🔄 Attempting to cache ${dataPoints.length} data points for ${coinId} (${timeframe})`)
    console.log(`🔗 Convex URL configured:`, !!process.env.NEXT_PUBLIC_CONVEX_URL)
    
    convex.mutation(api.historicalData.upsertCoinGeckoHistoricalData, {
      coingeckoId: coinId,
      timeframe: timeframe,
      dataPoints,
      dataSource: 'coingecko'
    }).then((result) => {
      console.log(`✅ Successfully cached ${dataPoints.length} data points for ${coinId}:`, result)
    }).catch(error => {
      console.error(`❌ Failed to cache data for ${coinId}:`, error)
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
    
    // Try to return stale cached data as fallback
    if (coinId) {
      try {
        const staleData = await convex.query(api.historicalData.getCoinGeckoHistoricalData, {
          coingeckoId: coinId,
          timeframe: timeframe
        })

        if (staleData.data.length > 0) {
          console.log(`🔄 Returning stale data as fallback for ${coinId}`)
          
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
      } catch (cacheError) {
        console.warn('Failed to get fallback cache data:', cacheError)
      }
    }
    
    return NextResponse.json({
      error: 'Failed to fetch market chart data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 