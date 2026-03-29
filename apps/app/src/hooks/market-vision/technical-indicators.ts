'use client'

// Basic Moving Averages
export function sma(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length)
  
  // Fill early values with 0 or first available value
  for (let i = 0; i < period - 1; i++) {
    result[i] = 0
  }
  
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
    
    result[i] = count > 0 ? sum / count : 0
  }
  
  return result
}

export function ema(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length)
  const multiplier = 2 / (period + 1)
  
  if (data.length === 0) return result
  
  let firstValidIndex = 0
  while (firstValidIndex < data.length && 
         (data[firstValidIndex] == null || Number.isNaN(data[firstValidIndex] as number) || !Number.isFinite(data[firstValidIndex] as number))) {
    firstValidIndex++
  }
  
  if (firstValidIndex >= data.length) return result.fill(0)
  
  // Fill in values before the first valid index
  for (let i = 0; i < firstValidIndex; i++) {
    result[i] = 0
  }
  
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

export function rma(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length)
  
  if (data.length === 0) return result.fill(0)
  
  // Fill early values with 0
  for (let i = 0; i < period - 1; i++) {
    result[i] = 0
  }
  
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
  } else {
    result[period - 1] = 0
  }
  
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

export function wma(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length)
  
  // Fill early values with 0
  for (let i = 0; i < period - 1; i++) {
    result[i] = 0
  }
  
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0
    let weightSum = 0
    
    for (let j = 0; j < period; j++) {
      const value = data[i - j]
      if (value != null && !Number.isNaN(value) && Number.isFinite(value)) {
        const weight = period - j
        sum += value * weight
        weightSum += weight
      }
    }
    
    result[i] = weightSum > 0 ? sum / weightSum : 0
  }
  
  return result
}

// Advanced Moving Averages
export function doubleEma(data: number[], period: number): number[] {
  const firstEma = ema(data, period)
  const secondEma = ema(firstEma, period)
  
  const result: number[] = new Array(data.length)
  for (let i = 0; i < data.length; i++) {
    const first = firstEma[i]
    const second = secondEma[i]
    if (first != null && second != null) {
      result[i] = 2 * first - second
    } else {
      result[i] = 0
    }
  }
  
  return result
}

export function tripleEma(data: number[], period: number): number[] {
  const firstEma = ema(data, period)
  const secondEma = ema(firstEma, period)
  const thirdEma = ema(secondEma, period)
  
  const result: number[] = new Array(data.length)
  for (let i = 0; i < data.length; i++) {
    const first = firstEma[i]
    const second = secondEma[i]
    const third = thirdEma[i]
    if (first != null && second != null && third != null) {
      result[i] = 3 * (first - second) + third
    } else {
      result[i] = 0
    }
  }
  
  return result
}

export function hullMA(data: number[], period: number): number[] {
  const halfLength = Math.floor(period / 2)
  const sqrtLength = Math.round(Math.sqrt(period))
  
  const wma1 = wma(data, halfLength)
  const wma2 = wma(data, period)
  
  const diff: number[] = new Array(data.length)
  for (let i = 0; i < data.length; i++) {
    const val1 = wma1[i]
    const val2 = wma2[i]
    if (val1 != null && val2 != null) {
      diff[i] = 2 * val1 - val2
    } else {
      diff[i] = 0
    }
  }
  
  return wma(diff, sqrtLength)
}

export function vwma(prices: number[], volumes: number[], period: number): number[] {
  const result: number[] = new Array(prices.length)
  
  // Fill early values with 0
  for (let i = 0; i < period - 1; i++) {
    result[i] = 0
  }
  
  for (let i = period - 1; i < prices.length; i++) {
    let priceVolumeSum = 0
    let volumeSum = 0
    
    for (let j = 0; j < period; j++) {
      const price = prices[i - j]
      const volume = volumes[i - j]
      if (price != null && volume != null && !Number.isNaN(price) && !Number.isNaN(volume) && Number.isFinite(price) && Number.isFinite(volume)) {
        priceVolumeSum += price * volume
        volumeSum += volume
      }
    }
    
    result[i] = volumeSum > 0 ? priceVolumeSum / volumeSum : 0
  }
  
  return result
}

