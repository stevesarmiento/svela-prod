// Helper function to format large numbers
export function formatNumber(num: number): string {
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`
  return num.toFixed(2)
}

// Calculate trend direction from percentage change
export function getTrendDirection(percentChange: number): 'uptrend' | 'downtrend' | 'sideways' {
  if (percentChange > 2) return 'uptrend'
  if (percentChange < -2) return 'downtrend'
  return 'sideways'
}

// Calculate volatility level from percentage change
export function getVolatilityLevel(percentChange: number): 'high' | 'moderate' | 'low' {
  const absChange = Math.abs(percentChange)
  if (absChange > 5) return 'high'
  if (absChange > 2) return 'moderate'
  return 'low'
}

// Calculate volume trend from historical data
export function calculateVolumeTrend(recentVolume: number, previousVolume: number): 'increasing' | 'decreasing' | 'stable' {
  if (recentVolume > previousVolume * 1.2) return 'increasing'
  if (recentVolume < previousVolume * 0.8) return 'decreasing'
  return 'stable'
}

// Get RSI signal based on value
export function getRSISignal(rsiValue: number): 'overbought' | 'oversold' | 'neutral' {
  if (rsiValue > 70) return 'overbought'
  if (rsiValue < 30) return 'oversold'
  return 'neutral'
}

// Calculate divergence between price and RSI
export function calculateDivergence(
  currentPrice: number,
  previousAvgPrice: number,
  currentRSI: number,
  previousRSI: number
): 'bullish' | 'bearish' | 'none' {
  const priceDirection = currentPrice > previousAvgPrice ? 'up' : 'down'
  const rsiDirection = currentRSI > previousRSI ? 'up' : 'down'
  
  if (priceDirection !== rsiDirection) {
    return priceDirection === 'up' ? 'bearish' : 'bullish'
  }
  return 'none'
}

// Calculate support and resistance levels
export function calculateSupportResistance(priceHistory: number[], currentPrice: number) {
  if (priceHistory.length === 0) {
    return {
      support: currentPrice * 0.95,
      resistance: currentPrice * 1.05
    }
  }
  
  return {
    support: Math.min(...priceHistory),
    resistance: Math.max(...priceHistory)
  }
}

// Get trend strength indicator
export function getTrendStrength(percentChange: number): 'strong' | 'moderate' {
  return Math.abs(percentChange) > 3 ? 'strong' : 'moderate'
}

// Calculate buy/sell pressure levels
export function getBuySellPressure(ratio: number): 'high' | 'moderate' | 'low' {
  if (ratio > 52) return 'high'
  if (ratio > 48) return 'moderate'
  return 'low'
}

// Get badge variant based on trend direction
export function getTrendBadgeVariant(trend: 'bullish' | 'bearish' | 'neutral'): 'success' | 'destructive' | 'secondary' {
  switch (trend) {
    case 'bullish':
      return 'success'
    case 'bearish':
      return 'destructive'
    default:
      return 'secondary'
  }
}

// Calculate momentum from price arrays
export function calculateMomentum(recentPrices: number[], previousPrices: number[]): 'bullish' | 'bearish' {
  const recentAvg = recentPrices.length > 0 
    ? recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length 
    : 0
  const previousAvg = previousPrices.length > 0 
    ? previousPrices.reduce((a, b) => a + b, 0) / previousPrices.length 
    : 0
    
  return recentAvg > previousAvg ? 'bullish' : 'bearish'
}

// Calculate average from array
export function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
} 