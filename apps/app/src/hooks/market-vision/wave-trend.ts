'use client'

import type { OHLCVDataPoint, SeriesDataPoint } from './market-vision-config'
import { ema, sma, crossover, crossunder } from './technical-indicators'
import { generatePastelColors } from '../../lib/chart-colors'

// Generate consistent pastel colors for Wave Trend
const WAVE_TREND_COLORS = generatePastelColors(4)

export interface WaveTrendConfig {
  show: boolean
  source: 'hlc3' | 'close' | 'open' | 'high' | 'low'
  channelLength: number
  averageLength: number
  overbought: number
  oversold: number
  veryOverbought: number
  veryOversold: number
  showZeroCrossing: boolean
  showOBOSDuplication: boolean
  showDelta: boolean
  deltaOutlineOnly: boolean
}

export interface WaveTrendResult {
  // Wave Trend lines
  wt1: SeriesDataPoint[]        // Light blue wave
  wt2: SeriesDataPoint[]        // Blue wave
  delta: SeriesDataPoint[]      // Yellow wave (wt1 - wt2)
  
  // Cross signals
  positiveCrosses: SeriesDataPoint[]
  negativeCrosses: SeriesDataPoint[]
  zeroCrosses: SeriesDataPoint[]
  obPositiveCrosses: SeriesDataPoint[]
  obNegativeCrosses: SeriesDataPoint[]
  osPositiveCrosses: SeriesDataPoint[]
  osNegativeCrosses: SeriesDataPoint[]
  
  // Trend analysis
  trendFilter: {
    positive: boolean[]
    negative: boolean[]
  }
  
  // Colors for area rendering (using pastel colors)
  colors: {
    wt1Outline: string     // Soft blue outline
    wt1Area: string        // Soft blue area with transparency
    wt2Area: string        // Soft pink area
    deltaArea: string      // Soft green for delta
    fillArea: string       // Soft yellow fill between waves
  }
}

// Trend filter calculation (5 EMA alignment)
export function calculateTrendFilter(data: OHLCVDataPoint[]): { positive: boolean[], negative: boolean[] } {
  const closes = data.map(d => d.close)
  
  const ema15 = ema(closes, 15)
  const ema20 = ema(closes, 20)
  const ema30 = ema(closes, 30)
  const ema40 = ema(closes, 40)
  const ema50 = ema(closes, 50)
  
  const positive: boolean[] = []
  const negative: boolean[] = []
  
  for (let i = 0; i < data.length; i++) {
    const e15 = ema15[i]
    const e20 = ema20[i]
    const e30 = ema30[i]
    const e40 = ema40[i]
    const e50 = ema50[i]
    
    if (e15 != null && e20 != null && e30 != null && e40 != null && e50 != null) {
      positive[i] = e15 > e20 && e20 > e30 && e30 > e40 && e40 > e50
      negative[i] = e15 < e20 && e20 < e30 && e30 < e40 && e40 < e50
    } else {
      positive[i] = false
      negative[i] = false
    }
  }
  
  return { positive, negative }
}

