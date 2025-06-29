import { streamText } from 'ai'
import { z } from 'zod'
import { openai } from '@/lib/openai'
import { formatLargeNumber } from '@v1/ui/format-numbers'

// Enhanced schema to include all indicator data
const IndicatorDataSchema = z.object({
  // Basic market data
  name: z.string(),
  symbol: z.string(),
  quote: z.object({
    USD: z.object({
      price: z.number(),
      percent_change_24h: z.number(),
      market_cap: z.number(),
      volume_24h: z.number(),
      volume_change_24h: z.number().optional(),
      market_cap_dominance: z.number().optional(),
    }),
  }),
  
  // Hull Suite indicators
  hullSuite: z.object({
    trendDirection: z.enum(['bullish', 'bearish', 'neutral']),
    mhull: z.number().optional(),
    shull: z.number().optional(),
    crossoverSignal: z.enum(['trending_up', 'trending_down', 'none']).optional(),
    strength: z.enum(['strong', 'moderate', 'weak']).optional(),
  }).optional(),
  
  // Bollinger Bands analysis
  bollingerBands: z.object({
    indicator: z.enum(['RSI', 'MFI']),
    currentValue: z.number(),
    upperBand: z.number(),
    lowerBand: z.number(),
    basis: z.number(),
    position: z.enum(['overbought', 'oversold', 'normal']),
    breachType: z.enum(['upper_breach', 'lower_breach', 'none']).optional(),
    divergence: z.enum(['bullish', 'bearish', 'none']).optional(),
  }).optional(),
  
  // Market Vision indicators
  marketVision: z.object({
    // Oscillators
    rsi: z.object({
      value: z.number(),
      signal: z.enum(['overbought', 'oversold', 'neutral']),
    }).optional(),
    
    mfi: z.object({
      value: z.number(),
      signal: z.enum(['overbought', 'oversold', 'neutral']),
    }).optional(),
    
    // Wave Trend
    waveTrend: z.object({
      wt1: z.number(),
      wt2: z.number(),
      signal: z.enum(['bullish_cross', 'bearish_cross', 'overbought', 'oversold', 'neutral']),
      momentum: z.enum(['strong', 'moderate', 'weak']).optional(),
    }).optional(),
    
    // Money Flow
    moneyFlow: z.object({
      direction: z.enum(['inflow', 'outflow', 'neutral']),
      strength: z.enum(['strong', 'moderate', 'weak']),
      value: z.number().optional(),
    }).optional(),
    
    // Stochastic
    stochastic: z.object({
      k: z.number(),
      d: z.number(),
      signal: z.enum(['overbought', 'oversold', 'bullish_cross', 'bearish_cross', 'neutral']),
    }).optional(),
  }).optional(),
  
  // Liquidation and OI data
  liquidationData: z.object({
    totalLiquidations24h: z.number().optional(),
    longLiquidations: z.number().optional(),
    shortLiquidations: z.number().optional(),
    liquidationRatio: z.number().optional(), // long/short ratio
    openInterest: z.number().optional(),
    openInterestChange: z.number().optional(),
  }).optional(),
  
  // Buy/Sell pressure
  orderFlow: z.object({
    takerBuyRatio: z.number().optional(), // 0-1 ratio
    buyPressure: z.enum(['high', 'moderate', 'low']).optional(),
    sellPressure: z.enum(['high', 'moderate', 'low']).optional(),
    netFlow: z.enum(['bullish', 'bearish', 'neutral']).optional(),
  }).optional(),
  
  // Price action context
  priceAction: z.object({
    trend: z.enum(['uptrend', 'downtrend', 'sideways']),
    volatility: z.enum(['high', 'moderate', 'low']),
    volume_profile: z.enum(['increasing', 'decreasing', 'stable']),
    priceLevel: z.enum(['support', 'resistance', 'breakout', 'breakdown', 'neutral']).optional(),
  }).optional(),
  
  timeframe: z.string().optional(), // e.g., "30d", "7d", "1y"
})

type IndicatorData = z.infer<typeof IndicatorDataSchema>

