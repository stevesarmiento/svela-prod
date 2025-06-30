'use client'

import type { OHLCVDataPoint, SeriesDataPoint } from './market-vision-config'
import { ema, sma, rma, wma, vwma, rsi, sum } from './technical-indicators'

export interface MoneyFlowConfig {
  show: boolean
  type: 'Pine Script RSI+MFI' | 'Chaikin Money Flow' | 'Dynamic Money Flow' | 'MFI' | 'VWMA' | 'RSI' | 'RSI.Signal Line - Set Value - RSI 13, Signal Line (Linear Regression) 21' | 'DEMA' | 'EMA' | 'HullMA' | 'SMA' | 'SMMA' | 'SSMA' | 'TEMA' | 'TMA' | 'WMA' | 'ZEMA'
  multiplier: number // Default: 150 (Pine Script)
  maLength: number   // Default: 60 (Pine Script period)
  oscLength: number  // Default: 26
  fillArea: boolean
  brightness: number
  yOffset: number    // Default: 2.5 (Pine Script rsiMFIPosY)
}

export interface MoneyFlowResult {
  values: SeriesDataPoint[]
  direction: SeriesDataPoint[] // For trend meter
  moneyFlowValue: number[] // For trend meter integration (1 = positive, 0 = negative)
}

// Pine Script MFI - Custom volume-weighted RSI
function calculateCustomMFI(priceSrc: number[], volume: number[], periodLength: number): number[] {
  const result: number[] = new Array(priceSrc.length).fill(50) // Default to neutral value
  const positiveMoneyFlow: number[] = []
  const negativeMoneyFlow: number[] = []
  
  for (let i = 1; i < priceSrc.length; i++) {
    const currentPrice = priceSrc[i]
    const prevPrice = priceSrc[i - 1]
    if (currentPrice == null || prevPrice == null) {
      positiveMoneyFlow.push(0)
      negativeMoneyFlow.push(0)
      continue
    }
    
    const priceChange = currentPrice - prevPrice
    const vol = volume[i] || 0
    
    if (priceChange <= 0) {
      positiveMoneyFlow.push(0)
      negativeMoneyFlow.push(vol * currentPrice)
    } else {
      positiveMoneyFlow.push(vol * currentPrice)
      negativeMoneyFlow.push(0)
    }
  }
  
  const posMoneyFlowSum = sum(positiveMoneyFlow, periodLength)
  const negMoneyFlowSum = sum(negativeMoneyFlow, periodLength)
  
  // Start calculations from the appropriate index
  for (let i = periodLength; i < priceSrc.length; i++) {
    const sumIndex = i - 1 // Adjust for the fact that money flow arrays start from index 1
    const pos = posMoneyFlowSum[sumIndex] || 0
    const neg = negMoneyFlowSum[sumIndex] || 0
    
    // Calculate RSI manually: 100 - (100 / (1 + (pos / neg)))
    if (neg === 0) {
      result[i] = pos > 0 ? 100 : 50
    } else if (pos === 0) {
      result[i] = 0
    } else {
      const rs = pos / neg
      result[i] = 100 - (100 / (1 + rs))
    }
  }
  
  return result
}

