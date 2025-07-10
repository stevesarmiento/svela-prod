import { NextResponse } from 'next/server'
import { z } from 'zod'
import { env } from '@/env.mjs'
import type { CoinMarketData } from '@/types/coins'
import { 
  selectBestTemplate, 
  buildChartPrompt, 
  DEFAULT_DESIGN_SYSTEM 
} from '@/lib/v0-chart-prompts'
import type { 
  GenerationIntent, 
  ChartDataContext, 
  ChartGenerationContext 
} from '@/types/v0-chart-generation'

// Request validation schema
const GenerateChartRequestSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  coinData: z.array(z.object({
    id: z.number(),
    name: z.string(),
    symbol: z.string(),
    quote: z.object({
      USD: z.object({
        price: z.number(),
        percent_change_24h: z.number(),
        market_cap: z.number(),
        volume_24h: z.number()
      })
    })
  })),
  options: z.object({
    chartType: z.string().optional(),
    timeframe: z.string().optional(),
    preview: z.boolean().default(false)
  }).optional()
})

export async function POST(request: Request) {
  try {
    console.log('🎨 v0 Chart Generation API called')

    // Check if v0 API key is configured
    console.log('🔑 Checking V0_API_KEY:', {
      hasKey: !!env.V0_API_KEY,
      keyLength: env.V0_API_KEY ? env.V0_API_KEY.length : 0,
      keyPrefix: env.V0_API_KEY ? env.V0_API_KEY.substring(0, 8) + '...' : 'none'
    })
    
    if (!env.V0_API_KEY) {
      console.warn('⚠️ V0_API_KEY not configured')
      return NextResponse.json({
        success: false,
        error: 'v0 API key not configured',
        prompt: null
      }, { status: 500 })
    }

    // Parse and validate request
    const body = await request.json()
    const validation = GenerateChartRequestSchema.safeParse(body)
    
    if (!validation.success) {
      console.error('❌ Invalid request:', validation.error.errors)
      return NextResponse.json({
        success: false,
        error: 'Invalid request format',
        details: validation.error.errors
      }, { status: 400 })
    }

    const { query, coinData, options } = validation.data

    console.log('📊 Processing request:', {
      query: query.substring(0, 100),
      coinCount: coinData.length,
      options
    })

    // Build generation context
    const context = buildGenerationContext(query, coinData as CoinMarketData[])
    
    // Select best template
    const template = selectBestTemplate(
      context.intent,
      context.dataContext,
      query
    )

    console.log('🔧 Selected template:', template.name)

    // Build optimized prompt
    const prompt = buildChartPrompt(template, {
      intent: context.intent,
      dataContext: context.dataContext,
      designSystem: context.designSystem,
      userQuery: query
    })

    console.log('📝 Generated prompt:', {
      template: template.name,
      promptLength: prompt.length,
      intent: context.intent,
      dataContext: {
        coinCount: context.dataContext.coinCount,
        metrics: context.dataContext.availableMetrics
      }
    })

    // For testing, return the prompt and context
    if (options?.preview) {
      return NextResponse.json({
        success: true,
        preview: true,
        template: template.name,
        prompt: prompt.substring(0, 1000) + '...', // Truncated for preview
        context: {
          intent: context.intent,
          dataContext: context.dataContext
        }
      })
    }

    // Call v0 Platform API
    try {
      console.log('🚀 Calling v0 Platform API...')
      
      const { v0ChartGenerator } = await import('@/lib/v0-chart-generator')
      
      const result = await v0ChartGenerator.generateChartFromQuery(
        query,
        coinData as CoinMarketData[],
        {
          chartType: options?.chartType || 'custom',
          timeframe: options?.timeframe || '24h'
        }
      )

      console.log('✅ v0 generation result:', { 
        success: result.success,
        hasComponent: !!result.component 
      })

      if (result.success && result.component) {
        return NextResponse.json({
          success: true,
          component: result.component,
          usage: result.usage,
          meta: {
            template: template.name,
            promptLength: prompt.length,
            context: context.intent
          }
        })
      } else {
        throw new Error(result.error || 'v0 generation failed')
      }

    } catch (v0Error) {
      console.warn('⚠️ v0 API failed, falling back to mock:', v0Error)
      
      // Fallback to mock component
      const mockComponent = generateMockComponent(template.name, query, coinData.length)

      console.log('✅ Chart generation completed (mock fallback)')

      return NextResponse.json({
        success: true,
        component: mockComponent,
        usage: {
          tokensUsed: 0,
          responseTime: 0
        },
        meta: {
          template: template.name,
          promptLength: prompt.length,
          context: context.intent,
          fallback: true
        }
      })
    }

  } catch (error) {
    console.error('❌ Chart generation failed:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    }, { status: 500 })
  }
}

// Helper function to build generation context
function buildGenerationContext(
  query: string, 
  coinData: CoinMarketData[]
): ChartGenerationContext {
  // Analyze intent
  const intent = analyzeIntent(query, coinData.length)
  
  // Build data context
  const dataContext = buildDataContext(coinData)
  
  return {
    userQuery: query,
    intent,
    dataContext,
    designSystem: DEFAULT_DESIGN_SYSTEM,
    constraints: {
      maxComplexity: 8,
      allowedLibraries: ['lightweight-charts', 'recharts', '@number-flow/react'],
      performanceTargets: {
        maxRenderTime: 100,
        maxMemoryUsage: 50
      },
      accessibility: true
    }
  }
}

function analyzeIntent(query: string, coinCount: number): GenerationIntent {
  const queryLower = query.toLowerCase()

  // Determine primary intent
  let primary: GenerationIntent['primary'] = 'overview'
  if (queryLower.includes('compare') || coinCount > 1) {
    primary = 'comparison'
  } else if (queryLower.includes('technical') || queryLower.includes('indicator')) {
    primary = 'analysis'
  } else if (queryLower.includes('deep') || queryLower.includes('detailed')) {
    primary = 'deep_dive'
  }

  // Determine focus
  let focus: GenerationIntent['focus'] = 'price'
  if (queryLower.includes('volume')) focus = 'volume'
  else if (queryLower.includes('technical') || queryLower.includes('rsi') || queryLower.includes('macd')) focus = 'technical'
  else if (queryLower.includes('market cap') || queryLower.includes('fundamental')) focus = 'fundamental'

  // Determine complexity
  let complexity: GenerationIntent['complexity'] = 'moderate'
  if (queryLower.includes('simple') || queryLower.includes('basic')) complexity = 'simple'
  else if (queryLower.includes('advanced') || queryLower.includes('professional')) complexity = 'advanced'

  return {
    primary,
    focus,
    timeframe: 'short',
    complexity
  }
}

function buildDataContext(data: CoinMarketData[]): ChartDataContext {
  const availableMetrics = ['price', 'volume_24h', 'market_cap', 'percent_change_24h']
  
  // Check for additional metrics
  const firstCoin = data[0]
  if (firstCoin?.quote?.USD) {
    const usd = firstCoin.quote.USD
    if ('volume_change_24h' in usd) availableMetrics.push('volume_change')
    if ('market_cap_dominance' in usd) availableMetrics.push('dominance')
  }

  return {
    coinCount: data.length,
    dataQuality: data.length > 0 && data[0]?.quote?.USD ? 'high' : 'medium',
    timeRange: '24h',
    availableMetrics,
    missingData: []
  }
}

// Mock component generation for testing
function generateMockComponent(templateName: string, query: string, coinCount: number) {
  return {
    code: `
// Generated Chart Component: ${templateName}
// Query: ${query}
// Coins: ${coinCount}

import React from 'react'
import { Card, CardContent } from "@v1/ui/card"

export function GeneratedChart({ data, className }) {
  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="text-center text-zinc-400">
          <h3 className="text-lg font-semibold mb-2">Generated Chart</h3>
          <p>Template: ${templateName}</p>
          <p>Query: ${query.substring(0, 50)}...</p>
          <p>Coins: ${coinCount}</p>
          <div className="mt-4 p-8 bg-zinc-900/20 rounded-lg">
            Chart would render here
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
    `.trim(),
    files: [
      {
        path: 'GeneratedChart.tsx',
        content: '// Mock generated content',
        type: 'component' as const
      }
    ],
    dependencies: ['react', '@v1/ui/card'],
    metadata: {
      name: `GeneratedChart_${Date.now()}`,
      description: `Generated via ${templateName} template`,
      chartType: 'custom' as const,
      dataSource: 'mock',
      generatedAt: Date.now(),
      version: '1.0.0'
    }
  }
} 