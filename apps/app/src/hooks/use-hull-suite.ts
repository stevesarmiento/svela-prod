'use client'

import { useMemo } from 'react'
import type { Time } from 'lightweight-charts'

interface HullSuiteConfig {
  source: 'close' | 'high' | 'low' | 'open'
  mode: 'Hma' | 'Ehma' | 'Thma'
  length: number
  lengthMult: number
  showBand: boolean
  thickness: number
  transparency: number
}

interface HullSuiteData {
  mhull: Array<{ time: Time; value: number }>
  shull: Array<{ time: Time; value: number }>
  trend: Array<{ time: Time; isUp: boolean }>
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

// Triangular Hull Moving Average
function THMA(data: number[], length: number): number[] {
  const thirdLength = Math.floor(length / 3)
  const halfLength = Math.floor(length / 2)
  
  const wma1 = wma(data, thirdLength)
  const wma2 = wma(data, halfLength)
  const wma3 = wma(data, length)
  
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

export function useHullSuite(data: OHLCVDataPoint[], config: HullSuiteConfig): HullSuiteData {
  const calculations = useMemo(() => {
    const defaultConfig: HullSuiteConfig = {
      source: 'close',
      mode: 'Hma',
      length: 55,
      lengthMult: 1.0,
      showBand: true,
      thickness: 1,
      transparency: 40,
    }
    
    const finalConfig = { ...defaultConfig, ...config }
    
    if (!data || data.length === 0) {
      return {
        mhull: [],
        shull: [],
        trend: []
      }
    }

    // Extract source data and filter out invalid values
    const sourceData = data.map(d => {
      switch (finalConfig.source) {
        case 'high': return d.high
        case 'low': return d.low
        case 'open': return d.open
        case 'close':
        default: return d.close
      }
    }).filter(value => !isNaN(value) && isFinite(value))

    if (sourceData.length === 0) {
      return {
        mhull: [],
        shull: [],
        trend: []
      }
    }

    const times = data.map(d => d.time)
    const adjustedLength = Math.floor(finalConfig.length * finalConfig.lengthMult)

    // Ensure minimum length
    if (adjustedLength < 1 || adjustedLength > sourceData.length) {
      return {
        mhull: [],
        shull: [],
        trend: []
      }
    }

    // Calculate Hull based on mode
    let hull: number[]
    try {
      switch (finalConfig.mode) {
        case 'Ehma':
          hull = EHMA(sourceData, adjustedLength)
          break
        case 'Thma':
          hull = THMA(sourceData, Math.floor(adjustedLength / 2))
          break
        case 'Hma':
        default:
          hull = HMA(sourceData, adjustedLength)
          break
      }
    } catch (error) {
      console.error('Hull calculation error:', error)
      return {
        mhull: [],
        shull: [],
        trend: []
      }
    }

    // MHULL is current hull value, SHULL is hull value 2 periods ago
    const mhullData: Array<{ time: Time; value: number }> = []
    const shullData: Array<{ time: Time; value: number }> = []
    const trendData: Array<{ time: Time; isUp: boolean }> = []

    for (let i = 0; i < times.length; i++) {
      const hullValue = hull[i]
      // Only add valid hull values (not NaN or infinite)
      if (hullValue !== undefined && !isNaN(hullValue) && isFinite(hullValue)) {
        mhullData.push({
          time: times[i] as Time,
          value: hullValue
        })

        // SHULL is hull value 2 periods ago
        const hullValue2 = hull[i - 2]
        if (hullValue2 !== undefined && !isNaN(hullValue2) && isFinite(hullValue2)) {
          shullData.push({
            time: times[i] as Time,
            value: hullValue2
          })
        }

        // Trend determination: current hull > hull 2 periods ago
        if (hullValue2 !== undefined && !isNaN(hullValue2) && isFinite(hullValue2)) {
          trendData.push({
            time: times[i] as Time,
            isUp: hullValue > hullValue2
          })
        }
      }
    }

    return {
      mhull: mhullData,
      shull: shullData,
      trend: trendData
    }
  }, [data, config])

  return calculations
}