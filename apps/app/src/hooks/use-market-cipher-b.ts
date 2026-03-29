'use client'

import { useMemo } from 'react'
import type { Time } from 'lightweight-charts'

interface OHLCVDataPoint {
  time: Time
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface MarketCipherBConfig {
  // Wave Trend settings  
  wtChannelLength: number      // n1 = 9
  wtAverageLength: number      // n2 = 12
  wtOverbought: number         // 50
  wtOversold: number          // -50
  
  // Money Flow settings
  moneyFlowLength: number      // 59
  moneyFlowMultiplier: number  // 205
  
  // RSI settings
  rsiLength: number           // 13
  rsiSignalLength: number     // 21
  
  // Stochastic settings
  stochRSILength: number      // 13
  stochLength: number         // 13  
  stochKSmoothing: number     // 3
  stochDSmoothing: number     // 3
}

// Technical Analysis Helper Functions
function ema(data: number[], period: number): number[] {
  const result: number[] = []
  const multiplier = 2 / (period + 1)
  
  if (data.length === 0) return result
  
  // Find first valid value
  let firstValidIndex = 0
  while (firstValidIndex < data.length && 
         (data[firstValidIndex] == null || Number.isNaN(data[firstValidIndex] as number) || !Number.isFinite(data[firstValidIndex] as number))) {
    firstValidIndex++
  }
  
  if (firstValidIndex >= data.length) return result
  
  result[firstValidIndex] = data[firstValidIndex]!
  
  for (let i = firstValidIndex + 1; i < data.length; i++) {
    const value = data[i]
    const prevValue = result[i - 1]
    if (value != null && !Number.isNaN(value) && Number.isFinite(value) && prevValue != null && !Number.isNaN(prevValue) && Number.isFinite(prevValue)) {
      result[i] = (value * multiplier) + (prevValue * (1 - multiplier))
    } else {
      result[i] = prevValue ?? 0
    }
  }
  
  return result
}

function sma(data: number[], period: number): number[] {
  const result: number[] = []
  
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0
    let count = 0
    
    for (let j = 0; j < period; j++) {
      const value = data[i - j]
      if (value != null && !Number.isNaN(value) && Number.isFinite(value)) {
        sum += value
        count++
      }
    }
    
    result[i] = count > 0 ? sum / count : Number.NaN
  }
  
  return result
}

function rma(data: number[], period: number): number[] {
  const result: number[] = []
  
  if (data.length === 0) return result
  
  // First value is SMA
  let sum = 0
  let count = 0
  for (let i = 0; i < Math.min(period, data.length); i++) {
    const value = data[i]
    if (value != null && !Number.isNaN(value) && Number.isFinite(value)) {
      sum += value
      count++
    }
  }
  
  if (count > 0) {
    result[period - 1] = sum / count
  }
  
  // Rest are RMA
  for (let i = period; i < data.length; i++) {
    const value = data[i]
    const prevResult = result[i - 1]
    if (value != null && !Number.isNaN(value) && Number.isFinite(value) && prevResult != null && !Number.isNaN(prevResult) && Number.isFinite(prevResult)) {
      result[i] = (prevResult * (period - 1) + value) / period
    } else {
      result[i] = prevResult ?? 0
    }
  }
  
  return result
}

function rsi(data: number[], period: number): number[] {
  const result: number[] = []
  const gains: number[] = []
  const losses: number[] = []
  
  // Calculate gains and losses
  for (let i = 1; i < data.length; i++) {
    const current = data[i]
    const previous = data[i - 1]
    
    if (current != null && previous != null) {
      const change = current - previous
      gains.push(change > 0 ? change : 0)
      losses.push(change < 0 ? Math.abs(change) : 0)
    }
  }
  
  // Use RMA for smoothing (traditional RSI calculation)
  const avgGains = rma(gains, period)
  const avgLosses = rma(losses, period)
  
  for (let i = 0; i < avgGains.length; i++) {
    const gain = avgGains[i] || 0
    const loss = avgLosses[i] || 0
    
    if (loss === 0) {
      result[i + 1] = 100
    } else {
      const rs = gain / loss
      result[i + 1] = 100 - (100 / (1 + rs))
    }
  }
  
  return result
}

