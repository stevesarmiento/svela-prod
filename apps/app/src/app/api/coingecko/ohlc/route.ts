import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { ConvexHttpClient } from "convex/browser"
import { api } from "../../../../../convex/_generated/api"

const OHLCParamsSchema = z.object({
  id: z.string(),
  vs_currency: z.string().optional().default('usd'),
  days: z.enum(['1', '7', '14', '30', '90', '180', '365', '1825', 'max']).optional().default('7'),
  interval: z.enum(['daily', 'hourly']).optional().nullable(),
  precision: z.string().optional().nullable(),
})

// Initialize Convex client for caching
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

// Test Convex connection
console.log('🔗 Convex client initialized for OHLC route:', {
  hasUrl: !!process.env.NEXT_PUBLIC_CONVEX_URL,
  urlPrefix: process.env.NEXT_PUBLIC_CONVEX_URL?.substring(0, 20),
  clientReady: !!convex
})

export interface OHLCDataPoint {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  const params = OHLCParamsSchema.safeParse({
    id: searchParams.get('id'),
    vs_currency: searchParams.get('vs_currency'),
    days: searchParams.get('days'),
    interval: searchParams.get('interval'),
    precision: searchParams.get('precision'),
  })

  if (!params.success) {
    return NextResponse.json(
      { error: "Invalid parameters", details: params.error.issues },
      { status: 400 }
    )
  }

  const { id: coinId, vs_currency, days, interval, precision } = params.data

  try {
    console.log('🎯 CoinGecko OHLC API request:', {
      coinId,
      vs_currency,
      days,
      interval
    })

    // Check Convex configuration
    if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
      console.warn('⚠️ NEXT_PUBLIC_CONVEX_URL not configured - database storage will fail')
    } else {
      console.log('🔗 Convex URL configured:', process.env.NEXT_PUBLIC_CONVEX_URL.substring(0, 20) + '...')
    }

    // Fetch data from CoinGecko API
    const cgApiKey = process.env.X_CG_PRO_API_KEY
    if (!cgApiKey) {
      throw new Error('CoinGecko API key not configured')
    }

    const url = new URL(`https://pro-api.coingecko.com/api/v3/coins/${coinId}/ohlc`)
    url.searchParams.set('vs_currency', vs_currency)
    url.searchParams.set('days', days)
    if (interval && interval !== null) url.searchParams.set('interval', interval)
    if (precision && precision !== null) url.searchParams.set('precision', precision)

    console.log('🌐 Fetching OHLC data from CoinGecko:', url.toString())

    const response = await fetch(url.toString(), {
      headers: {
        'x-cg-pro-api-key': cgApiKey,
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`)
    }

    const rawData: number[][] = await response.json()
    console.log(`📊 Received ${rawData.length} OHLC data points from CoinGecko`)

    // Transform the data
    const transformedData: OHLCDataPoint[] = rawData.map((dataPoint) => {
      const [timestamp, open, high, low, close] = dataPoint
      return {
        timestamp: timestamp || 0,
        open: open || 0,
        high: high || 0,
        low: low || 0,
        close: close || 0,
      }
    })

    // 🆕 Store OHLC data in Convex for caching with full OHLC information
    console.log(`💾 Starting OHLC data storage process for ${coinId}`)
    console.log(`📊 Raw OHLC data received: ${transformedData.length} points`)
    console.log(`📈 First OHLC point:`, transformedData[0])
    
    try {
      // Convert OHLC data with full OHLC fields for Convex storage
      const dataPoints = transformedData.map((point) => ({
        timestamp: point.timestamp,
        price: point.close, // Use close price as the main price
        volume: 0, // OHLC endpoint doesn't provide volume
        marketCap: undefined,
        // 🆕 Include full OHLC data for database storage
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
      }))

      const timeframe = `${days}_ohlc` // Add _ohlc suffix to distinguish from market-chart data
      
      console.log(`🎯 Calling Convex mutation with:`, {
        coingeckoId: coinId,
        timeframe: timeframe,
        dataPointsCount: dataPoints.length,
        dataSource: 'coingecko-ohlc',
        sampleDataPoint: dataPoints[0]
      })
      
      // Fire and forget - don't block the response
      convex.mutation(api.historicalData.upsertCoinGeckoHistoricalData, {
        coingeckoId: coinId,
        timeframe: timeframe,
        dataPoints,
        dataSource: 'coingecko-ohlc'
      }).then((result) => {
        console.log(`✅ CONVEX SUCCESS: OHLC data stored for ${coinId}:`, {
          insertedCount: result.insertedCount,
          skippedCount: result.skippedCount,
          timeframe: result.timeframe,
          totalSubmitted: dataPoints.length
        })
      }).catch(error => {
        console.error(`❌ CONVEX ERROR: Failed to store OHLC data for ${coinId}:`, {
          errorMessage: error?.message,
          errorStack: error?.stack,
          errorName: error?.name,
          fullError: error
        })
      })
    } catch (error) {
      console.error('💥 CRITICAL ERROR in OHLC storage setup:', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        coinId,
        dataLength: transformedData.length
      })
      // Don't fail the request if caching fails
    }

    return NextResponse.json({
      data: transformedData,
      cached: false,
      lastUpdated: Date.now(),
      dataPoints: transformedData.length
    })

  } catch (error) {
    console.error('❌ OHLC API Error:', error)
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch OHLC data',
        data: []
      },
      { status: 500 }
    )
  }
} 