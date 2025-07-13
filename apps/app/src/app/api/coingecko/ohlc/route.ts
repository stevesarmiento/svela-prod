import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const OHLCParamsSchema = z.object({
  id: z.string(),
  vs_currency: z.string().optional().default('usd'),
  days: z.enum(['1', '7', '14', '30', '90', '180', '365', 'max']).optional().default('7'),
  interval: z.enum(['daily', 'hourly']).optional().nullable(),
  precision: z.string().optional().nullable(),
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

    // Fetch data from CoinGecko API
    const cgApiKey = process.env.CG_API_KEY
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