// SuperSmoother filter (Ehlers)
export function superSmoother(data: number[], period: number): number[] {
  const result: number[] = []
  const a1 = Math.exp(-Math.SQRT2 * Math.PI / period)
  const b1 = 2 * a1 * Math.cos(Math.SQRT2 * Math.PI / period)
  const c2 = b1
  const c3 = -a1 * a1
  const c1 = 1 - c2 - c3
  
  for (let i = 0; i < data.length; i++) {
    const current = data[i]
    const prev = data[i - 1]
    const result1 = result[i - 1]
    const result2 = result[i - 2]
    
    if (i < 2) {
      result[i] = current ?? 0
    } else if (current != null && prev != null && result1 != null && result2 != null) {
      result[i] = c1 * (current + prev) / 2 + c2 * result1 + c3 * result2
    } else {
      result[i] = result1 ?? 0
    }
  }
  
  return result
}

// Zero Lag EMA
export function zeroLagEma(data: number[], period: number): number[] {
  const lag = (period - 1) / 2
  const adjustedData: number[] = []
  
  for (let i = 0; i < data.length; i++) {
    const current = data[i]
    const lagged = data[i - Math.floor(lag)]
    if (current != null && lagged != null) {
      adjustedData[i] = current + current - lagged
    } else {
      adjustedData[i] = current ?? 0
    }
  }
  
  return ema(adjustedData, period)
}

// RSI Calculation
export function rsi(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(0) // Initialize with proper length
  const gains: number[] = []
  const losses: number[] = []
  
  // Calculate price changes
  for (let i = 1; i < data.length; i++) {
    const current = data[i]
    const previous = data[i - 1]
    
    if (current != null && previous != null) {
      const change = current - previous
      gains.push(change > 0 ? change : 0)
      losses.push(change < 0 ? Math.abs(change) : 0)
    } else {
      gains.push(0)
      losses.push(0)
    }
  }
  
  const avgGains = rma(gains, period)
  const avgLosses = rma(losses, period)
  
  // Map the RMA results back to the correct indices
  for (let i = 0; i < avgGains.length; i++) {
    const gain = avgGains[i] || 0
    const loss = avgLosses[i] || 0
    
    if (loss === 0) {
      result[i + 1] = 100 // +1 because gains/losses start from index 1
    } else {
      const rs = gain / loss
      result[i + 1] = 100 - (100 / (1 + rs))
    }
  }
  
  return result
}

// Money Flow Index
export function mfi(prices: number[], volumes: number[], period: number): number[] {
  const result: number[] = []
  const positiveFlow: number[] = []
  const negativeFlow: number[] = []
  
  for (let i = 1; i < prices.length; i++) {
    const current = prices[i]
    const previous = prices[i - 1]
    const volume = volumes[i]
    
    if (current != null && previous != null && volume != null) {
      const typicalPrice = current // Simplified, could be (h+l+c)/3
      if (current > previous) {
        positiveFlow.push(typicalPrice * volume)
        negativeFlow.push(0)
      } else if (current < previous) {
        positiveFlow.push(0)
        negativeFlow.push(typicalPrice * volume)
      } else {
        positiveFlow.push(0)
        negativeFlow.push(0)
      }
    }
  }
  
  for (let i = period - 1; i < positiveFlow.length; i++) {
    let posSum = 0
    let negSum = 0
    
    for (let j = 0; j < period; j++) {
      posSum += positiveFlow[i - j] || 0
      negSum += negativeFlow[i - j] || 0
    }
    
    if (negSum === 0) {
      result[i + 1] = 100
    } else {
      const mfr = posSum / negSum
      result[i + 1] = 100 - (100 / (1 + mfr))
    }
  }
  
  return result
}