// Dynamic Money Flow using regular OHLC data
function calculateDynamicMoneyFlow(
  data: OHLCVDataPoint[], 
  priceSrc: number[], 
  periodLength: number
): number[] {
  const result: number[] = []
  
  for (let i = 1; i < data.length; i++) {
    const current = data[i]
    const previous = data[i - 1]
    const currentPrice = priceSrc[i]
    const prevPrice = priceSrc[i - 1]
    
    if (!current || !previous || currentPrice == null || prevPrice == null) {
      result.push(0)
      continue
    }
    
    // True Range calculation
    const hl = current.high - current.low
    const hc = Math.abs(current.high - previous.close)
    const lc = Math.abs(current.low - previous.close)
    const tr = Math.max(hl, hc, lc)
    
    // Alpha calculation
    const alpha = tr === 0 ? 0 : (currentPrice - prevPrice) / tr
    
    // CTR calculation using regular OHLC data
    const ctr = tr === 0 ? 0 : current.volume * (1 - Math.abs(alpha)) * 
      (currentPrice - Math.min(current.low, prevPrice) + 
       currentPrice - Math.max(current.high, prevPrice)) / tr
    
    // CTC calculation  
    const ctc = current.volume * alpha
    
    result.push(ctr + ctc)
  }
  
  // RMA of (CTR + CTC) / RMA of Volume
  const rmaResult = rma(result, periodLength)
  const rmaVolume = rma(data.slice(1).map(d => d.volume), periodLength)
  
  const finalResult: number[] = []
  for (let i = 0; i < rmaResult.length; i++) {
    const rmaVal = rmaResult[i]
    const volVal = rmaVolume[i]
    if (rmaVal != null && volVal != null && volVal !== 0) {
      finalResult[i] = rmaVal / volVal
    } else {
      finalResult[i] = 0
    }
  }
  
  return finalResult
}

// Linear Regression for RSI Signal Line
function calculateLinearRegression(src: number[], length: number, barIndex: number[]): number[] {
  const result: number[] = []
  
  for (let i = length - 1; i < src.length; i++) {
    const srcSlice = src.slice(i - length + 1, i + 1).filter(val => val != null)
    const indexSlice = barIndex.slice(i - length + 1, i + 1).filter(val => val != null)
    
    if (srcSlice.length !== indexSlice.length || srcSlice.length === 0) {
      result.push(0)
      continue
    }
    
    const srcMean = srcSlice.reduce((a, b) => a + b, 0) / srcSlice.length
    const indexMean = indexSlice.reduce((a, b) => a + b, 0) / indexSlice.length
    
    // Standard deviation
    const srcStd = Math.sqrt(srcSlice.reduce((sum, val) => sum + Math.pow(val - srcMean, 2), 0) / srcSlice.length)
    const indexStd = Math.sqrt(indexSlice.reduce((sum, val) => sum + Math.pow(val - indexMean, 2), 0) / indexSlice.length)
    
    // Correlation
    let correlation = 0
    if (srcStd > 0 && indexStd > 0) {
      correlation = srcSlice.reduce((sum, val, idx) => {
        const indexVal = indexSlice[idx]
        return indexVal != null ? sum + (val - srcMean) * (indexVal - indexMean) : sum
      }, 0) / (srcSlice.length * srcStd * indexStd)
    }
    
    const slope = indexStd !== 0 ? correlation * (srcStd / indexStd) : 0
    const intercept = srcMean - slope * indexMean
    const currentIndex = barIndex[i]
    const linReg = currentIndex != null ? currentIndex * slope + intercept : 0
    
    result.push(linReg)
  }
  
  return result
}

// Advanced MA implementations
function calculateSuperSmoother(src: number[], length: number): number[] {
  const result: number[] = []
  const a1 = Math.exp(-1.414 * Math.PI / length)
  const b1 = 2 * a1 * Math.cos(1.414 * Math.PI / length)
  const c2 = b1
  const c3 = -a1 * a1
  const c1 = 1 - c2 - c3
  
  for (let i = 0; i < src.length; i++) {
    if (i < 2) {
      result.push(src[i] || 0)
      continue
    }
    
    const val = c1 * ((src[i] || 0) + (src[i - 1] || 0)) / 2 + 
                c2 * (result[i - 1] || 0) + 
                c3 * (result[i - 2] || 0)
    result.push(val)
  }
  
  return result
}

function calculateSmoothedMA(src: number[], length: number): number[] {
  const result: number[] = []
  const smaValues = sma(src, length)
  
  for (let i = 0; i < src.length; i++) {
    if (i === 0 || !result[i - 1]) {
      result.push((smaValues[i] || 0) || (src[i] || 0))
    } else {
      const val = ((result[i - 1] || 0) * (length - 1) + (src[i] || 0)) / length
      result.push(val)
    }
  }
  
  return result
}