// Linear Regression for RSI Signal Line
function linearRegression(data: number[], period: number): number[] {
  const result: number[] = []
  
  for (let i = period - 1; i < data.length; i++) {
    const x = Array.from({length: period}, (_, idx) => idx)
    const y = data.slice(i - period + 1, i + 1)
    
    // Calculate means
    const xMean = x.reduce((sum, val) => sum + val, 0) / period
    const validY = y.filter(val => val != null && !Number.isNaN(val) && Number.isFinite(val))
    const yMean = validY.length > 0 ? validY.reduce((sum, val) => sum + val, 0) / validY.length : 0
    
    // Calculate slope
    let numerator = 0
    let denominator = 0
    
    for (let j = 0; j < period; j++) {
      const yValue = y[j]
      if (yValue != null && !Number.isNaN(yValue) && Number.isFinite(yValue)) {
        const xValue = x[j]
        if (xValue != null && !Number.isNaN(xValue) && Number.isFinite(xValue)) {
          numerator += (xValue - xMean) * (yValue - yMean)
          denominator += (xValue - xMean) ** 2
        }
      }
    }
    
    const slope = denominator !== 0 ? numerator / denominator : 0
    const intercept = yMean - slope * xMean
    
    // Predict current value
    result[i] = slope * (period - 1) + intercept
  }
  
  return result
}

// True Range calculation
function trueRange(data: OHLCVDataPoint[]): number[] {
  const result: number[] = []
  
  for (let i = 0; i < data.length; i++) {
    const current = data[i]
    if (!current) continue
    
    if (i === 0) {
      result[i] = current.high - current.low
    } else {
      const previous = data[i - 1]
      if (!previous) continue
      
      const hl = current.high - current.low
      const hc = Math.abs(current.high - previous.close)
      const lc = Math.abs(current.low - previous.close)
      result[i] = Math.max(hl, hc, lc)
    }
  }
  
  return result
}

// Dynamic Money Flow
function dynamicMoneyFlow(data: OHLCVDataPoint[], period: number): number[] {
  const result: number[] = []
  const tr = trueRange(data)
  
  const ctr: number[] = []
  const ctc: number[] = []
  
  for (let i = 1; i < data.length; i++) {
    const current = data[i]
    const previous = data[i - 1]
    
    if (!current || !previous) continue
    
    const priceChange = current.close - previous.close
    const alpha = tr[i] === 0 ? 0 : priceChange / (tr[i] ?? 0)
    
    const ctrValue = tr[i] === 0 ? 0 : current.volume * (1 - Math.abs(alpha)) * 
      (current.close - Math.min(current.low, previous.close) + 
       current.close - Math.max(current.high, previous.close ?? 0)) / (tr[i] ?? 0)
    
    const ctcValue = current.volume * alpha
    
    ctr.push(ctrValue)
    ctc.push(ctcValue)
  }
  
  const rmaCtrCtc = rma(ctr.map((val, i) => val + (ctc[i] ?? 0)), period)
  const rmaVolume = rma(data.slice(1).filter(d => d != null).map(d => d.volume), period)
  
  for (let i = 0; i < rmaCtrCtc.length; i++) {
    const vol = rmaVolume[i] || 1
    result[i + 1] = (rmaCtrCtc[i] || 0) / vol
  }
  
  return result
}

// Stochastic calculation
function stochastic(data: number[], high: number[], low: number[], period: number): number[] {
  const result: number[] = []
  
  for (let i = period - 1; i < data.length; i++) {
    const highestHigh = Math.max(...high.slice(i - period + 1, i + 1))
    const lowestLow = Math.min(...low.slice(i - period + 1, i + 1))
    
    const dataValue = data[i]
    if (highestHigh !== lowestLow && dataValue != null) {
      result[i] = ((dataValue - lowestLow) / (highestHigh - lowestLow)) * 100
    } else {
      result[i] = 50
    }
  }
  
  return result
}

