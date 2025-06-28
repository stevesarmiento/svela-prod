'use client'

import type { OHLCVDataPoint, SeriesDataPoint, OscillatorConfig } from './market-vision-config'
import { rsi, mfi, ultimateOscillator, williamsR, sma, linearRegression, ema } from './technical-indicators'

// Local stochastic implementation for oscillators
function stochastic(source: number[], highs: number[], lows: number[], period: number): number[] {
  const result: number[] = []
  
  for (let i = period - 1; i < source.length; i++) {
    const periodHighs = highs.slice(i - period + 1, i + 1)
    const periodLows = lows.slice(i - period + 1, i + 1)
    
    const highestHigh = Math.max(...periodHighs)
    const lowestLow = Math.min(...periodLows)
    
    const currentValue = source[i]
    if (highestHigh !== lowestLow && currentValue != null) {
      result[i] = ((currentValue - lowestLow) / (highestHigh - lowestLow)) * 100
    } else {
      result[i] = 50
    }
  }
  
  return result
}

// Double RSI implementation (actually stochastic K values from Pine Script)
// Pine: DoubleRSI_K_Fast = sma(stoch(close, high, low, 40), 2)
// Pine: DoubleRSI_K_Slow = sma(stoch(close, high, low, 81), 2)
export function doubleRSI(highs: number[], lows: number[], closes: number[]): {
  fast: number[]
  slow: number[]
  crossover: boolean[]
} {
  // Calculate stochastic with Pine Script parameters
  const fastStoch = stochastic(closes, highs, lows, 40)
  const slowStoch = stochastic(closes, highs, lows, 81)
  
  // Apply SMA smoothing
  const fastK = sma(fastStoch, 2)
  const slowK = sma(slowStoch, 2)
  
  const crossover: boolean[] = []
  for (let i = 0; i < fastK.length; i++) {
    const fast = fastK[i]
    const slow = slowK[i]
    // Pine: DoubleRSICrossOver = DoubleRSI_K_Slow < DoubleRSI_K_Fast ? 1 : 0
    crossover[i] = fast != null && slow != null && slow < fast
  }
  
  return {
    fast: fastK,
    slow: slowK,
    crossover
  }
}

export interface OscillatorResult {
  values: number[]
  signalLine?: number[]
  crossovers?: boolean[]
  overbought: number[]
  oversold: number[]
}

export function calculateOscillator1(
  data: OHLCVDataPoint[],
  type: 'RSI' | 'MFI' | 'Ultimate Oscillator' | 'Williams %R' | 'Double RSI',
  length: number,
  source: 'close' | 'open' | 'high' | 'low' | 'hlc3',
  overbought: number,
  oversold: number
): OscillatorResult {
  const sourceData = data.map(d => {
    switch (source) {
      case 'open': return d.open
      case 'high': return d.high
      case 'low': return d.low
      case 'hlc3': return (d.high + d.low + d.close) / 3
      case 'close':
      default: return d.close
    }
  })

  const highs = data.map(d => d.high)
  const lows = data.map(d => d.low)
  const closes = data.map(d => d.close)
  const volumes = data.map(d => d.volume)

  let values: number[] = []
  let signalLine: number[] | undefined
  let crossovers: boolean[] | undefined

  switch (type) {
    case 'RSI':
      values = rsi(sourceData, length)
      signalLine = linearRegression(values.filter(v => !isNaN(v) && isFinite(v)), 21)
      break
      
    case 'MFI':
      values = mfi(sourceData, volumes, length)
      break
      
    case 'Ultimate Oscillator':
      values = ultimateOscillator(highs, lows, closes, 7, 14, 28)
      break
      
    case 'Williams %R':
      const williamsValues = williamsR(highs, lows, closes, length)
      values = williamsValues.map(v => v + 100) // Shift up by 100
      break
      
    case 'Double RSI':
      const doubleRsiResult = doubleRSI(highs, lows, closes)
      values = doubleRsiResult.fast
      signalLine = doubleRsiResult.slow
      crossovers = doubleRsiResult.crossover
      break
  }

  // Calculate overbought/oversold levels
  const obLevels: number[] = []
  const osLevels: number[] = []
  
  for (let i = 0; i < values.length; i++) {
    const value = values[i]
    if (value != null && !isNaN(value) && isFinite(value)) {
      if (type === 'Ultimate Oscillator') {
        obLevels[i] = value > overbought - 1 ? 1 : 0
        osLevels[i] = value < oversold + 1 ? 1 : 0
      } else {
        obLevels[i] = value > overbought ? 1 : 0
        osLevels[i] = value < oversold ? 1 : 0
      }
    } else {
      obLevels[i] = 0
      osLevels[i] = 0
    }
  }

  return {
    values,
    signalLine,
    crossovers,
    overbought: obLevels,
    oversold: osLevels
  }
}

