import { NextResponse } from 'next/server'
import { z } from 'zod'

const API_KEY = process.env.COINALYZE_API_KEY
const BASE_URL = 'https://api.coinalyze.net'

// Input validation schema
const QueryParamsSchema = z.object({
  symbols: z.string()
    .min(1)
    .refine(val => val.split(',').length <= 20, 'Maximum 20 symbols allowed'),
  interval: z.enum([
    '1min', '5min', '15min', '30min', '1hour',
    '2hour', '4hour', '6hour', '12hour', 'daily'
  ]),
  from: z.string().transform(val => parseInt(val, 10)),
  to: z.string().transform(val => parseInt(val, 10)),
  convert_to_usd: z.enum(['true', 'false']).optional().default('false')
})

async function fetchWithErrorHandling(url: string) {
  if (!API_KEY) {
    throw new Error('Coinalyze API key is not configured')
  }

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Accept': 'application/json'
    },
    next: {
      revalidate: 60 // Cache for 1 minute
    }
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new Error(
      errorData?.message || 
      `API error: ${response.status} ${response.statusText}`
    )
  }

  return response.json()
}

export async function GET(request: Request) {
  try {
    // Parse and validate query parameters
    const { searchParams } = new URL(request.url)
    const validatedParams = QueryParamsSchema.parse({
      symbols: searchParams.get('symbols'),
      interval: searchParams.get('interval'),
      from: searchParams.get('from'),
      to: searchParams.get('to'),
      convert_to_usd: searchParams.get('convert_to_usd') || 'false'
    })

    // Construct API URL
    const url = new URL('/v1/liquidation/history', BASE_URL)
    url.search = new URLSearchParams({
      symbols: validatedParams.symbols,
      interval: validatedParams.interval,
      from: validatedParams.from.toString(),
      to: validatedParams.to.toString(),
      convert_to_usd: validatedParams.convert_to_usd
    }).toString()

    // Fetch data
    const data = await fetchWithErrorHandling(url.toString())

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30'
      }
    })

  } catch (error) {
    console.error('Liquidations API error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}