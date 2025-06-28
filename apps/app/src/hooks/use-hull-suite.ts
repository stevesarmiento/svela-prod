'use client'

import { useMemo } from 'react'
import type { Time } from 'lightweight-charts'
import { generatePastelColors, addOpacityToColor } from '@/lib/chart-colors'

interface HullSuiteConfig {
  src: 'close' | 'high' | 'low' | 'open'
  modeSwitch: 'Hma' | 'Ehma' | 'Thma'
  length: number
  lengthMult: number
  useHtf: boolean
  htf: string
  switchColor: boolean
  candleCol: boolean
  visualSwitch: boolean
  thicknesSwitch: number
  transpSwitch: number
}

interface HullSuiteData {
  MHULL: Array<{ time: Time; value: number }>
  SHULL: Array<{ time: Time; value: number }>
  hullColor: Array<{ time: Time; color: string }>
  alerts: {
    trendingUp: Array<{ time: Time; message: string }>
    trendingDown: Array<{ time: Time; message: string }>
  }
}

interface OHLCVDataPoint {
  time: Time
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// Helper functions for different moving averages
function wma(data: number[], period: number): number[] {
  const result: number[] = []
  
  if (!data || data.length === 0 || period < 1) return result
  
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0
    let weightSum = 0
    
    for (let j = 0; j < period; j++) {
      const value = data[i - j]
      if (value !== undefined && !isNaN(value) && isFinite(value)) {
        const weight = period - j
        sum += value * weight
        weightSum += weight
      }
    }
    
    result[i] = weightSum > 0 ? sum / weightSum : NaN
  }
  
  return result
}

function ema(data: number[], period: number): number[] {
  const result: number[] = []
  const multiplier = 2 / (period + 1)
  
  if (!data || data.length === 0 || period < 1) return result
  
  // Find first valid value for initialization
  let firstValidIndex = 0
  while (firstValidIndex < data.length && (data[firstValidIndex] === undefined || isNaN(data[firstValidIndex] as number) || !isFinite(data[firstValidIndex] as number))) {
    firstValidIndex++
  }
  
  if (firstValidIndex >= data.length) return result
  
  result[firstValidIndex] = data[firstValidIndex] as number
  
  for (let i = firstValidIndex + 1; i < data.length; i++) {
    if (data[i] !== undefined && !isNaN(data[i] as number) && isFinite(data[i] as number) && result[i - 1] !== undefined && !isNaN(result[i - 1] as number) && isFinite(result[i - 1] as number)) {
      result[i] = (data[i] as number * multiplier) + (result[i - 1] as number * (1 - multiplier))
    } else {
      result[i] = result[i - 1] as number // Carry forward previous value if current is invalid
    }
  }
  
  return result
}

// Hull Moving Average
function HMA(data: number[], length: number): number[] {
  const halfLength = Math.floor(length / 2)
  const sqrtLength = Math.round(Math.sqrt(length))
  
  const wma1 = wma(data, halfLength)
  const wma2 = wma(data, length)
  
  // Calculate 2 * wma1 - wma2
  const diff: number[] = []
  for (let i = 0; i < data.length; i++) {
    const val1 = wma1[i]
    const val2 = wma2[i]
    if (val1 !== undefined && val2 !== undefined) {
      diff[i] = 2 * val1 - val2
    }
  }
  
  return wma(diff, sqrtLength)
}

// Exponential Hull Moving Average
function EHMA(data: number[], length: number): number[] {
  const halfLength = Math.floor(length / 2)
  const sqrtLength = Math.round(Math.sqrt(length))
  
  const ema1 = ema(data, halfLength)
  const ema2 = ema(data, length)
  
  // Calculate 2 * ema1 - ema2
  const diff: number[] = []
  for (let i = 0; i < data.length; i++) {
    const val1 = ema1[i]
    const val2 = ema2[i]
    if (val1 !== undefined && val2 !== undefined) {
      diff[i] = 2 * val1 - val2
    }
  }
  
  return ema(diff, sqrtLength)
}

// Triangular Hull Moving Average - Exact Pine Script implementation
// THMA(_src, _length) => wma(wma(_src,_length / 3) * 3 - wma(_src, _length / 2) - wma(_src, _length), _length)
function THMA(data: number[], length: number): number[] {
  const thirdLength = Math.floor(length / 3)
  const halfLength = Math.floor(length / 2)
  
  const wma1 = wma(data, thirdLength)  // wma(_src, _length / 3)
  const wma2 = wma(data, halfLength)   // wma(_src, _length / 2)
  const wma3 = wma(data, length)       // wma(_src, _length)
  
  // Calculate wma1 * 3 - wma2 - wma3
  const diff: number[] = []
  for (let i = 0; i < data.length; i++) {
    const val1 = wma1[i]
    const val2 = wma2[i]
    const val3 = wma3[i]
    if (val1 !== undefined && val2 !== undefined && val3 !== undefined) {
      diff[i] = val1 * 3 - val2 - val3
    }
  }
  
  return wma(diff, length)
}