function formatIndicatorAnalysis(data: IndicatorData): string {
  const sections: string[] = []
  
  // Basic market data
  sections.push(`
**Market Overview:**
${data.name} (${data.symbol})
Price: $${data.quote.USD.price.toLocaleString()}
24h Change: ${data.quote.USD.percent_change_24h.toFixed(2)}%
Market Cap: $${formatLargeNumber(data.quote.USD.market_cap)}
24h Volume: $${formatLargeNumber(data.quote.USD.volume_24h)}`)

  // Technical Analysis Section
  const technicalSignals: string[] = []
  
  if (data.hullSuite) {
    const { trendDirection, crossoverSignal, strength } = data.hullSuite
    const signalText = crossoverSignal && crossoverSignal !== 'none' ? ` with ${crossoverSignal.replace('_', ' ')} signal` : ''
    const strengthText = strength ? ` (${strength} strength)` : ''
    technicalSignals.push(`Hull Suite: ${trendDirection} trend${signalText}${strengthText}`)
  }
  
  if (data.bollingerBands) {
    const { indicator, position, currentValue, breachType } = data.bollingerBands
    const breachText = breachType && breachType !== 'none' ? ` with ${breachType.replace('_', ' ')}` : ''
    technicalSignals.push(`${indicator} Bollinger Bands: ${currentValue.toFixed(1)} - ${position}${breachText}`)
  }
  
  if (data.marketVision?.rsi) {
    technicalSignals.push(`RSI: ${data.marketVision.rsi.value.toFixed(1)} (${data.marketVision.rsi.signal})`)
  }
  
  if (data.marketVision?.waveTrend) {
    const { signal, momentum } = data.marketVision.waveTrend
    const momentumText = momentum ? ` with ${momentum} momentum` : ''
    technicalSignals.push(`Wave Trend: ${signal.replace('_', ' ')}${momentumText}`)
  }
  
  if (data.marketVision?.moneyFlow) {
    const { direction, strength } = data.marketVision.moneyFlow
    technicalSignals.push(`Money Flow: ${direction} (${strength})`)
  }
  
  if (technicalSignals.length > 0) {
    sections.push(`\n**Technical Indicators:**\n${technicalSignals.map(s => `• ${s}`).join('\n')}`)
  }
  
  // Market Structure Section
  if (data.liquidationData || data.orderFlow) {
    const marketStructure: string[] = []
    
    if (data.liquidationData) {
      const { longLiquidations, shortLiquidations, openInterest, openInterestChange } = data.liquidationData
      if (longLiquidations !== undefined && shortLiquidations !== undefined) {
        const total = longLiquidations + shortLiquidations
        const longRatio = (longLiquidations / total * 100).toFixed(1)
        marketStructure.push(`Liquidations: ${longRatio}% long, ${(100 - parseFloat(longRatio)).toFixed(1)}% short`)
      }
      if (openInterest !== undefined) {
        const changeText = openInterestChange ? ` (${openInterestChange > 0 ? '+' : ''}${openInterestChange.toFixed(1)}%)` : ''
        marketStructure.push(`Open Interest: $${formatLargeNumber(openInterest)}${changeText}`)
      }
    }
    
    if (data.orderFlow) {
      const { takerBuyRatio, netFlow } = data.orderFlow
      if (takerBuyRatio !== undefined) {
        marketStructure.push(`Taker Buy Ratio: ${(takerBuyRatio * 100).toFixed(1)}% (${netFlow || 'neutral'})`)
      }
    }
    
    if (marketStructure.length > 0) {
      sections.push(`\n**Market Structure:**\n${marketStructure.map(s => `• ${s}`).join('\n')}`)
    }
  }
  
  // Price Action Context
  if (data.priceAction) {
    const { trend, volatility, volume_profile, priceLevel } = data.priceAction
    const priceLevelText = priceLevel && priceLevel !== 'neutral' ? `, Price Level: ${priceLevel}` : ''
    sections.push(`\n**Price Action:**\nTrend: ${trend}, Volatility: ${volatility}, Volume: ${volume_profile}${priceLevelText}`)
  }
  
  return sections.join('\n')
}

export async function POST(req: Request) {
  try {
    const rawData = await req.text()
    let data
    
    try {
      const parsed = JSON.parse(rawData)
      data = parsed.prompt ? JSON.parse(parsed.prompt) : parsed
    } catch (e) {
      console.error('JSON parse error:', e)
      return new Response(
        JSON.stringify({ error: 'Invalid JSON data' }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    const validatedData = IndicatorDataSchema.parse(data)
    const indicatorSummary = formatIndicatorAnalysis(validatedData)

    const prompt = `
You are a professional cryptocurrency technical analyst. Analyze the following comprehensive market data and provide expert insights.

${indicatorSummary}

Based on this comprehensive technical analysis data, provide a detailed assessment in the following format:

**Technical Analysis Summary:**
[Synthesize all the technical indicators into a cohesive 2-3 sentence technical outlook]

**Key Signals:**
[List the 3-4 most important signals from the indicators and what they suggest]

**Market Structure:**
[Analyze the liquidation data, order flow, and market dynamics in 2-3 sentences]

**Risk Assessment:**
[Identify key risks and support/resistance levels based on the technical data]

**Outlook:**
[Provide a balanced short-term outlook based on all the technical evidence]

Focus on actionable insights and avoid speculation. Base your analysis strictly on the provided technical indicators and market data.
    `.trim()

    if (!openai) {
      throw new Error('OpenAI client not configured')
    }

    const result = await streamText({
      model: openai.chat('gpt-4o-mini'), // Using a more capable model for complex analysis
      messages: [{ 
        role: 'user', 
        content: prompt 
      }],
      temperature: 0.3, // Lower temperature for more focused technical analysis
      maxTokens: 800, // Increased for more detailed analysis
      onFinish: ({ text }) => {
        console.log('Final technical analysis:', text)
      }
    })

    // Create a custom readable stream for simpler parsing
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.textStream) {
            // Send plain text chunks without metadata
            controller.enqueue(encoder.encode(chunk))
          }
        } catch (error) {
          controller.error(error)
        } finally {
          controller.close()
        }
      }
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Content-Type-Options': 'nosniff'
      }
    })
  } catch (error) {
    console.error('Analysis error:', error)
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid data format',
          details: error.errors 
        }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
    return new Response(
      JSON.stringify({ error: 'Failed to generate analysis' }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}