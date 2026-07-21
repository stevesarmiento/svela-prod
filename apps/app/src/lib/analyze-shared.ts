import { z } from 'zod'
import { formatLargeNumber } from '@v1/ui/format-numbers'

// Shared between /api/analyze (single token) and /api/analyze/compare (multi
// token). Route files may only export handlers, so the schema + prompt-block
// formatter live here.

// Enhanced schema to include all indicator data
export const IndicatorDataSchema = z.object({
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
      // Reverse-RSI trigger prices: next-bar close needed for RSI to print
      // each target (null = unreachable). Optional for older clients.
      reverseLevels: z.array(z.object({ target: z.number(), price: z.number().nullable() })).optional(),
      // Basis of the reverse levels (e.g. 'close_rsi14') — the displayed RSI
      // value above may use a different source series (hlc3).
      reverseBasis: z.string().optional(),
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

export type IndicatorData = z.infer<typeof IndicatorDataSchema>

export function formatIndicatorAnalysis(data: IndicatorData): string {
  const sections: string[] = []
  function average(values: Array<number>): number | null {
    if (values.length === 0) return null
    const sum = values.reduce((a, b) => a + b, 0)
    return sum / values.length
  }

  function minMax(values: Array<number>): { min: number; max: number } | null {
    if (values.length === 0) return null
    return { min: Math.min(...values), max: Math.max(...values) }
  }

  function pctChange(current: number, previous: number): number | null {
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null
    return ((current - previous) / previous) * 100
  }

  // Enhanced market data with historical context
  sections.push(`
**Market Overview:**
${data.name} (${data.symbol})
Price: $${data.quote.USD.price.toLocaleString()}
24h Change: ${data.quote.USD.percent_change_24h.toFixed(2)}%
Market Cap: $${formatLargeNumber(data.quote.USD.market_cap)}
24h Volume: $${formatLargeNumber(data.quote.USD.volume_24h)}${
    typeof data.quote.USD.volume_change_24h === 'number'
      ? `\n24h Volume Change: ${data.quote.USD.volume_change_24h.toFixed(2)}%`
      : ''
  }${
    typeof data.quote.USD.market_cap_dominance === 'number'
      ? `\nMarket Cap Dominance: ${data.quote.USD.market_cap_dominance.toFixed(2)}%`
      : ''
  }`)

  // Enhanced price context
  if (data.priceContext) {
    const { momentum, volatility, support, resistance, priceHistory } = data.priceContext
    const priceRange = `$${support.toLocaleString()} - $${resistance.toLocaleString()}`
    const historicalCount = priceHistory.length

    const last7 = priceHistory.slice(-7)
    const prev7 = priceHistory.slice(-14, -7)
    const last7Avg = average(last7)
    const prev7Avg = average(prev7)
    const weekDeltaPct = last7Avg !== null && prev7Avg !== null ? pctChange(last7Avg, prev7Avg) : null
    const range30 = minMax(priceHistory.slice(-30))

    sections.push(`
**Price Context (${historicalCount} periods):**
Momentum: ${momentum}, Volatility: ${volatility}
Support/Resistance Range: ${priceRange}${
      range30
        ? `\n30d Range (from provided history): $${range30.min.toLocaleString()} - $${range30.max.toLocaleString()}`
        : ''
    }${
      weekDeltaPct !== null
        ? `\n7d Avg vs Prior 7d Avg: ${weekDeltaPct > 0 ? '+' : ''}${weekDeltaPct.toFixed(2)}%`
        : ''
    }`)
  }

  // Enhanced volume analysis
  if (data.volumeAnalysis) {
    const { volumeTrend, volumeSpike, averageVolume, currentVolume } = data.volumeAnalysis
    const volumeChangePct =
      averageVolume > 0 ? ((currentVolume - averageVolume) / averageVolume) * 100 : null
    sections.push(`
**Volume Analysis:**
Trend: ${volumeTrend}, Volume vs Average: ${
      volumeChangePct === null ? 'N/A (insufficient/non-positive average)' : `${volumeChangePct > 0 ? '+' : ''}${volumeChangePct.toFixed(1)}%`
    }
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
    const { value, signal, trend, divergence, history, reverseLevels } = data.marketVision.rsi
    const trendText = trend ? `, ${trend} trend` : ''
    const divergenceText = divergence && divergence !== 'none' ? `, ${divergence} divergence` : ''
    const historyText = history && history.length > 0 ? ` (${history.length} periods)` : ''
    technicalSignals.push(`RSI: ${value.toFixed(1)} (${signal})${trendText}${divergenceText}${historyText}`)

    const reverseParts = (reverseLevels ?? [])
      .filter((level): level is { target: number; price: number } => level.price != null)
      .map((level) => `${level.target}→$${level.price.toLocaleString()}`)
    if (reverseParts.length > 0) {
      technicalSignals.push(`Reverse RSI trigger prices (next-bar close, standard 14p close-based RSI): ${reverseParts.join(' | ')}`)
    }
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

  if (data.marketVision?.mfi) {
    const { value, signal } = data.marketVision.mfi
    technicalSignals.push(`MFI: ${value.toFixed(1)} (${signal})`)
  }

  if (data.marketVision?.stochastic) {
    const { k, d, signal } = data.marketVision.stochastic
    technicalSignals.push(`Stochastic: K ${k.toFixed(1)}, D ${d.toFixed(1)} (${signal.replace('_', ' ')})`)
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
        marketStructure.push(`Liquidations: ${longRatio}% long, ${(100 - Number.parseFloat(longRatio)).toFixed(1)}% short`)
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

  // Lightweight historical summaries (avoid dumping raw series into the prompt)
  const historyLines: string[] = []
  if (data.priceContext?.priceHistory?.length) {
    const prices = data.priceContext.priceHistory.slice(-30)
    const mm = minMax(prices)
    const last7Avg = average(prices.slice(-7))
    const prev7Avg = average(prices.slice(-14, -7))
    const weekDelta = last7Avg !== null && prev7Avg !== null ? pctChange(last7Avg, prev7Avg) : null
    if (mm) historyLines.push(`Price(30d): min $${mm.min.toLocaleString()}, max $${mm.max.toLocaleString()}${weekDelta !== null ? `, 7dAvgΔ ${weekDelta > 0 ? '+' : ''}${weekDelta.toFixed(2)}%` : ''}`)
  }

  if (data.volumeAnalysis?.volumeHistory?.length) {
    const vols = data.volumeAnalysis.volumeHistory.slice(-30)
    const mm = minMax(vols)
    const last7Avg = average(vols.slice(-7))
    const prev7Avg = average(vols.slice(-14, -7))
    const weekDelta = last7Avg !== null && prev7Avg !== null ? pctChange(last7Avg, prev7Avg) : null
    if (mm) historyLines.push(`Volume(30d): min $${formatLargeNumber(mm.min)}, max $${formatLargeNumber(mm.max)}${weekDelta !== null ? `, 7dAvgΔ ${weekDelta > 0 ? '+' : ''}${weekDelta.toFixed(2)}%` : ''}`)
  }

  if (data.marketVision?.rsi?.history?.length) {
    const rsi = data.marketVision.rsi.history.slice(-30)
    const mm = minMax(rsi)
    const last7Avg = average(rsi.slice(-7))
    const prev7Avg = average(rsi.slice(-14, -7))
    const weekDelta = last7Avg !== null && prev7Avg !== null ? pctChange(last7Avg, prev7Avg) : null
    if (mm) historyLines.push(`RSI(30d): min ${mm.min.toFixed(1)}, max ${mm.max.toFixed(1)}${weekDelta !== null ? `, 7dAvgΔ ${weekDelta > 0 ? '+' : ''}${weekDelta.toFixed(2)}%` : ''}`)
  }

  if (data.bollingerBands?.history?.length) {
    const bb = data.bollingerBands.history.slice(-30)
    const mm = minMax(bb)
    if (mm) historyLines.push(`BB_Indicator(30d): min ${mm.min.toFixed(1)}, max ${mm.max.toFixed(1)} (${data.bollingerBands.indicator})`)
  }

  if (historyLines.length > 0) {
    sections.push(`\n**Historical Summaries (Derived):**\n${historyLines.map((l) => `• ${l}`).join('\n')}`)
  }

  return sections.join('\n')
}