// Main function that handles both oscillators
export function calculateOscillators(
  data: OHLCVDataPoint[],
  config: {
    oscillator1: OscillatorConfig
    oscillator2: OscillatorConfig
  }
): {
  oscillator1: SeriesDataPoint[]
  oscillator2: SeriesDataPoint[]
} {
  const times = data.map(d => d.time)
  
  // Calculate Oscillator 1
  let oscillator1: SeriesDataPoint[] = []
  if (config.oscillator1.show) {
    const osc1Result = calculateOscillator1(
      data,
      config.oscillator1.type,
      config.oscillator1.length,
      config.oscillator1.source,
      config.oscillator1.overbought,
      config.oscillator1.oversold
    )
    
    oscillator1 = osc1Result.values
      .map((value, i) => {
        const time = times[i]
        if (value != null && time != null && !isNaN(value) && isFinite(value)) {
          // Normalize to center around 0 for display (-50 to +50 range)
          const normalizedValue = value - 50
          return { time, value: normalizedValue }
        }
        return null
      })
      .filter((item): item is SeriesDataPoint => item !== null)
  }

  // Calculate Oscillator 2
  let oscillator2: SeriesDataPoint[] = []
  if (config.oscillator2.show) {
    const osc2Result = calculateOscillator1(
      data,
      config.oscillator2.type,
      config.oscillator2.length,
      config.oscillator2.source,
      config.oscillator2.overbought,
      config.oscillator2.oversold
    )
    
    oscillator2 = osc2Result.values
      .map((value, i) => {
        const time = times[i]
        if (value != null && time != null && !isNaN(value) && isFinite(value)) {
          // Normalize to center around 0 for display (-50 to +50 range)
          const normalizedValue = value - 50
          return { time, value: normalizedValue }
        }
        return null
      })
      .filter((item): item is SeriesDataPoint => item !== null)
  }

  return {
    oscillator1,
    oscillator2
  }
}

// Convert to series data for charting
export function oscillatorToSeriesData(
  data: OHLCVDataPoint[],
  oscillatorResult: OscillatorResult
): {
  main: SeriesDataPoint[]
  signal?: SeriesDataPoint[]
  overbought: SeriesDataPoint[]
  oversold: SeriesDataPoint[]
} {
  const times = data.map(d => d.time)
  
  const main: SeriesDataPoint[] = []
  const signal: SeriesDataPoint[] = []
  const overbought: SeriesDataPoint[] = []
  const oversold: SeriesDataPoint[] = []

  for (let i = 0; i < times.length; i++) {
    const time = times[i]
    if (!time) continue
    
    const value = oscillatorResult.values[i]
    if (value != null && !isNaN(value) && isFinite(value)) {
      main.push({ time, value })
    }

    if (oscillatorResult.signalLine) {
      const signalValue = oscillatorResult.signalLine[i]
      if (signalValue != null && !isNaN(signalValue) && isFinite(signalValue)) {
        signal.push({ time, value: signalValue })
      }
    }

    const obValue = oscillatorResult.overbought[i]
    if (obValue != null && obValue > 0) {
      overbought.push({ time, value: obValue })
    }

    const osValue = oscillatorResult.oversold[i]
    if (osValue != null && osValue > 0) {
      oversold.push({ time, value: osValue })
    }
  }

  return {
    main,
    signal: signal.length > 0 ? signal : undefined,
    overbought,
    oversold
  }
}

// Fast MACD for trend meters
export function fastMACD(data: number[], fastLength: number = 8, slowLength: number = 21, signalLength: number = 5): {
  macdLine: number[]
  signalLine: number[]
  histogram: number[]
  crossover: boolean[]
} {
  const fastEma = ema(data, fastLength)
  const slowEma = ema(data, slowLength)
  
  const macdLine: number[] = []
  for (let i = 0; i < data.length; i++) {
    const fast = fastEma[i]
    const slow = slowEma[i]
    if (fast != null && slow != null) {
      macdLine[i] = fast - slow
    }
  }
  
  const signalLine = ema(macdLine, signalLength)
  
  const histogram: number[] = []
  const crossover: boolean[] = []
  
  for (let i = 0; i < macdLine.length; i++) {
    const macd = macdLine[i]
    const signal = signalLine[i]
    
    if (macd != null && signal != null) {
      const histValue = macd - signal
      histogram[i] = histValue
      crossover[i] = histValue > 0
    } else {
      histogram[i] = 0
      crossover[i] = false
    }
  }
  
  return {
    macdLine,
    signalLine,
    histogram,
    crossover
  }
}