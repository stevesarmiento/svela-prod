// Helper function to format large numbers
export function formatNumber(num: number): string {
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`
  return num.toFixed(2)
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