// Ultimate Oscillator
export function ultimateOscillator(highs: number[], lows: number[], closes: number[], 
                                  period1 = 7, period2 = 14, period3 = 28): number[] {
  const result: number[] = []
  
  const buyingPressure: number[] = []
  const trueRange: number[] = []
  
  for (let i = 1; i < closes.length; i++) {
    const high = highs[i]
    const low = lows[i]
    const close = closes[i]
    const prevClose = closes[i - 1]
    
    if (high != null && low != null && close != null && prevClose != null) {
      const bp = close - Math.min(low, prevClose)
      const tr = Math.max(high, prevClose) - Math.min(low, prevClose)
      
      buyingPressure.push(bp)
      trueRange.push(tr)
    }
  }
  
  const avg1 = period1
  const avg2 = period2
  const avg3 = period3
  
  for (let i = Math.max(avg1, avg2, avg3) - 1; i < buyingPressure.length; i++) {
    let bp1 = 0
    let tr1 = 0
    let bp2 = 0
    let tr2 = 0
    let bp3 = 0
    let tr3 = 0
    
    for (let j = 0; j < avg1; j++) {
      bp1 += buyingPressure[i - j] || 0
      tr1 += trueRange[i - j] || 0
    }
    
    for (let j = 0; j < avg2; j++) {
      bp2 += buyingPressure[i - j] || 0
      tr2 += trueRange[i - j] || 0
    }
    
    for (let j = 0; j < avg3; j++) {
      bp3 += buyingPressure[i - j] || 0
      tr3 += trueRange[i - j] || 0
    }
    
    const avg7 = tr1 > 0 ? bp1 / tr1 : 0
    const avg14 = tr2 > 0 ? bp2 / tr2 : 0
    const avg28 = tr3 > 0 ? bp3 / tr3 : 0
    
    result[i + 1] = 100 * (4 * avg7 + 2 * avg14 + avg28) / 7
  }
  
  return result
}

// Williams %R
export function williamsR(highs: number[], lows: number[], closes: number[], period: number): number[] {
  const result: number[] = []
  
  for (let i = period - 1; i < closes.length; i++) {
    let highest = Number.NEGATIVE_INFINITY
    let lowest = Number.POSITIVE_INFINITY
    
    for (let j = 0; j < period; j++) {
      const high = highs[i - j]
      const low = lows[i - j]
      if (high != null && low != null) {
        highest = Math.max(highest, high)
        lowest = Math.min(lowest, low)
      }
    }
    
    const close = closes[i]
    if (close != null && highest !== Number.NEGATIVE_INFINITY && lowest !== Number.POSITIVE_INFINITY && highest !== lowest) {
      result[i] = ((close - highest) / (highest - lowest)) * 100
    } else {
      result[i] = -50 // Middle value
    }
  }
  
  return result
}

// Linear Regression
export function linearRegression(data: number[], period: number): number[] {
  const result: number[] = []
  
  for (let i = period - 1; i < data.length; i++) {
    const x = Array.from({length: period}, (_, idx) => idx)
    const y = data.slice(i - period + 1, i + 1)
    
    const xMean = x.reduce((sum, val) => sum + val, 0) / period
    const validY = y.filter(val => val != null && !Number.isNaN(val) && Number.isFinite(val))
    const yMean = validY.length > 0 ? validY.reduce((sum, val) => sum + val, 0) / validY.length : 0
    
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
    
    result[i] = slope * (period - 1) + intercept
  }
  
  return result
}

// Standard Deviation
export function stdev(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(0) // Initialize with proper length
  
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1).filter(val => val != null && !Number.isNaN(val) && Number.isFinite(val))
    
    if (slice.length === 0) {
      result[i] = 0
      continue
    }
    
    const mean = slice.reduce((sum, val) => sum + val, 0) / slice.length
    const variance = slice.reduce((sum, val) => sum + (val - mean) ** 2, 0) / slice.length
    result[i] = Math.sqrt(variance)
  }
  
  return result
}

// Correlation
export function correlation(x: number[], y: number[], period: number): number[] {
  const result: number[] = []
  
  for (let i = period - 1; i < Math.min(x.length, y.length); i++) {
    const xSlice = x.slice(i - period + 1, i + 1)
    const ySlice = y.slice(i - period + 1, i + 1)
    
    const validPairs = xSlice.map((xVal, idx) => [xVal, ySlice[idx]])
      .filter(([xVal, yVal]) => xVal != null && yVal != null && !Number.isNaN(xVal) && !Number.isNaN(yVal) && Number.isFinite(xVal) && Number.isFinite(yVal))
    
    if (validPairs.length < 2) {
      result[i] = 0
      continue
    }
    
    const xMean = validPairs.reduce((sum, [xVal]) => sum + (xVal || 0), 0) / validPairs.length
    const yMean = validPairs.reduce((sum, [, yVal]) => sum + (yVal || 0), 0) / validPairs.length
    
    let numerator = 0
    let xSumSq = 0
    let ySumSq = 0
    
    for (const [xVal, yVal] of validPairs) {
      const xDiff = (xVal || 0) - xMean
      const yDiff = (yVal || 0) - yMean
      numerator += xDiff * yDiff
      xSumSq += xDiff * xDiff
      ySumSq += yDiff * yDiff
    }
    
    const denominator = Math.sqrt(xSumSq * ySumSq)
    result[i] = denominator > 0 ? numerator / denominator : 0
  }
  
  return result
}

