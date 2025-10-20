import { NextResponse } from 'next/server'
import { Effect } from "effect"

// Import the cache queue service getter from market-chart route
// Note: This is a simplified version - in production you'd want a shared singleton
export async function GET() {
  try {
    return NextResponse.json({
      message: 'Cache queue statistics endpoint',
      note: 'Queue service is isolated to each API route for now',
      recommendation: 'Check logs for queue statistics: "✅ Cached X points (total: Y)"'
    })
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to get stats',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}

