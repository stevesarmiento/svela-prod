import { streamText } from 'ai'
import { z } from 'zod'
import { gemini } from '@/lib/gemini'
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
  
  // ENHANCED: Historical price context
  priceContext: z.object({
    currentPrice: z.number(),
    priceHistory: z.array(z.number()),
    momentum: z.enum(['bullish', 'bearish']),
    volatility: z.enum(['high', 'moderate', 'low']),
    support: z.number(),
    resistance: z.number(),
  }).optional(),
  
  // ENHANCED: Volume analysis
  volumeAnalysis: z.object({
    currentVolume: z.number(),
    volumeHistory: z.array(z.number()),
    volumeTrend: z.enum(['increasing', 'decreasing', 'stable']),
    averageVolume: z.number(),
    volumeSpike: z.boolean(),
  }).optional(),
  
  // Hull Suite indicators
  hullSuite: z.object({
    trendDirection: z.enum(['bullish', 'bearish', 'neutral']),
    mhull: z.number().optional(),
    shull: z.number().optional(),
    crossoverSignal: z.enum(['trending_up', 'trending_down', 'none']).optional(),
    strength: z.enum(['strong', 'moderate', 'weak']).optional(),
  }).optional(),
  
  // ENHANCED: Bollinger Bands analysis with historical context
  bollingerBands: z.object({
    indicator: z.enum(['RSI', 'MFI']),
    currentValue: z.number(),
    upperBand: z.number(),
    lowerBand: z.number(),
    basis: z.number(),
    position: z.enum(['overbought', 'oversold', 'normal']),
    breachType: z.enum(['upper_breach', 'lower_breach', 'none']).optional(),
    divergence: z.enum(['bullish', 'bearish', 'none']).optional(),
    trend: z.string().optional(),
    history: z.array(z.number()).optional(),
  }).optional(),
  
  // ENHANCED: Market Vision indicators with trends
  marketVision: z.object({
    // Enhanced RSI with historical context
    rsi: z.object({
      value: z.number(),
      signal: z.enum(['overbought', 'oversold', 'neutral']),
      trend: z.string().optional(),
      history: z.array(z.number()).optional(),
      divergence: z.enum(['bullish', 'bearish', 'none']).optional(),
    }).optional(),
    
    mfi: z.object({
      value: z.number(),
      signal: z.enum(['overbought', 'oversold', 'neutral']),
    }).optional(),
    
    // Enhanced Wave Trend
    waveTrend: z.object({
      wt1: z.number(),
      wt2: z.number(),
      signal: z.enum(['bullish_cross', 'bearish_cross', 'overbought', 'oversold', 'neutral']),
      momentum: z.enum(['strong', 'moderate', 'weak']).optional(),
    }).optional(),
    
    // Enhanced Money Flow
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
  
  // Enhanced Order flow
  orderFlow: z.object({
    takerBuyRatio: z.number().optional(), // 0-1 ratio
    buyVolumeUsd: z.number().optional(), // Actual buy volume in USD
    sellVolumeUsd: z.number().optional(), // Actual sell volume in USD
    buyPressure: z.enum(['high', 'moderate', 'low']).optional(),
    sellPressure: z.enum(['high', 'moderate', 'low']).optional(),
    netFlow: z.enum(['bullish', 'bearish', 'neutral']).optional(),
  }).optional(),
  
  // Enhanced Price action context
  priceAction: z.object({
    trend: z.enum(['uptrend', 'downtrend', 'sideways']),
    volatility: z.enum(['high', 'moderate', 'low']),
    volume_profile: z.enum(['increasing', 'decreasing', 'stable']),
    priceLevel: z.enum(['support', 'resistance', 'breakout', 'breakdown', 'neutral']).optional(),
    momentum: z.enum(['bullish', 'bearish']).optional(),
    divergenceSignal: z.boolean().optional(),
  }).optional(),
  
  timeframe: z.string().optional(), // e.g., "30d", "7d", "1y"
})

type IndicatorData = z.infer<typeof IndicatorDataSchema>