// Generic MA function
export function ma(type: string, data: number[], period: number, volumes?: number[]): number[] {
  switch (type) {
    case 'EMA': return ema(data, period)
    case 'DEMA': return doubleEma(data, period)
    case 'TEMA': return tripleEma(data, period)
    case 'SMA': return sma(data, period)
    case 'RMA': return rma(data, period)
    case 'WMA': return wma(data, period)
    case 'HullMA': return hullMA(data, period)
    case 'VWMA': return volumes ? vwma(data, volumes, period) : sma(data, period)
    case 'SSMA': return superSmoother(data, period)
    case 'ZEMA': return zeroLagEma(data, period)
    default: return sma(data, period)
  }
}

// Utility functions
export function highest(data: number[], period: number): number[] {
  if (!data || data.length === 0) return []
  const result: number[] = new Array(data.length)
  
  // Fill early values with 0
  for (let i = 0; i < period - 1; i++) {
    result[i] = 0
  }
  
  for (let i = period - 1; i < data.length; i++) {
    let max = Number.NEGATIVE_INFINITY
    for (let j = 0; j < period; j++) {
      const value = data[i - j]
      if (value != null && !Number.isNaN(value) && Number.isFinite(value)) {
        max = Math.max(max, value)
      }
    }
    result[i] = max === Number.NEGATIVE_INFINITY ? 0 : max
  }
  
  return result
}

export function lowest(data: number[], period: number): number[] {
  if (!data || data.length === 0) return []
  const result: number[] = new Array(data.length)
  
  // Fill early values with 0
  for (let i = 0; i < period - 1; i++) {
    result[i] = 0
  }
  
  for (let i = period - 1; i < data.length; i++) {
    let min = Number.POSITIVE_INFINITY
    for (let j = 0; j < period; j++) {
      const value = data[i - j]
      if (value != null && !Number.isNaN(value) && Number.isFinite(value)) {
        min = Math.min(min, value)
      }
    }
    result[i] = min === Number.POSITIVE_INFINITY ? 0 : min
  }
  
  return result
}

export function sum(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length)
  
  // Fill early values with 0
  for (let i = 0; i < period - 1; i++) {
    result[i] = 0
  }
  
  for (let i = period - 1; i < data.length; i++) {
    let total = 0
    for (let j = 0; j < period; j++) {
      const value = data[i - j]
      if (value != null && !Number.isNaN(value) && Number.isFinite(value)) {
        total += value
      }
    }
    result[i] = total
  }
  
  return result
}

// Crossover/Crossunder detection
export function crossover(series1: number[], series2: number[]): boolean[] {
  const result: boolean[] = []
  
  for (let i = 1; i < Math.min(series1.length, series2.length); i++) {
    const curr1 = series1[i]
    const prev1 = series1[i - 1]
    const curr2 = series2[i]
    const prev2 = series2[i - 1]
    
    result[i] = curr1 != null && prev1 != null && curr2 != null && prev2 != null &&
                prev1 <= prev2 && curr1 > curr2
  }
  
  return result
}

export function crossunder(series1: number[], series2: number[]): boolean[] {
  const result: boolean[] = []
  
  for (let i = 1; i < Math.min(series1.length, series2.length); i++) {
    const curr1 = series1[i]
    const prev1 = series1[i - 1]
    const curr2 = series2[i]
    const prev2 = series2[i - 1]
    
    result[i] = curr1 != null && prev1 != null && curr2 != null && prev2 != null &&
                prev1 >= prev2 && curr1 < curr2
  }
  
  return result
}