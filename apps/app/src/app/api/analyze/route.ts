import { streamText } from 'ai'
import type { NextRequest } from 'next/server'
import { withAuthRatelimit } from '@/lib/api/with-auth-ratelimit'
import { z } from 'zod'
import { gemini } from '@/lib/gemini'
import { IndicatorDataSchema, formatIndicatorAnalysis } from '@/lib/analyze-shared'

export const POST = withAuthRatelimit(
  async (req: NextRequest) => {
    return handleAnalyze(req)
  },
  { name: 'analyze', requireAuth: true, limiter: 'llm' },
)

async function handleAnalyze(req: Request) {
  try {
    const rawData = await req.text()
    let data: unknown
    
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

    const longLiquidations = validatedData.liquidationData?.longLiquidations ?? 0
    const shortLiquidations = validatedData.liquidationData?.shortLiquidations ?? 0
    const directionalLiquidationsTotal = longLiquidations + shortLiquidations
    const longLiquidationsPct =
      directionalLiquidationsTotal > 0 ? (longLiquidations / directionalLiquidationsTotal) * 100 : 0
    const shortLiquidationsPct =
      directionalLiquidationsTotal > 0 ? (shortLiquidations / directionalLiquidationsTotal) * 100 : 0

    const prompt = `
    You are an expert quantitative analyst specializing in technical analysis across traditional and digital asset markets. You understand that while technical principles are universal, cryptocurrency markets exhibit unique characteristics including 24/7 trading, higher volatility, and distinct market microstructure dynamics. You speak in a concise, professional manner, and are not too verbose.
    
    **DATA SPECIFICATION:**
    - **TIME INTERVAL**: Each data point = 1 DAY (24-hour periods)
    - **LOOKBACK PERIODS (provided)**: Price ${validatedData.priceContext?.priceHistory?.length ?? 0}, Volume ${validatedData.volumeAnalysis?.volumeHistory?.length ?? 0}, RSI ${validatedData.marketVision?.rsi?.history?.length ?? 0}
    - **MOMENTUM ANALYSIS**: 7-day current vs 7-day previous averages (when ≥14 points are provided)
    - **SUPPORT/RESISTANCE**: 21-day extremes (when ≥21 points are provided)
    - **DIVERGENCE DETECTION**: 7-day moving averages for price vs RSI (when history is available)
    
    **CURRENT MARKET STATE with ${validatedData.timeframe || 'Multi-Period'} Historical Context:**
    ${indicatorSummary}
    
    **CRITICAL ANALYSIS FRAMEWORK**: 
    - **CURRENT VALUES** = Real market data NOW (RSI: ${validatedData.marketVision?.rsi?.value?.toFixed(1) || 'N/A'}, Price: $${validatedData.quote.USD.price.toLocaleString()})
    - **BOLLINGER BANDS** = RSI vs Upper/Lower bands (${validatedData.bollingerBands?.upperBand?.toFixed(1) || 'N/A'}/${validatedData.bollingerBands?.lowerBand?.toFixed(1) || 'N/A'}), Band position: ${validatedData.bollingerBands?.position || 'N/A'}
    - **HULL SUITE TREND** = Direction: ${validatedData.hullSuite?.trendDirection || 'N/A'}, Strength: ${validatedData.hullSuite?.strength || 'N/A'}
    - **REAL MARKET DATA** = Open Interest: ${validatedData.liquidationData?.openInterest !== undefined ? `$${validatedData.liquidationData.openInterest.toLocaleString()}` : 'N/A'}, **LIQUIDATIONS COMPLETED**: ${validatedData.liquidationData?.totalLiquidations24h !== undefined ? `$${validatedData.liquidationData.totalLiquidations24h.toLocaleString()}` : 'N/A'}
    - **REAL ORDER FLOW** = Buy Ratio: ${validatedData.orderFlow?.takerBuyRatio !== undefined ? `${(validatedData.orderFlow.takerBuyRatio * 100).toFixed(1)}%` : 'N/A'}, Buy Vol: ${validatedData.orderFlow?.buyVolumeUsd !== undefined ? `$${validatedData.orderFlow.buyVolumeUsd.toLocaleString()}` : 'N/A'}, Sell Vol: ${validatedData.orderFlow?.sellVolumeUsd !== undefined ? `$${validatedData.orderFlow.sellVolumeUsd.toLocaleString()}` : 'N/A'}
    - **HISTORICAL CONTEXT** = Use ONLY the history actually provided above (do not assume 30d if fewer points are present)
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
    
    **Technical Confluence**
    Synthesize the indicator signals into a unified technical thesis using BOTH current values AND 30-day historical trends. Identify confluences where multiple indicators align and note any divergences that warrant attention. Pay special attention to:
    - **RSI vs Bollinger Bands**: Analyze RSI position relative to upper band (${validatedData.bollingerBands?.upperBand?.toFixed(1) || 'N/A'}) and lower band (${validatedData.bollingerBands?.lowerBand?.toFixed(1) || 'N/A'}). Current RSI: ${validatedData.marketVision?.rsi?.value?.toFixed(1) || 'N/A'} - determine if approaching overbought/oversold levels or in normal range
    - **Hull Suite Trend Analysis**: Current trend direction (${validatedData.hullSuite?.trendDirection || 'N/A'}) with ${validatedData.hullSuite?.strength || 'N/A'} strength - assess trend continuation vs reversal signals
    - **RSI trend direction vs price momentum** (7-day comparisons) - check for bullish/bearish divergences
    - **Volume profile** supporting or contradicting price moves (weekly analysis)
    - **Historical support/resistance levels** (3-week extremes: $${validatedData.priceContext?.support?.toLocaleString() || 'N/A'} support, $${validatedData.priceContext?.resistance?.toLocaleString() || 'N/A'} resistance)
    - **Bollinger Band dynamics**: Band squeeze/expansion patterns and RSI position relative to bands over time
    
    **Signal Hierarchy**
    Rank the 3-4 most significant signals by reliability and market impact, considering 30-day historical context:
    • [Primary Signal]: [Indicator with Weekly Trend] - [30-Day Context] - [Confidence Level]
    • [Secondary Signal]: [Indicator with Weekly Trend] - [Volume Confirmation] - [Market Implication]
    • [Tertiary Signal]: [Divergence/Confluence] - [3-Week Pattern] - [Risk Level]
    Include any cross-timeframe confirmations or contradictions from the daily data.
    
    **Market Microstructure**
    Analyze order flow dynamics, liquidation patterns, and institutional positioning using 30-day volume trends:
    - **Volume trend analysis** (7-day vs 7-day) and spike detection 
    - **Liquidation aftermath**: $${(validatedData.liquidationData?.totalLiquidations24h || 0).toLocaleString()} in positions were liquidated (${longLiquidationsPct.toFixed(1)}% long, ${shortLiquidationsPct.toFixed(1)}% short) - assess what this squeeze means for current positioning
    - **Open Interest dynamics**: Current OI at $${(validatedData.liquidationData?.openInterest || 0).toLocaleString()} with ${((validatedData.liquidationData?.openInterestChange || 0) > 0 ? '+' : '')}${(validatedData.liquidationData?.openInterestChange || 0).toFixed(2)}% change - growing or declining leverage
    - **Price action relative to 3-week support/resistance levels** and liquidation zones
    - **Volume profile quality** and participation patterns from real buy/sell flow
    
    **Historical Pattern Analysis**
    Based on 30 days of daily price data and RSI readings:
    - Identify any recurring patterns or cycles in the daily data
    - Assess momentum consistency or deterioration (weekly trends)
    - Evaluate indicator reliability in current market context
    - Note any unusual deviations from normal daily patterns
    
    **Risk Framework**
    Define the technical risk landscape using 21-day levels:
    - Key invalidation levels: 3-week support ($${validatedData.priceContext?.support?.toLocaleString() || 'N/A'}) and resistance ($${validatedData.priceContext?.resistance?.toLocaleString() || 'N/A'})
    - Probability-weighted scenarios based on 7-day momentum trends
    - Volatility expectations from recent daily price action
    - Volume-based confirmation requirements (weekly comparisons)
    
    **Tactical Outlook**
    Provide a probability-based assessment for the next 3-7 days using 30-day context:
    - Most likely scenario based on weekly momentum and volume trends
    - Alternative scenarios and their historical precedents in the daily data
    - Key levels to monitor for trend continuation/reversal (3-week levels)
    - Volume thresholds required for signal confirmation (weekly averages)
    
    **Enhanced Analysis Principles**
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

    const result = streamText({
      model: gemini('gemini-2.5-flash'), // Using Gemini Pro for complex technical analysis
      messages: [{ 
        role: 'user', 
        content: prompt 
      }],
      temperature: 0.3, // Lower temperature for more focused technical analysis
      maxOutputTokens: 5000, // Increased for more detailed analysis
      abortSignal: req.signal,
      onFinish: ({ text, finishReason }) => {
        console.log('Finish reason:', finishReason) // This will tell you why it stopped
        console.log('Response length:', text.length)
        if (finishReason === 'length') {
          console.warn('Response was truncated due to token limit!')
        }
      }
    } as Parameters<typeof streamText>[0])

    return result.toTextStreamResponse({
      headers: {
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        'X-Content-Type-Options': 'nosniff',
      },
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