function calculateZeroLagEMA(src: number[], length: number): number[] {
  const xLag = Math.floor((length - 1) / 2)
  const xEMA: number[] = []
  
  for (let i = 0; i < src.length; i++) {
    const laggedValue = i >= xLag ? (src[i - xLag] || 0) : (src[0] || 0)
    xEMA.push((src[i] || 0) + (src[i] || 0) - laggedValue)
  }
  
  return ema(xEMA, length)
}

function calculateDoubleEMA(src: number[], length: number): number[] {
  const ema1 = ema(src, length)
  const ema2 = ema(ema1, length)
  
  return ema1.map((val, i) => 2 * val - (ema2[i] || 0))
}

function calculateTripleEMA(src: number[], length: number): number[] {
  const ema1 = ema(src, length)
  const ema2 = ema(ema1, length)
  const ema3 = ema(ema2, length)
  
  return ema1.map((val, i) => 3 * (val - (ema2[i] || 0)) + (ema3[i] || 0))
}

function calculateTriangularMA(src: number[], length: number): number[] {
  const sma1 = sma(src, length)
  return sma(sma1, length)
}

function calculateHullMA(src: number[], length: number): number[] {
  const halfLength = Math.floor(length / 2)
  const sqrtLength = Math.floor(Math.sqrt(length))
  
  const wma1 = wma(src, halfLength)
  const wma2 = wma(src, length)
  
  const diff = wma1.map((val, i) => 2 * val - (wma2[i] || 0))
  return wma(diff, sqrtLength)
}

// Main MA function matching Pine Script exactly
function calculateMA(maType: string, src: number[], length: number, barIndex?: number[]): number[] {
  if (length <= 1) return src
  
  switch (maType) {
    case 'EMA':
      return ema(src, length)
    case 'DEMA':
      return calculateDoubleEMA(src, length)
    case 'HullMA':
      return calculateHullMA(src, length)
    case 'RMA':
      return rma(src, length)
    case 'TEMA':
      return calculateTripleEMA(src, length)
    case 'TMA':
      return calculateTriangularMA(src, length)
    case 'SMA':
      return sma(src, length)
    case 'SMMA':
      return calculateSmoothedMA(src, length)
    case 'SSMA':
      return calculateSuperSmoother(src, length)
    case 'VWMA':
      // Note: VWMA needs volume data, simplified here
      return vwma(src, new Array(src.length).fill(1), length)
    case 'WMA':
      return wma(src, length)
    case 'ZEMA':
      return calculateZeroLagEMA(src, length)
    case 'RSI':
      return rsi(src, length)
    case 'RSI.Signal Line - Set Value - RSI 13, Signal Line (Linear Regression) 21':
      if (!barIndex) return src
      const rsiValues = rsi(src, 13)
      return calculateLinearRegression(rsiValues, 21, barIndex)
    default:
      return src
  }
}

