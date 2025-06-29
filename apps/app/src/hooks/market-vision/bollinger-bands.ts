'use client'

import type { OHLCVDataPoint, SeriesDataPoint } from './market-vision-config'
import { sma, rsi, stdev } from './technical-indicators'
import { generatePastelColors, addOpacityToColor } from '@/lib/chart-colors'

// Bollinger Bands Configuration
export interface BollingerBandsConfig {
  // Indicator Settings
  drawRSI: boolean
  drawMFI: boolean
  highlightBreaches: boolean
  
  // RSI/MFI Parameters
  length: number        // RSI/MFI period (default: 14)
  source: 'hlc3' | 'close' | 'open' | 'high' | 'low'
  
  // Bollinger Bands Parameters
  bbLength: number      // BB period (default: 50, as per John Bollinger's book)
  multiplier: number    // BB multiplier (default: 2.0)
  
  // Visual Settings
  lineWidth: number
  fillOpacity: number
}

export interface BollingerBandsResult {
  // Primary indicator (RSI or MFI)
  indicator: SeriesDataPoint[]
  
  // Bollinger Bands
  basis: SeriesDataPoint[]      // SMA of the indicator
  upper: SeriesDataPoint[]      // Upper band
  lower: SeriesDataPoint[]      // Lower band
  
  // Breach detection
  overboughtBreaches: SeriesDataPoint[]    // Points above upper band
  oversoldBreaches: SeriesDataPoint[]      // Points below lower band
  
  // Colors for dynamic highlighting
  colors: {
    indicator: string
    basis: string
    bands: string
    fillArea: string
    overbought: string
    oversold: string
  }
}

// Default configuration
const DEFAULT_CONFIG: BollingerBandsConfig = {
  drawRSI: true,
  drawMFI: false,
  highlightBreaches: true,
  length: 14,
  source: 'hlc3',
  bbLength: 20, // Changed from 50 to 20 for better testing with limited data
  multiplier: 2.0,
  lineWidth: 2,
  fillOpacity: 0.1
}

// Generate consistent colors
const BB_COLORS = generatePastelColors(6)
const COLORS = {
  rsi: BB_COLORS[0] || 'hsl(340, 45%, 78%)',        // Soft pink for RSI
  mfi: BB_COLORS[1] || 'hsl(160, 42%, 72%)',        // Soft green for MFI
  basis: BB_COLORS[2] || 'hsl(0, 60%, 70%)',        // Soft red for basis (SMA)
  bands: BB_COLORS[3] || 'hsl(210, 40%, 75%)',      // Soft blue for bands
  fillArea: addOpacityToColor(BB_COLORS[3] || 'hsl(210, 40%, 75%)', 0.1), // Transparent blue fill
  overbought: BB_COLORS[4] || 'hsl(0, 60%, 70%)',   // Red for overbought
  oversold: BB_COLORS[5] || 'hsl(120, 60%, 70%)',   // Green for oversold
}

// Get source values from OHLCV data
function getSourceValues(data: OHLCVDataPoint[], source: string): number[] {
  switch (source) {
    case 'hlc3':
      return data.map(d => (d.high + d.low + d.close) / 3)
    case 'close':
      return data.map(d => d.close)
    case 'open':
      return data.map(d => d.open)
    case 'high':
      return data.map(d => d.high)
    case 'low':
      return data.map(d => d.low)
    default:
      return data.map(d => d.close)
  }
}

// Calculate MFI using the Pine Script logic
function calculateMFI(data: OHLCVDataPoint[], source: string, length: number): number[] {
  const sourceValues = getSourceValues(data, source)
  const volumes = data.map(d => d.volume)
  
  const upperSum: number[] = []
  const lowerSum: number[] = []
  
  for (let i = 0; i < data.length; i++) {
    let upper = 0
    let lower = 0
    
    for (let j = Math.max(0, i - length + 1); j <= i; j++) {
      const change = j > 0 ? (sourceValues[j] || 0) - (sourceValues[j - 1] || 0) : 0
      const volume = volumes[j] || 0
      const value = sourceValues[j] || 0
      
      if (change >= 0) {
        upper += volume * value
      } else {
        lower += volume * value
      }
    }
    
    upperSum[i] = upper
    lowerSum[i] = lower
  }
  
  // Calculate MFI as RSI of upper/lower sums
  const mfiValues: number[] = []
  for (let i = 0; i < upperSum.length; i++) {
    const upper = upperSum[i] || 0
    const lower = lowerSum[i] || 0
    
    if (upper + lower === 0) {
      mfiValues[i] = 50 // Default middle value
    } else {
      mfiValues[i] = 100 * upper / (upper + lower)
    }
  }
  
  return mfiValues
}