export function calculateWaveTrend(
  data: OHLCVDataPoint[],
  config: WaveTrendConfig
): WaveTrendResult {
  if (!data.length) {
    return {
      wt1: [],
      wt2: [],
      delta: [],
      positiveCrosses: [],
      negativeCrosses: [],
      zeroCrosses: [],
      obPositiveCrosses: [],
      obNegativeCrosses: [],
      osPositiveCrosses: [],
      osNegativeCrosses: [],
      trendFilter: { positive: [], negative: [] },
      colors: {
        wt1Outline: WAVE_TREND_COLORS[0] || 'hsl(210, 40%, 75%)',
        wt1Area: WAVE_TREND_COLORS[0] || 'hsl(210, 40%, 75%)',
        wt2Area: WAVE_TREND_COLORS[1] || 'hsl(340, 45%, 78%)',
        deltaArea: WAVE_TREND_COLORS[2] || 'hsl(160, 42%, 72%)',
        fillArea: WAVE_TREND_COLORS[3] || 'hsl(45, 55%, 78%)'
      }
    }
  }

  const times = data.map(d => d.time)
  
  // Extract source data
  const sourceData = data.map(d => {
    switch (config.source) {
      case 'close': return d.close
      case 'open': return d.open
      case 'high': return d.high
      case 'low': return d.low
      default: return (d.high + d.low + d.close) / 3
    }
  })

  // Wave Trend calculation (LazyBear's method)
  const esa = ema(sourceData, config.channelLength)
  
  const d_values: number[] = []
  for (let i = 0; i < sourceData.length; i++) {
    const source = sourceData[i]
    const esaVal = esa[i]
    if (source != null && esaVal != null) {
      d_values[i] = Math.abs(source - esaVal)
    } else {
      d_values[i] = 0
    }
  }
  
  const d = ema(d_values, config.channelLength)
  
  const ci: number[] = []
  for (let i = 0; i < sourceData.length; i++) {
    const source = sourceData[i]
    const esaVal = esa[i]
    const dVal = d[i]
    
    if (source != null && esaVal != null && dVal != null && dVal !== 0) {
      ci[i] = (source - esaVal) / (0.015 * dVal)
    } else {
      ci[i] = 0
    }
  }
  
  const tci = ema(ci, config.averageLength)
  const wt1 = tci
  const wt2 = sma(wt1, 3)
  
  // Delta calculation
  const delta: number[] = []
  for (let i = 0; i < wt1.length; i++) {
    const w1 = wt1[i]
    const w2 = wt2[i]
    if (w1 != null && w2 != null) {
      delta[i] = w1 - w2
    } else {
      delta[i] = 0
    }
  }

  // Crossover calculations
  const wt1PosZeroCross = crossover(wt1, Array(wt1.length).fill(0))
  const wt1NegZeroCross = crossunder(wt1, Array(wt1.length).fill(0))
  
  const wt1PosCross = crossover(wt1, wt2)
  const wt1NegCross = crossunder(wt1, wt2)
  
  // Trend filter
  const trendFilter = calculateTrendFilter(data)
  
  // Convert to series data
  const createSeriesData = (values: number[]): SeriesDataPoint[] => {
    const result: SeriesDataPoint[] = []
    
    for (let i = 0; i < times.length; i++) {
      const value = values[i]
      const time = times[i]
      if (value != null && time != null && !Number.isNaN(value) && Number.isFinite(value)) {
        result.push({ time, value })
      }
    }
    
    return result
  }
  
  const createCrossData = (crosses: boolean[], baseValues: number[]): SeriesDataPoint[] => {
    const result: SeriesDataPoint[] = []
    for (let i = 0; i < times.length; i++) {
      const time = times[i]
      const value = baseValues[i]
      if (crosses[i] && value != null && time != null) {
        result.push({ time, value })
      }
    }
    return result
  }
  
  // OB/OS cross detection
  const obPositiveCrosses: SeriesDataPoint[] = []
  const obNegativeCrosses: SeriesDataPoint[] = []
  const osPositiveCrosses: SeriesDataPoint[] = []
  const osNegativeCrosses: SeriesDataPoint[] = []
  
  for (let i = 0; i < times.length; i++) {
    const w2 = wt2[i]
    const time = times[i]
    
    if (config.showOBOSDuplication && w2 != null && time != null) {
      if (wt1PosCross[i] && w2 > config.overbought) {
        obPositiveCrosses.push({ time, value: 40 })
      }
      if (wt1NegCross[i] && w2 > config.overbought) {
        obNegativeCrosses.push({ time, value: 40 })
      }
      if (wt1PosCross[i] && w2 < config.oversold) {
        osPositiveCrosses.push({ time, value: -40 })
      }
      if (wt1NegCross[i] && w2 < config.oversold) {
        osNegativeCrosses.push({ time, value: -40 })
      }
    }
  }
  
  // Create series data for wave rendering
  const wt1SeriesData = createSeriesData(wt1)
  const wt2SeriesData = createSeriesData(wt2)
  const deltaSeriesData = createSeriesData(delta)

  return {
    // Wave data
    wt1: wt1SeriesData,
    wt2: wt2SeriesData, 
    delta: deltaSeriesData,
    
    // Cross signals - dots at the actual cross points
    positiveCrosses: createCrossData(wt1PosCross, wt1), // Green dots when WT1 crosses above WT2
    negativeCrosses: createCrossData(wt1NegCross, wt1), // Red dots when WT1 crosses below WT2
    zeroCrosses: config.showZeroCrossing ? [
      ...createCrossData(wt1PosZeroCross, Array(wt1.length).fill(-30)),
      ...createCrossData(wt1NegZeroCross, Array(wt1.length).fill(-30))
    ] : [],
    obPositiveCrosses,
    obNegativeCrosses,
    osPositiveCrosses,
    osNegativeCrosses,
    
    // Trend analysis
    trendFilter,
    
    // Colors using pastel scheme
    colors: {
      wt1Outline: WAVE_TREND_COLORS[0] || 'hsl(210, 40%, 75%)',      // Soft blue outline for WT1
      wt1Area: WAVE_TREND_COLORS[0] || 'hsl(210, 40%, 75%)',         // Soft blue area for WT1 (with transparency in rendering)
      wt2Area: WAVE_TREND_COLORS[1] || 'hsl(340, 45%, 78%)',         // Soft pink area for WT2  
      deltaArea: WAVE_TREND_COLORS[2] || 'hsl(160, 42%, 72%)',       // Soft green for delta
      fillArea: WAVE_TREND_COLORS[3] || 'hsl(45, 55%, 78%)'          // Soft yellow fill between waves
    }
  }
}