// Mode Switch - Exact Pine Script implementation
function Mode(modeSwitch: string, src: number[], len: number): number[] {
  switch (modeSwitch) {
    case "Hma":
      return HMA(src, len)
    case "Ehma":
      return EHMA(src, len)
    case "Thma":
      return THMA(src, Math.floor(len / 2))  // THMA(src, len/2)
    default:
      return []
  }
}

export function useHullSuite(data: OHLCVDataPoint[], config: HullSuiteConfig): HullSuiteData {
  const calculations = useMemo(() => {
    // Generate Hull Suite colors - using single pastel color for both lines
    const hullColors = generatePastelColors(1)
    const primaryHullColor = addOpacityToColor(hullColors[0] || 'hsl(210, 40%, 75%)', 0.2)
    // Default configuration matching Pine Script inputs
    const defaultConfig: HullSuiteConfig = {
      src: 'close',
      modeSwitch: 'Hma',
      length: 55,
      lengthMult: 1.0,
      useHtf: false,
      htf: '240',
      switchColor: true,
      candleCol: false,
      visualSwitch: true,
      thicknesSwitch: 1,
      transpSwitch: 40
    }
    
    const finalConfig = { ...defaultConfig, ...config }
    
    if (!data || data.length === 0) {
      return {
        MHULL: [],
        SHULL: [],
        hullColor: [],
        alerts: {
          trendingUp: [],
          trendingDown: []
        }
      }
    }

    // Extract source data - Pine Script: src = input(close, title="Source")
    const sourceData = data.map(d => {
      switch (finalConfig.src) {
        case 'high': return d.high
        case 'low': return d.low
        case 'open': return d.open
        case 'close':
        default: return d.close
      }
    })

    const times = data.map(d => d.time)
    
    // Pine Script: int(length * lengthMult)
    const adjustedLength = Math.floor(finalConfig.length * finalConfig.lengthMult)

    if (adjustedLength < 1) {
      return {
        MHULL: [],
        SHULL: [],
        hullColor: [],
        alerts: {
          trendingUp: [],
          trendingDown: []
        }
      }
    }

    // Pine Script: _hull = Mode(modeSwitch, src, int(length * lengthMult))
    const _hull = Mode(finalConfig.modeSwitch, sourceData, adjustedLength)
    
    // Pine Script: HULL = useHtf ? security(syminfo.ticker, htf, _hull) : _hull
    // Note: Higher timeframe functionality would require additional implementation
    const HULL = finalConfig.useHtf ? _hull : _hull  // Simplified for now
    
    // Pine Script: MHULL = HULL[0], SHULL = HULL[2]
    const MHULLData: Array<{ time: Time; value: number }> = []
    const SHULLData: Array<{ time: Time; value: number }> = []
    const hullColorData: Array<{ time: Time; color: string }> = []
    const alertsData = {
      trendingUp: [] as Array<{ time: Time; message: string }>,
      trendingDown: [] as Array<{ time: Time; message: string }>
    }

    for (let i = 2; i < times.length; i++) {  // Start from index 2 to have HULL[2] available
      const MHULL = HULL[i]      // Current value: HULL[0]
      const SHULL = HULL[i - 2]  // Value 2 periods ago: HULL[2]
      
      if (MHULL !== undefined && !isNaN(MHULL) && isFinite(MHULL)) {
        MHULLData.push({
          time: times[i] as Time,
          value: MHULL
        })
        
        if (SHULL !== undefined && !isNaN(SHULL) && isFinite(SHULL)) {
          SHULLData.push({
            time: times[i] as Time,
            value: SHULL
          })
          
          // Use same pastel color for both trend directions with 70% opacity
          const color = primaryHullColor
            
          hullColorData.push({
            time: times[i] as Time,
            color: color
          })
          
          // Alert conditions
          // Pine Script: alertcondition(crossover(MHULL, SHULL), title="Hull trending up.", message="Hull trending up.")
          if (i > 2) {
            const prevMHULL = HULL[i - 1]
            const prevSHULL = HULL[i - 3]  // Previous SHULL (2 periods ago from previous)
            
            if (prevMHULL !== undefined && prevSHULL !== undefined) {
              // Crossover: MHULL crosses above SHULL
              if (prevMHULL <= prevSHULL && MHULL > SHULL) {
                alertsData.trendingUp.push({
                  time: times[i] as Time,
                  message: "Hull trending up."
                })
              }
              
              // Crossunder: MHULL crosses below SHULL  
              if (prevMHULL >= prevSHULL && MHULL < SHULL) {
                alertsData.trendingDown.push({
                  time: times[i] as Time,
                  message: "Hull trending down."
                })
              }
            }
          }
        }
      }
    }

    return {
      MHULL: MHULLData,
      SHULL: SHULLData,
      hullColor: hullColorData,
      alerts: alertsData
    }
  }, [data, config])

  return calculations
}