export function calculateMoneyFlow(
  data: OHLCVDataPoint[],
  config: MoneyFlowConfig
): MoneyFlowResult {
  // Remove debug logging to prevent console spam
  // console.log('🔄 Money Flow calculation:', config.type, 'period:', config.oscLength)
  
  if (!data.length) {
    return {
      values: [],
      direction: [],
      moneyFlowValue: []
    }
  }

  // Use regular OHLC data instead of Heikin Ashi
  const times = data.map(d => d.time)
  const barIndex = data.map((_, i) => i)
  const volumes = data.map(d => d.volume)
  
  // Calculate CandleValue based on money flow type (using regular OHLC data)
  let candleValue: number[]
  
  if (config.type === 'Dynamic Money Flow' || config.type === 'MFI' || config.type === 'RSI') {
    // Use regular HLC3
    candleValue = data.map(d => (d.high + d.low + d.close) / 3)
  } else if (config.type === 'Chaikin Money Flow') {
    // Special Chaikin Money Flow calculation
    candleValue = data.map(d => {
      if ((d.close === d.high && d.close === d.low) || d.high === d.low) {
        return 0
      } else {
        return (2 * d.close - d.low - d.high) / (d.high - d.low) * d.volume
      }
    })
  } else {
    // Standard: (Close - Open) / (High - Low) 
    candleValue = data.map(d => {
      const denominator = d.high - d.low
      return denominator === 0 ? 0 : (d.close - d.open) / denominator
    })
  }
  
  // Calculate money flow values
  let moneyFlow: number[]
  
  switch (config.type) {
    case 'Pine Script RSI+MFI':
      // Exact Pine Script logic: sma(((close - open) / (high - low)) * multiplier, period) - yOffset
      const pineScriptValues: number[] = []
      for (let i = 0; i < data.length; i++) {
        const candle = data[i]
        if (!candle) {
          pineScriptValues.push(0)
          continue
        }
        
        const range = candle.high - candle.low
        if (range === 0) {
          pineScriptValues.push(0)
        } else {
          const bodyRatio = (candle.close - candle.open) / range
          pineScriptValues.push(bodyRatio * config.multiplier)
        }
      }
      
      // Apply SMA over the period
      const smaValues = sma(pineScriptValues, config.maLength)
      
      // Subtract Y offset (rsiMFIPosY in Pine Script)
      moneyFlow = smaValues.map(val => (val || 0) - (config.yOffset || 2.5))
      break
      
    case 'Dynamic Money Flow':
      moneyFlow = calculateDynamicMoneyFlow(data, candleValue, config.oscLength)
      break
      
    case 'Chaikin Money Flow':
      const sumCandleValues = sum(candleValue, config.oscLength)
      const sumVolumes = sum(volumes, config.oscLength)
      moneyFlow = sumCandleValues.map((val, i) => {
        const volSum = sumVolumes[i] || 1
        return (val || 0) / volSum
      })
      break
      
    case 'MFI':
      moneyFlow = calculateCustomMFI(candleValue, volumes, config.oscLength)
      moneyFlow = moneyFlow.map(val => val - 50) // Center around 0
      break
      
    case 'RSI':
      const rsiValues = rsi(candleValue, config.oscLength)
      moneyFlow = rsiValues.map(val => val - 50) // Center around 0
      break
      
    case 'RSI.Signal Line - Set Value - RSI 13, Signal Line (Linear Regression) 21':
      const linRegValues = calculateMA(config.type, candleValue, config.oscLength, barIndex)
      moneyFlow = linRegValues.map(val => val - 50) // Center around 0
      break
      
    default:
      // Standard MA calculation
      const multipliedValues = candleValue.map(val => val * (config.multiplier + 1))
      moneyFlow = calculateMA(config.type, multipliedValues, config.maLength)
      break
  }
  
  // Apply limits and multiplier for specific types
  const finalMoneyFlow = moneyFlow.map(val => {
    if (!val) return 0
    
    let finalVal = val
    
    if (config.type === 'Chaikin Money Flow' || config.type === 'Dynamic Money Flow') {
      finalVal = val * (config.multiplier + 1)
      
      // Apply limits
      if (finalVal > 100) finalVal = 100
      if (finalVal < -100) finalVal = -100
    }
    
    return finalVal
  })
  
  // Money flow direction and value for trend meter
  const moneyFlowValue = finalMoneyFlow.map(val => val > 0 ? 1 : 0)
  const direction = finalMoneyFlow.map(val => val > 0 ? 1 : 0)
  
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
  
  const resultValues = createSeriesData(finalMoneyFlow)
  
  // Remove debug logging to prevent console spam
  // console.log('✅ Money Flow result:', config.type, '→', resultValues.length, 'points')
  
  return {
    values: resultValues,
    direction: createSeriesData(direction),
    moneyFlowValue
  }
}