import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { ConvexHttpClient } from "convex/browser"
import { auth } from "@clerk/nextjs/server"
import { getUserApiKey } from "@/lib/user-api-keys"
import { api } from "../../../../../convex/_generated/api"

const OHLCParamsSchema = z.object({
  id: z.string(),
  vs_currency: z.string().optional().default('usd'),
  days: z.enum(['1', '7', '14', '30', '90', '180', '365', '1825', 'max']).optional().default('7'),
  precision: z.string().optional().nullable(),
})

// Initialize Convex client for caching
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

function getServerToken(): string {
  const token = process.env.INTERNAL_CONVEX_SERVER_TOKEN
  if (!token) throw new Error("INTERNAL_CONVEX_SERVER_TOKEN is not configured")
  return token
}

const isDebug = process.env.LOG_LEVEL === "debug"

if (isDebug) {
  console.log('🔗 Convex client initialized for OHLC route:', {
    hasUrl: !!process.env.NEXT_PUBLIC_CONVEX_URL,
    urlPrefix: process.env.NEXT_PUBLIC_CONVEX_URL?.substring(0, 20),
    clientReady: !!convex
  })
}

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
    precision: searchParams.get('precision'),
  })

  if (!params.success) {
    return NextResponse.json(
      { error: "Invalid parameters", details: params.error.issues },
      { status: 400 }
    )
  }

  const { id: coinId, vs_currency, days, precision } = params.data

  try {
    if (isDebug) {
      console.log('🎯 CoinGecko OHLC API request:', {
        coinId,
        vs_currency,
        days
      })
    }

    // Check Convex configuration
    if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
      if (isDebug) {
        console.warn('⚠️ NEXT_PUBLIC_CONVEX_URL not configured - database storage will fail')
      }
    } else {
      if (isDebug) {
        console.log('🔗 Convex URL configured:', process.env.NEXT_PUBLIC_CONVEX_URL.substring(0, 20) + '...')
      }
    }

    // Get user authentication (optional for API key resolution)
    // Note: auth() may fail in API routes due to middleware config, so we handle it gracefully
    let clerkId: string | null = null;
    try {
      const authResult = await auth();
      clerkId = authResult.userId;
    } catch (error) {
      // Auth failed, will use environment fallback
      if (isDebug) {
        console.log('Auth not available in API route, using environment fallback:', error instanceof Error ? error.message : 'Unknown error');
      }
    }
    
    // Get API key - user's key takes precedence over environment variable
    const apiKeyResult = await getUserApiKey(clerkId, 'coingecko', 'X_CG_PRO_API_KEY');
    
    if (!apiKeyResult.key) {
      throw new Error('CoinGecko API key not available. Please add your API key in settings or configure X_CG_PRO_API_KEY environment variable.');
    }

    const url = new URL(`https://pro-api.coingecko.com/api/v3/coins/${coinId}/ohlc`)
    url.searchParams.set('vs_currency', vs_currency)
    url.searchParams.set('days', days)
    // Note: CoinGecko OHLC API does not accept 'interval' parameter - it auto-determines interval based on days
    if (precision && precision !== null) url.searchParams.set('precision', precision)

    if (isDebug) console.log('🌐 Fetching OHLC data from CoinGecko:', url.toString())

    const response = await fetch(url.toString(), {
      headers: {
        'x-cg-pro-api-key': apiKeyResult.key,
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`)
    }

    const rawData: number[][] = await response.json()
    if (isDebug) console.log(`📊 Received ${rawData.length} OHLC data points from CoinGecko`)
    
    // 🔍 LOG RAW OHLC DATA FROM COINGECKO
    if (isDebug) {
      console.log('🎯 RAW OHLC DATA FROM COINGECKO:')
      console.log('📊 Total data points:', rawData.length)
      console.log('📈 First 3 raw data points:', rawData.slice(0, 3))
      console.log('📉 Last 3 raw data points:', rawData.slice(-3))
      console.log('🔍 Raw data structure check:')
      if (rawData.length > 0) {
        const firstPoint = rawData[0]
        console.log('   First point array:', firstPoint)
        console.log('   Array length:', firstPoint?.length)
        console.log('   Values: [timestamp, open, high, low, close]')
        console.log('   [0] timestamp:', firstPoint?.[0], '(', firstPoint?.[0] ? new Date(firstPoint[0]).toISOString() : 'invalid', ')')
        console.log('   [1] open:', firstPoint?.[1])
        console.log('   [2] high:', firstPoint?.[2])
        console.log('   [3] low:', firstPoint?.[3])
        console.log('   [4] close:', firstPoint?.[4])
      }
    }

    // Transform the data
    const transformedData: OHLCDataPoint[] = rawData.map((dataPoint, index) => {
      const [timestamp, open, high, low, close] = dataPoint
      
      // Log transformation for first few points
      if (isDebug && index < 3) {
        console.log(`🔄 Transforming point ${index}:`)
        console.log(`   Raw: [${timestamp}, ${open}, ${high}, ${low}, ${close}]`)
      }
      
      return {
        timestamp: timestamp || 0,
        open: open || 0,
        high: high || 0,
        low: low || 0,
        close: close || 0,
      }
    })
    
    // 🔍 LOG TRANSFORMED OHLC DATA
    if (isDebug) {
      console.log('✅ TRANSFORMED OHLC DATA:')
      console.log('📊 Total transformed points:', transformedData.length)
      console.log('📈 First 3 transformed points:', transformedData.slice(0, 3))
      console.log('📉 Last 3 transformed points:', transformedData.slice(-3))
    }

    // 🆕 Store OHLC data in Convex for caching with full OHLC information
    if (isDebug) {
      console.log(`💾 Starting OHLC data storage process for ${coinId}`)
      console.log(`📊 Raw OHLC data received: ${transformedData.length} points`)
      console.log(`📈 First OHLC point:`, transformedData[0])
    }
    
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
      
      if (isDebug) {
        console.log(`🎯 Calling Convex mutation with:`, {
          coingeckoId: coinId,
          timeframe: timeframe,
          dataPointsCount: dataPoints.length,
          dataSource: 'coingecko-ohlc',
          sampleDataPoint: dataPoints[0]
        })
      }
      
      // Fire and forget - don't block the response
      convex.mutation(api.historicalData.upsertCoinGeckoHistoricalData, {
        serverToken: getServerToken(),
        coingeckoId: coinId,
        timeframe: timeframe,
        dataPoints,
        dataSource: 'coingecko-ohlc'
      }).then((result) => {
        if (isDebug) {
          console.log(`✅ CONVEX SUCCESS: OHLC data stored for ${coinId}:`, {
            insertedCount: result.insertedCount,
            skippedCount: result.skippedCount,
            timeframe: result.timeframe,
            totalSubmitted: dataPoints.length
          })
        }
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