export function calculateBollingerBands(
  data: OHLCVDataPoint[],
  config: Partial<BollingerBandsConfig> = {}
): BollingerBandsResult {
  const finalConfig = { ...DEFAULT_CONFIG, ...config }
  
  // Calculate minimum data required
  const minDataRequired = finalConfig.length + finalConfig.bbLength
  
  if (data.length < minDataRequired) {
    console.warn(`⚠️ Bollinger Bands: Insufficient data! Have ${data.length}, need ${minDataRequired}. Results will be limited.`)
  }
  
  if (!data || data.length === 0) {
    return {
      indicator: [],
      basis: [],
      upper: [],
      lower: [],
      overboughtBreaches: [],
      oversoldBreaches: [],
      colors: {
        indicator: COLORS.rsi,
        basis: COLORS.basis,
        bands: COLORS.bands,
        fillArea: COLORS.fillArea,
        overbought: COLORS.overbought,
        oversold: COLORS.oversold
      }
    }
  }
  
  const times = data.map(d => d.time)
  const sourceValues = getSourceValues(data, finalConfig.source)
  
  // Determine which indicator to use based on config
  let indicatorValues: number[]
  let indicatorColor: string
  
  if (finalConfig.drawMFI && !finalConfig.drawRSI) {
    // MFI only
    indicatorValues = calculateMFI(data, finalConfig.source, finalConfig.length)
    indicatorColor = COLORS.mfi
  } else if (finalConfig.drawRSI && finalConfig.drawMFI) {
    // Both requested - Pine Script logic: prefer MFI, disable RSI
    indicatorValues = calculateMFI(data, finalConfig.source, finalConfig.length)
    indicatorColor = COLORS.mfi
  } else {
    // RSI (default)
    indicatorValues = rsi(sourceValues, finalConfig.length)
    indicatorColor = COLORS.rsi
  }
  
  // Check for invalid values
  const validIndicatorValues = indicatorValues.filter(v => v != null && !isNaN(v) && isFinite(v))
  if (validIndicatorValues.length === 0) {
    console.warn('⚠️ Bollinger Bands: No valid indicator values calculated')
  }
  
  // Calculate Bollinger Bands on the indicator
  const basis = sma(indicatorValues, finalConfig.bbLength)
  const standardDev = stdev(indicatorValues, finalConfig.bbLength)
  
  const upper: number[] = []
  const lower: number[] = []
  
  for (let i = 0; i < basis.length; i++) {
    const basisValue = basis[i]
    const deviation = standardDev[i]
    
    if (basisValue != null && deviation != null && !isNaN(basisValue) && !isNaN(deviation)) {
      upper[i] = basisValue + (finalConfig.multiplier * deviation)
      lower[i] = basisValue - (finalConfig.multiplier * deviation)
    }
  }
  
  // Convert to series data
  const createSeriesData = (values: number[]): SeriesDataPoint[] => {
    const result: SeriesDataPoint[] = []
    
    for (let i = 0; i < times.length; i++) {
      const value = values[i]
      const time = times[i]
      if (value != null && time != null && !isNaN(value) && isFinite(value)) {
        result.push({ time, value })
      }
    }
    
    return result
  }
  
  // Detect breaches
  const overboughtBreaches: SeriesDataPoint[] = []
  const oversoldBreaches: SeriesDataPoint[] = []
  
  for (let i = 0; i < indicatorValues.length; i++) {
    const indicator = indicatorValues[i]
    const upperBand = upper[i] 
    const lowerBand = lower[i]
    const time = times[i]
    
    if (indicator != null && time != null && !isNaN(indicator) && isFinite(indicator)) {
      if (upperBand != null && !isNaN(upperBand) && isFinite(upperBand) && indicator > upperBand) {
        overboughtBreaches.push({ time, value: indicator })
      }
      if (lowerBand != null && !isNaN(lowerBand) && isFinite(lowerBand) && indicator < lowerBand) {
        oversoldBreaches.push({ time, value: indicator })
      }
    }
  }
  
  const result = {
    indicator: createSeriesData(indicatorValues),
    basis: createSeriesData(basis),
    upper: createSeriesData(upper),
    lower: createSeriesData(lower),
    overboughtBreaches,
    oversoldBreaches,
    colors: {
      indicator: indicatorColor,
      basis: COLORS.basis,
      bands: COLORS.bands,
      fillArea: COLORS.fillArea,
      overbought: COLORS.overbought,
      oversold: COLORS.oversold
    }
  }
  
  return result
}

// Export types and defaults
export { COLORS as DEFAULT_BB_COLORS } 