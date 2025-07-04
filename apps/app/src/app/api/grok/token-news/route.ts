import { NextResponse } from 'next/server'
import { grok, isGrokAvailable } from '@/lib/grok'

export const runtime = 'edge'

export async function POST(req: Request) {
  if (!isGrokAvailable || !grok) {
    return NextResponse.json(
      { error: 'Grok API is not configured' },
      { status: 500 }
    )
  }

  try {
    const { name, symbol, timeframe = '24h' } = await req.json()

    if (!name || !symbol) {
      return NextResponse.json(
        { error: 'Token name and symbol are required' },
        { status: 400 }
      )
    }

    try {
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.XAI_API_KEY}`
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: `Analyze X (Twitter) sentiment and key discussions that EXPLICITLY mention "${name}" in the past ${timeframe}. ONLY include posts from the last 7 days.

              Rules:
              - Only include tweets that directly mention "${name}"
              - Ignore tweets that don't explicitly reference the token
              - Skip any posts older than 7 days

              Focus on:
              1. Overall sentiment (bullish/bearish/neutral)
              2. Notable tweets or discussions (must contain token name/symbol)
              3. Any significant announcements or developments

              Keep it brief and highlight only the most interesting or impactful points.`
            }
          ],
          search_parameters: {
            mode: 'on',
            return_citations: true,
            sources: [
              { 
                type: 'x',
                search_query: `"${name}" OR "${symbol}"` // Force exact match search
              }
            ],
            max_search_results: 20,
            from_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days ago
            to_date: new Date().toISOString().split('T')[0] // today
          },
          model: 'grok-3-latest'
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch analysis')
      }

      const data = await response.json()
      return NextResponse.json({ 
        analysis: data.choices[0].message.content,
        citations: data.citations || []
      })
    } catch (modelError) {
      console.error('Grok API error:', modelError)
      return NextResponse.json(
        { error: `Grok API error: ${modelError instanceof Error ? modelError.message : 'Unknown error'}` },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Error analyzing token news:', error)
    return NextResponse.json(
      { error: `Failed to analyze token news: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
} 