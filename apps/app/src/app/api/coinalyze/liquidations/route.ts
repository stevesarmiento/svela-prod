import { NextResponse } from 'next/server'
import { ConvexHttpClient } from "convex/browser"
import { api } from "../../../../../convex/_generated/api"
import { slugToCoinalyzeSymbol, generateCoinalyzeSymbol } from '@/lib/coinalyze-mapper'

const API_KEY = process.env.COINALYZE_API_KEY
const BASE_URL = 'https://api.coinalyze.net'
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

// Add this interface at the top of the file
interface LiquidationHistoryItem {
  t: number; // timestamp
  l: number; // long liquidations
  s: number; // short liquidations
}

async function fetchWithErrorHandling(url: string) {
  if (!API_KEY) {
    throw new Error('Coinalyze API key is not configured')
  }

  try {
    const response = await fetch(url, {
      headers: {
        'api_key': API_KEY,
      },
      next: {
        revalidate: 300, // Cache for 5 minutes
      },
    })

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After')
      throw new Error(`Rate limit exceeded. Retry after ${retryAfter} seconds`)
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    return response.json()
  } catch (error) {
    console.error("Coinalyze API error:", error)
    throw error
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const cmcId = searchParams.get('cmcId')

    if (!cmcId) {
      return NextResponse.json(
        { error: 'Missing cmcId parameter' },
        { status: 400 }
      )
    }

    // Get metadata from database
    const metadata = await convex.query(api.coins.getMetadataByCoinId, { 
      coinId: parseInt(cmcId) 
    })

    if (!metadata) {
      return NextResponse.json({
        longLiquidations: null,
        shortLiquidations: null,
        totalLiquidations: null,
        symbol: null,
        lastUpdate: null
      })
    }

    // Try hardcoded mapping first, then fallback to pattern
    let coinalyzeSymbol = slugToCoinalyzeSymbol(metadata.slug)
    
    if (!coinalyzeSymbol) {
      coinalyzeSymbol = generateCoinalyzeSymbol(metadata.symbol)
    }

    // Get data for the last 24 hours
    const now = Math.floor(Date.now() / 1000)
    const yesterday = now - (24 * 60 * 60)

    console.log('Liquidations - CMC ID:', cmcId, 'Slug:', metadata.slug, 'Symbol:', coinalyzeSymbol)

    const data = await fetchWithErrorHandling(
      `${BASE_URL}/v1/liquidation-history?symbols=${encodeURIComponent(coinalyzeSymbol)}&interval=1hour&from=${yesterday}&to=${now}&convert_to_usd=true`
    )

    // console.log('=== LIQUIDATIONS RAW API RESPONSE ===');
    // console.log('URL:', `${BASE_URL}/v1/liquidation-history?symbols=${encodeURIComponent(coinalyzeSymbol)}&interval=1hour&from=${yesterday}&to=${now}&convert_to_usd=true`);
    // console.log('Raw response:', JSON.stringify(data, null, 2));
    // console.log('Data type:', typeof data);
    // console.log('Is array:', Array.isArray(data));
    // console.log('Data length:', Array.isArray(data) ? data.length : 'N/A');
    // if (Array.isArray(data) && data.length > 0) {
    //   console.log('First item:', JSON.stringify(data[0], null, 2));
    //   if (data[0].history) {
    //     console.log('History length:', data[0].history.length);
    //     console.log('Latest history item:', JSON.stringify(data[0].history[data[0].history.length - 1], null, 2));
    //   }
    // }
    // console.log('====================================');

    // API returns an array with symbol and history
    if (Array.isArray(data) && data.length > 0) {
      const symbolData = data[0]
      
      if (symbolData.history && symbolData.history.length > 0) {
        // Calculate totals for the entire 24-hour period
        const total24hLongs = symbolData.history.reduce((sum: number, item: LiquidationHistoryItem) => sum + (item.l || 0), 0)
        const total24hShorts = symbolData.history.reduce((sum: number, item: LiquidationHistoryItem) => sum + (item.s || 0), 0)
        const latestData = symbolData.history[symbolData.history.length - 1]
        
        return NextResponse.json({
          longLiquidations: total24hLongs,
          shortLiquidations: total24hShorts,
          totalLiquidations: total24hLongs + total24hShorts,
          symbol: symbolData.symbol,
          lastUpdate: latestData.t,
          historical: symbolData.history // This is the key - keeping all historical data
        })
      }
    }

    // No data found
    return NextResponse.json({
      longLiquidations: null,
      shortLiquidations: null,
      totalLiquidations: null,
      symbol: coinalyzeSymbol,
      lastUpdate: null,
      historical: []
    })

  } catch (error) {
    console.error('Coinalyze liquidations route error:', error)
    
    // Return no data state instead of error
    return NextResponse.json({
      longLiquidations: null,
      shortLiquidations: null,
      totalLiquidations: null,
      symbol: null,
      lastUpdate: null,
      historical: []
    })
  }
}