function formatIndicatorAnalysis(data: IndicatorData): string {
  const sections: string[] = []
  
  // Enhanced market data with historical context
  sections.push(`
**Market Overview:**
${data.name} (${data.symbol})
Price: $${data.quote.USD.price.toLocaleString()}
24h Change: ${data.quote.USD.percent_change_24h.toFixed(2)}%
Market Cap: $${formatLargeNumber(data.quote.USD.market_cap)}
24h Volume: $${formatLargeNumber(data.quote.USD.volume_24h)}`)

  // Enhanced price context
  if (data.priceContext) {
    const { momentum, volatility, support, resistance, priceHistory } = data.priceContext
    const priceRange = `$${support.toLocaleString()} - $${resistance.toLocaleString()}`
    const historicalCount = priceHistory.length
    sections.push(`
**Price Context (${historicalCount} periods):**
Momentum: ${momentum}, Volatility: ${volatility}
Support/Resistance Range: ${priceRange}`)
  }

  // Enhanced volume analysis
  if (data.volumeAnalysis) {
    const { volumeTrend, volumeSpike, averageVolume, currentVolume } = data.volumeAnalysis
    const volumeChange = ((currentVolume - averageVolume) / averageVolume * 100).toFixed(1)
    sections.push(`
**Volume Analysis:**
Trend: ${volumeTrend}, Volume vs Average: ${volumeChange > '0' ? '+' : ''}${volumeChange}%
${volumeSpike ? 'VOLUME SPIKE DETECTED' : 'Normal volume activity'}`)
  }

  // Enhanced Technical Analysis Section
  const technicalSignals: string[] = []
  
  if (data.hullSuite) {
    const { trendDirection, crossoverSignal, strength } = data.hullSuite
    const signalText = crossoverSignal && crossoverSignal !== 'none' ? ` with ${crossoverSignal.replace('_', ' ')} signal` : ''
    const strengthText = strength ? ` (${strength} strength)` : ''
    technicalSignals.push(`Hull Suite: ${trendDirection} trend${signalText}${strengthText}`)
  }
  
  if (data.bollingerBands) {
    const { indicator, position, currentValue, breachType, trend, divergence, history } = data.bollingerBands
    const breachText = breachType && breachType !== 'none' ? ` with ${breachType.replace('_', ' ')}` : ''
    const trendText = trend ? `, ${trend} trend` : ''
    const divergenceText = divergence && divergence !== 'none' ? `, ${divergence} divergence` : ''
    const historyText = history && history.length > 0 ? ` (${history.length} period history)` : ''
    technicalSignals.push(`${indicator} Bollinger Bands: ${currentValue.toFixed(1)} - ${position}${breachText}${trendText}${divergenceText}${historyText}`)
  }
  
  if (data.marketVision?.rsi) {
    const { value, signal, trend, divergence, history } = data.marketVision.rsi
    const trendText = trend ? `, ${trend} trend` : ''
    const divergenceText = divergence && divergence !== 'none' ? `, ${divergence} divergence` : ''
    const historyText = history && history.length > 0 ? ` (${history.length} periods)` : ''
    technicalSignals.push(`RSI: ${value.toFixed(1)} (${signal})${trendText}${divergenceText}${historyText}`)
  }
  
  if (data.marketVision?.waveTrend) {
    const { signal, momentum, wt1, wt2 } = data.marketVision.waveTrend
    const momentumText = momentum ? ` with ${momentum} momentum` : ''
    const values = `WT1: ${wt1.toFixed(1)}, WT2: ${wt2.toFixed(1)}`
    technicalSignals.push(`Wave Trend: ${signal.replace('_', ' ')}${momentumText} (${values})`)
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
      const { takerBuyRatio, buyVolumeUsd, sellVolumeUsd, netFlow } = data.orderFlow
      if (takerBuyRatio !== undefined) {
        const volumeText = buyVolumeUsd && sellVolumeUsd ? 
          ` ($${formatLargeNumber(buyVolumeUsd)} buy / $${formatLargeNumber(sellVolumeUsd)} sell)` : ''
        marketStructure.push(`Taker Buy Ratio: ${(takerBuyRatio * 100).toFixed(1)}% (${netFlow || 'neutral'})${volumeText}`)
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
    
    // Console logging for API debugging
    console.log('=== API ROUTE ANALYSIS DEBUG (Gemini) ===')
    console.log('Received data for:', validatedData.name, validatedData.symbol)
    console.log('Current Price:', validatedData.quote.USD.price)
    console.log('Current RSI:', validatedData.marketVision?.rsi?.value)
    console.log('Support/Resistance:', validatedData.priceContext?.support, '/', validatedData.priceContext?.resistance)
    console.log('REAL Open Interest:', validatedData.liquidationData?.openInterest)
    console.log('REAL Liquidations 24h:', validatedData.liquidationData?.totalLiquidations24h)
    console.log('REAL Buy/Sell:', validatedData.orderFlow?.takerBuyRatio, 'ratio')
    console.log('REAL Buy Volume:', validatedData.orderFlow?.buyVolumeUsd)
    console.log('Volume Analysis:', validatedData.volumeAnalysis?.volumeTrend, validatedData.volumeAnalysis?.volumeSpike)
    console.log('Price History Length:', validatedData.priceContext?.priceHistory?.length)
    console.log('RSI History Length:', validatedData.marketVision?.rsi?.history?.length)
    console.log('===========================================')
    
    const indicatorSummary = formatIndicatorAnalysis(validatedData)

    const prompt = `
    You are an expert quantitative analyst specializing in technical analysis across traditional and digital asset markets. You understand that while technical principles are universal, cryptocurrency markets exhibit unique characteristics including 24/7 trading, higher volatility, and distinct market microstructure dynamics. You speak in a concise, professional manner, and are not too verbose.
    
    **DATA SPECIFICATION:**
    - **TIME INTERVAL**: Each data point = 1 DAY (24-hour periods)
    - **LOOKBACK PERIODS**: 30 days of historical data for trend analysis
    - **MOMENTUM ANALYSIS**: 7-day current vs 7-day previous averages
    - **SUPPORT/RESISTANCE**: 21-day (3-week) price extremes
    - **DIVERGENCE DETECTION**: 7-day moving averages for price vs RSI
    
    **CURRENT MARKET STATE with ${validatedData.timeframe || 'Multi-Period'} Historical Context:**
    ${indicatorSummary}
    
    **CRITICAL ANALYSIS FRAMEWORK**: 
    - **CURRENT VALUES** = Real market data NOW (RSI: ${validatedData.marketVision?.rsi?.value?.toFixed(1) || 'N/A'}, Price: $${validatedData.quote.USD.price.toLocaleString()})
    - **BOLLINGER BANDS** = RSI vs Upper/Lower bands (${validatedData.bollingerBands?.upperBand?.toFixed(1) || 'N/A'}/${validatedData.bollingerBands?.lowerBand?.toFixed(1) || 'N/A'}), Band position: ${validatedData.bollingerBands?.position || 'N/A'}
    - **HULL SUITE TREND** = Direction: ${validatedData.hullSuite?.trendDirection || 'N/A'}, Strength: ${validatedData.hullSuite?.strength || 'N/A'}
    - **REAL MARKET DATA** = Open Interest: $${(validatedData.liquidationData?.openInterest || 0).toLocaleString()}, **LIQUIDATIONS COMPLETED**: $${(validatedData.liquidationData?.totalLiquidations24h || 0).toLocaleString()} (already squeezed)
    - **REAL ORDER FLOW** = Buy Ratio: ${((validatedData.orderFlow?.takerBuyRatio || 0) * 100).toFixed(1)}%, Buy/Sell Volumes provided
    - **HISTORICAL CONTEXT** = 30 days of daily data for trend assessment (each point = 24 hours)
    - **NEVER HALLUCINATE** numbers beyond what's provided in current values
    
    **TIME-BASED ANALYSIS SCOPE:**
    - **Short-term signals**: Last 7 days vs previous 7 days (weekly momentum)
    - **Medium-term trend**: 30-day historical context (monthly trend)
    - **Support/Resistance**: 21-day extremes (3-week key levels)
    - **Divergence patterns**: 7-day moving averages (weekly trend comparison)
    
    Use historical context to assess:
    - Whether current indicators are improving/deteriorating over weekly periods
    - If real volume and order flow supports current price action
    - Divergence patterns between 7-day price and RSI trends
    - Whether current price is near 3-week support/resistance levels
    - How real liquidation data impacts market structure
    
    **DO NOT** invent new numbers. **ONLY** analyze the provided REAL market data using the specified time intervals.
    
    Provide a comprehensive technical assessment following this structured format:
    
    **TECHNICAL CONFLUENCE:**
    Synthesize the indicator signals into a unified technical thesis using BOTH current values AND 30-day historical trends. Identify confluences where multiple indicators align and note any divergences that warrant attention. Pay special attention to:
    - **RSI vs Bollinger Bands**: Analyze RSI position relative to upper band (${validatedData.bollingerBands?.upperBand?.toFixed(1) || 'N/A'}) and lower band (${validatedData.bollingerBands?.lowerBand?.toFixed(1) || 'N/A'}). Current RSI: ${validatedData.marketVision?.rsi?.value?.toFixed(1) || 'N/A'} - determine if approaching overbought/oversold levels or in normal range
    - **Hull Suite Trend Analysis**: Current trend direction (${validatedData.hullSuite?.trendDirection || 'N/A'}) with ${validatedData.hullSuite?.strength || 'N/A'} strength - assess trend continuation vs reversal signals
    - **RSI trend direction vs price momentum** (7-day comparisons) - check for bullish/bearish divergences
    - **Volume profile** supporting or contradicting price moves (weekly analysis)
    - **Historical support/resistance levels** (3-week extremes: $${validatedData.priceContext?.support?.toLocaleString() || 'N/A'} support, $${validatedData.priceContext?.resistance?.toLocaleString() || 'N/A'} resistance)
    - **Bollinger Band dynamics**: Band squeeze/expansion patterns and RSI position relative to bands over time
    
    **SIGNAL HIERARCHY:**
    Rank the 3-4 most significant signals by reliability and market impact, considering 30-day historical context:
    • [Primary Signal]: [Indicator with Weekly Trend] - [30-Day Context] - [Confidence Level]
    • [Secondary Signal]: [Indicator with Weekly Trend] - [Volume Confirmation] - [Market Implication]
    • [Tertiary Signal]: [Divergence/Confluence] - [3-Week Pattern] - [Risk Level]
    Include any cross-timeframe confirmations or contradictions from the daily data.
    
    **MARKET MICROSTRUCTURE:**
    Analyze order flow dynamics, liquidation patterns, and institutional positioning using 30-day volume trends:
    - **Volume trend analysis** (7-day vs 7-day) and spike detection 
    - **Liquidation aftermath**: $${(validatedData.liquidationData?.totalLiquidations24h || 0).toLocaleString()} in positions were liquidated (${((validatedData.liquidationData?.longLiquidations || 0) / ((validatedData.liquidationData?.totalLiquidations24h || 1))).toFixed(1)}% long, ${((validatedData.liquidationData?.shortLiquidations || 0) / ((validatedData.liquidationData?.totalLiquidations24h || 1))).toFixed(1)}% short) - assess what this squeeze means for current positioning
    - **Open Interest dynamics**: Current OI at $${(validatedData.liquidationData?.openInterest || 0).toLocaleString()} with ${((validatedData.liquidationData?.openInterestChange || 0) > 0 ? '+' : '')}${(validatedData.liquidationData?.openInterestChange || 0).toFixed(2)}% change - growing or declining leverage
    - **Price action relative to 3-week support/resistance levels** and liquidation zones
    - **Volume profile quality** and participation patterns from real buy/sell flow
    
    **HISTORICAL PATTERN ANALYSIS:**
    Based on 30 days of daily price data and RSI readings:
    - Identify any recurring patterns or cycles in the daily data
    - Assess momentum consistency or deterioration (weekly trends)
    - Evaluate indicator reliability in current market context
    - Note any unusual deviations from normal daily patterns
    
    **RISK FRAMEWORK:**
    Define the technical risk landscape using 21-day levels:
    - Key invalidation levels: 3-week support ($${validatedData.priceContext?.support?.toLocaleString() || 'N/A'}) and resistance ($${validatedData.priceContext?.resistance?.toLocaleString() || 'N/A'})
    - Probability-weighted scenarios based on 7-day momentum trends
    - Volatility expectations from recent daily price action
    - Volume-based confirmation requirements (weekly comparisons)
    
    **TACTICAL OUTLOOK:**
    Provide a probability-based assessment for the next 3-7 days using 30-day context:
    - Most likely scenario based on weekly momentum and volume trends
    - Alternative scenarios and their historical precedents in the daily data
    - Key levels to monitor for trend continuation/reversal (3-week levels)
    - Volume thresholds required for signal confirmation (weekly averages)
    
    **ENHANCED ANALYSIS PRINCIPLES:**
    - Use 30-day daily indicator trends to assess signal reliability
    - Weight volume confirmation heavily against 7-day averages
    - Consider indicator divergences as primary reversal signals (weekly trends)
    - Factor in 3-week support/resistance levels from price history
    - Distinguish between noise and meaningful technical developments using daily context
    - Account for momentum consistency across weekly periods
    
    Base all conclusions on the provided 30-day daily technical evidence. Use the temporal data to provide more nuanced and reliable analysis than point-in-time snapshots.
    `.trim()

    if (!gemini) {
      throw new Error('Gemini client not configured')
    }

    const result = await streamText({
      model: gemini('gemini-2.5-flash'), // Using Gemini Pro for complex technical analysis
      messages: [{ 
        role: 'user', 
        content: prompt 
      }],
      temperature: 0.3, // Lower temperature for more focused technical analysis
      maxTokens: 5000, // Increased for more detailed analysis
      onFinish: ({ text, finishReason }) => {
        console.log('Finish reason:', finishReason) // This will tell you why it stopped
        console.log('Response length:', text.length)
        if (finishReason === 'length') {
          console.warn('Response was truncated due to token limit!')
        }
      }
    })

    // Create a custom readable stream for simpler parsing
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          let totalChunks = 0
          for await (const chunk of result.textStream) {
            totalChunks++
            controller.enqueue(encoder.encode(chunk))
          }
          console.log(`Streamed ${totalChunks} chunks successfully`)
        } catch (error) {
          console.error('Streaming error:', error)
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