export function useMarketCipherB(data: OHLCVDataPoint[], config?: Partial<MarketCipherBConfig>) {
  const calculations = useMemo(() => {
    const defaultConfig: MarketCipherBConfig = {
      wtChannelLength: 9,
      wtAverageLength: 12,
      wtOverbought: 50,
      wtOversold: -50,
      moneyFlowLength: 59,
      moneyFlowMultiplier: 205,
      rsiLength: 13,
      rsiSignalLength: 21,
      stochRSILength: 13,
      stochLength: 13,
      stochKSmoothing: 3,
      stochDSmoothing: 3,
    }
    
    const finalConfig = { ...defaultConfig, ...config }
    
    if (!data || data.length === 0) {
      return {
        waveTrend1: [],
        waveTrend2: [],
        fastMoneyFlow: [],
        slowMoneyFlow: [],
        rsiValues: [],
        rsiSignalLine: [],
        stochK: [],
        stochD: [],
      }
    }

    // Extract data arrays
    const times = data.map(d => d.time)
    const closes = data.map(d => d.close)
    const hlc3 = data.map(d => (d.high + d.low + d.close) / 3)

    // Wave Trend Calculation (proper implementation)
    const esa = ema(hlc3, finalConfig.wtChannelLength)
    const d = ema(hlc3.map((price, i) => Math.abs(price - (esa[i] || price))), finalConfig.wtChannelLength)
    
    const ci = hlc3.map((price, i) => {
      const esaVal = esa[i] || price
      const dVal = d[i] || 1
      return (price - esaVal) / (0.015 * dVal)
    })
    
    const tci = ema(ci, finalConfig.wtAverageLength)
    const wt1 = tci
    const wt2 = sma(wt1, 3)

    // Money Flow using Dynamic Money Flow
    const dmf = dynamicMoneyFlow(data, finalConfig.moneyFlowLength)
    const fastMoneyFlow = dmf.map(val => (val || 0) * finalConfig.moneyFlowMultiplier)
    
    // For slow money flow, use a longer period
    const slowDmf = dynamicMoneyFlow(data, Math.floor(finalConfig.moneyFlowLength * 1.5))
    const slowMoneyFlow = slowDmf.map(val => (val || 0) * finalConfig.moneyFlowMultiplier)

    // RSI with Signal Line
    const rsiVals = rsi(closes, finalConfig.rsiLength)
    const rsiSignalLine = linearRegression(rsiVals.filter(val => !Number.isNaN(val) && Number.isFinite(val)), finalConfig.rsiSignalLength)

    // RSI Stochastic
    const rsiForStoch = rsiVals.filter(val => !Number.isNaN(val) && Number.isFinite(val))
    const stochRSI = stochastic(rsiForStoch, rsiForStoch, rsiForStoch, finalConfig.stochLength)
    const stochK = sma(stochRSI, finalConfig.stochKSmoothing)
    const stochD = sma(stochK, finalConfig.stochDSmoothing)

    // Convert to chart data format
    const createSeriesData = (values: number[]) => {
      const result: Array<{ time: Time; value: number }> = []
      
      for (let i = 0; i < times.length; i++) {
        const value = values[i]
        if (value !== undefined && !Number.isNaN(value) && Number.isFinite(value)) {
          result.push({
            time: times[i] as Time,
            value: value
          })
        }
      }
      
      return result
    }

    return {
      waveTrend1: createSeriesData(wt1),
      waveTrend2: createSeriesData(wt2),
      fastMoneyFlow: createSeriesData(fastMoneyFlow),
      slowMoneyFlow: createSeriesData(slowMoneyFlow),
      rsiValues: createSeriesData(rsiVals.map(val => (val || 50) - 50)), // Center around 0
      rsiSignalLine: createSeriesData(rsiSignalLine),
      stochK: createSeriesData(stochK.map(val => (val || 50) - 50)), // Center around 0
      stochD: createSeriesData(stochD.map(val => (val || 50) - 50)), // Center around 0
    }
  }, [data, config])

  return calculations
}