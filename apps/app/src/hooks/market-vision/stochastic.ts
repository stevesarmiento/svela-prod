'use client'

import type { OHLCVDataPoint, SeriesDataPoint } from './market-vision-config'

// RSI Divergence Detection
const ANGLE_LIMIT = 45.0 // Limit for angle of divergence lines

interface DivergencePoint {
  startTime: number
  endTime: number
  rsiStart: number
  rsiEnd: number
  priceStart: number
  priceEnd: number
  type: 'bullish' | 'bearish' | 'h_bullish' | 'h_bearish'
}

// Helper function to calculate percentage increase
function calcPercentageIncrease(original: number, newValue: number): number {
  if (original === 0) return 0
  return ((newValue - original) / original) * 100
}

// Linear regression implementation
function linearRegression(x: number[], y: number[]): {
  slope: number
  intercept: number
  rSquared: number
} {
  if (x.length !== y.length || x.length === 0) {
    return { slope: 0, intercept: 0, rSquared: 0 }
  }

  const n = x.length
  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((sum, xi, i) => {
    const yi = y[i]
    return yi !== undefined ? sum + xi * yi : sum
  }, 0)
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0)

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  // Calculate R-squared
  const meanY = sumY / n
  const ssRes = y.reduce((sum, yi, i) => {
    const xi = x[i]
    if (xi === undefined) return sum
    const predicted = slope * xi + intercept
    return sum + (yi - predicted) ** 2
  }, 0)
  const ssTot = y.reduce((sum, yi) => sum + (yi - meanY) ** 2, 0)
  const rSquared = ssTot === 0 ? 0 : 1 - (ssRes / ssTot)

  return { slope, intercept, rSquared }
}

// Calculate angle between two points
function getAngle(
  startValue: number,
  startTime: number,
  endValue: number,
  endTime: number
): number {
  const deltaValue = endValue - startValue
  const deltaTime = endTime - startTime
  
  if (deltaTime === 0) return 0
  
  const slope = deltaValue / deltaTime
  const angleRadians = Math.atan(slope)
  const angleDegrees = Math.abs(angleRadians * (180 / Math.PI))
  
  return angleDegrees
}

// Check if any value crosses above the line between two points
function doesAnyValueCrossUp(
  data: OHLCVDataPoint[],
  startValue: number,
  startTime: number,
  endValue: number,
  endTime: number,
  diff = 1.05,
  valueColumn: 'close' | 'rsi' = 'close',
  rsiValues?: number[]
): boolean {
  const periodData = data.filter(d => d.time >= startTime && d.time <= endTime)
  
  if (periodData.length < 2) return false
  
  const slope = (endValue - startValue) / (endTime - startTime)
  const intercept = startValue - slope * startTime
  
  for (const candle of periodData) {
    const expectedValue = slope * candle.time + intercept
    const candleIndex = data.indexOf(candle)
    const actualValue = valueColumn === 'close' ? candle.close : 
      (rsiValues && candleIndex >= 0 ? rsiValues[candleIndex] : candle.close)
    
    if (actualValue !== undefined && actualValue > expectedValue * diff) {
      return true
    }
  }
  
  return false
}

// Check if any value crosses below the line between two points
function doesAnyValueCrossDown(
  data: OHLCVDataPoint[],
  startValue: number,
  startTime: number,
  endValue: number,
  endTime: number,
  diff = 1.05,
  valueColumn: 'close' | 'rsi' = 'close',
  rsiValues?: number[]
): boolean {
  const periodData = data.filter(d => d.time >= startTime && d.time <= endTime)
  
  if (periodData.length < 2) return false
  
  const slope = (endValue - startValue) / (endTime - startTime)
  const intercept = startValue - slope * startTime
  
  for (const candle of periodData) {
    const expectedValue = slope * candle.time + intercept
    const candleIndex = data.indexOf(candle)
    const actualValue = valueColumn === 'close' ? candle.close : 
      (rsiValues && candleIndex >= 0 ? rsiValues[candleIndex] : candle.close)
    
    if (actualValue !== undefined && actualValue < expectedValue / diff) {
      return true
    }
  }
  
  return false
}

// Main RSI Divergence Detection Function
function getRSIDivergences(
  data: OHLCVDataPoint[],
  rsiValues: number[],
  currentCandleIndex = -1
): DivergencePoint[] {
  const divergences: DivergencePoint[] = []
  
  if (data.length === 0 || rsiValues.length === 0) return divergences
  
  // Convert negative index to positive
  const curIdx = currentCandleIndex < 0 ? data.length + currentCandleIndex : currentCandleIndex
  if (curIdx < 0 || curIdx >= data.length) return divergences
  
  const currentCandle = data[curIdx]
  const currentRSI = rsiValues[curIdx]
  const prevRSI = curIdx > 0 ? rsiValues[curIdx - 1] : currentRSI
  
  if (!currentCandle || currentRSI === undefined || prevRSI === undefined) return divergences
  
  const currentRSIChange = calcPercentageIncrease(prevRSI, currentRSI)
  const currentPrice = currentCandle.close
  const currentTime = currentCandle.time
  
  // Skip the most recent 21 candles and get 55 candles before that
  // Calculate dynamic time interval based on actual data spacing
  const dataInterval = data.length > 1 && data[0] && data[1] 
    ? data[1].time - data[0].time 
    : 24 * 60 * 60 * 1000 // Default to 1 day
  const timeThreshold = currentTime - (21 * dataInterval)
  const candidateCandles = data.filter(candle => candle.time < timeThreshold).slice(-55)
  
  console.log(`📊 Divergence Debug for candle ${curIdx}:`)
  console.log(`Current RSI: ${currentRSI}, RSI Change: ${currentRSIChange}%`)
  console.log(`Data interval: ${dataInterval}ms (${dataInterval / (60 * 1000)} minutes)`)
  console.log(`Time threshold: ${timeThreshold}, Current: ${currentTime}`)
  console.log(`Candidate candles: ${candidateCandles.length}/55`)
  
  if (candidateCandles.length === 0) {
    console.log('❌ No candidate candles found')
    return divergences
  }
  
  // Check all divergence conditions with detailed logging
  console.log("🔍 Checking divergence conditions:")
  console.log(`  Bullish: RSI ≤ 37 (${currentRSI} ≤ 37) AND RSI change < 0 (${currentRSIChange} < 0) = ${currentRSI <= 37 && currentRSIChange < 0}`)
  console.log(`  Bearish: RSI ≥ 63 (${currentRSI} ≥ 63) AND RSI change > 0 (${currentRSIChange} > 0) = ${currentRSI >= 63 && currentRSIChange > 0}`)
  console.log(`  H.Bearish: 50 < RSI ≤ 70 (${currentRSI}) AND RSI change > 0 (${currentRSIChange}) = ${currentRSI > 50 && currentRSI <= 70 && currentRSIChange > 0}`)
  console.log(`  H.Bullish: 30 < RSI ≤ 50 (${currentRSI}) AND RSI change < 0 (${currentRSIChange}) = ${currentRSI > 30 && currentRSI <= 50 && currentRSIChange < 0}`)
  
  // BULLISH DIVERGENCE - RSI ≤ 37 and RSI change < 0
  if (currentRSI <= 37 && currentRSIChange < 0) {
    console.log('🟢 Checking BULLISH divergences...')
    const bullishDivs: Array<{ candle: OHLCVDataPoint; rsi: number; index: number }> = []
    
    for (let i = 0; i < candidateCandles.length; i++) {
      const pastCandle = candidateCandles[i]
      if (!pastCandle) continue
      
      const pastIndex = data.indexOf(pastCandle)
      const pastRSI = rsiValues[pastIndex]
      
      if (pastRSI === undefined || pastRSI > 32) continue
      
      const baseValueChange = calcPercentageIncrease(pastCandle.close, currentPrice)
      const rsiChange = calcPercentageIncrease(pastRSI, currentRSI)
      
      // Get data between past and current for linear regression
      const periodData = data.filter(d => d.time >= pastCandle.time && d.time <= currentTime)
      const periodPrices = periodData.map(d => d.close)
      const periodTimes = periodData.map(d => d.time / 1000) // Convert to seconds
      
      const { slope, rSquared } = linearRegression(periodTimes, periodPrices)
      
      // Check bullish divergence conditions
      if (
        rsiChange >= 6 &&
        baseValueChange <= 0 &&
        slope < 0 &&
        rSquared > 0.3 &&
        !doesAnyValueCrossDown(data, pastRSI, pastCandle.time, currentRSI, currentTime, 1.05, 'rsi', rsiValues) &&
        !doesAnyValueCrossDown(data, pastCandle.close, pastCandle.time, currentPrice, currentTime, 1.03, 'close') &&
        getAngle(pastRSI, pastCandle.time, currentRSI, currentTime) <= ANGLE_LIMIT
      ) {
        bullishDivs.push({ candle: pastCandle, rsi: pastRSI, index: pastIndex })
      }
    }
    
    // Add all bullish divergences
    for (const div of bullishDivs) {
      divergences.push({
        startTime: div.candle.time,
        endTime: currentTime,
        rsiStart: div.rsi,
        rsiEnd: currentRSI,
        priceStart: div.candle.close,
        priceEnd: currentPrice,
        type: 'bullish'
      })
    }
  }
  
  // BEARISH DIVERGENCE - RSI ≥ 63 and RSI change > 0
  else if (currentRSI >= 63 && currentRSIChange > 0) {
    console.log('🔴 Checking BEARISH divergences...')
    const bearishDivs: Array<{ candle: OHLCVDataPoint; rsi: number; index: number }> = []
    
    for (let i = 0; i < candidateCandles.length; i++) {
      const pastCandle = candidateCandles[i]
      if (!pastCandle) continue
      
      const pastIndex = data.indexOf(pastCandle)
      const pastRSI = rsiValues[pastIndex]
      
      if (pastRSI === undefined || pastRSI < 68) continue
      
      const baseValueChange = calcPercentageIncrease(pastCandle.close, currentPrice)
      const rsiChange = calcPercentageIncrease(pastRSI, currentRSI)
      
      // Get data between past and current for linear regression
      const periodData = data.filter(d => d.time >= pastCandle.time && d.time <= currentTime)
      const periodPrices = periodData.map(d => d.close)
      const periodTimes = periodData.map(d => d.time / 1000) // Convert to seconds
      
      const { slope, rSquared } = linearRegression(periodTimes, periodPrices)
      
      // Check bearish divergence conditions
      if (
        rsiChange <= -6 &&
        baseValueChange >= 0 &&
        slope > 0 &&
        rSquared > 0.3 &&
        !doesAnyValueCrossUp(data, pastRSI, pastCandle.time, currentRSI, currentTime, 1.05, 'rsi', rsiValues) &&
        !doesAnyValueCrossUp(data, pastCandle.close, pastCandle.time, currentPrice, currentTime, 1.03, 'close') &&
        getAngle(pastRSI, pastCandle.time, currentRSI, currentTime) <= ANGLE_LIMIT
      ) {
        bearishDivs.push({ candle: pastCandle, rsi: pastRSI, index: pastIndex })
      }
    }
    
    // Add all bearish divergences
    for (const div of bearishDivs) {
      divergences.push({
        startTime: div.candle.time,
        endTime: currentTime,
        rsiStart: div.rsi,
        rsiEnd: currentRSI,
        priceStart: div.candle.close,
        priceEnd: currentPrice,
        type: 'bearish'
      })
    }
  }
  
  // HIDDEN BEARISH DIVERGENCE - 50 < RSI ≤ 70 and RSI change > 0
  if (currentRSI > 50 && currentRSI <= 70 && currentRSIChange > 0) {
    console.log('🟠 Checking HIDDEN BEARISH divergences...')
    const hBearishDivs: Array<{ candle: OHLCVDataPoint; rsi: number; index: number }> = []
    
    for (let i = 1; i < candidateCandles.length - 1; i++) {
      const pastCandle = candidateCandles[i]
      const prevCandle = candidateCandles[i - 1]
      const nextCandle = candidateCandles[i + 1]
      
      if (!pastCandle || !prevCandle || !nextCandle) continue
      
      const pastIndex = data.indexOf(pastCandle)
      const pastRSI = rsiValues[pastIndex]
      const prevRSI = rsiValues[data.indexOf(prevCandle)]
      const nextRSI = rsiValues[data.indexOf(nextCandle)]
      
      if (pastRSI === undefined || prevRSI === undefined || nextRSI === undefined) continue
      
      // Check if pastRSI is a local maximum
      if (prevRSI < pastRSI && pastRSI > nextRSI && pastRSI >= 50 && pastRSI < 65) {
        const baseValueChange = calcPercentageIncrease(pastCandle.close, currentPrice)
        const rsiChange = calcPercentageIncrease(pastRSI, currentRSI)
        
        // Get data between past and current for linear regression
        const periodData = data.filter(d => d.time >= pastCandle.time && d.time <= currentTime)
        const periodPrices = periodData.map(d => d.close)
        const periodRSIs = periodData.map(d => {
          const idx = data.indexOf(d)
          return rsiValues[idx]
        }).filter(val => val !== undefined)
        const periodTimes = periodData.map(d => d.time / 1000)
        
        const priceRegression = linearRegression(periodTimes, periodPrices)
        const rsiRegression = linearRegression(periodTimes, periodRSIs)
        
        // Check hidden bearish divergence conditions
        if (
          rsiChange >= 6 &&
          baseValueChange < 0 &&
          priceRegression.slope < 0 &&
          rsiRegression.slope > 0 &&
          priceRegression.rSquared > 0.3 &&
          !doesAnyValueCrossUp(data, pastRSI, pastCandle.time, currentRSI, currentTime, 1.05, 'rsi', rsiValues) &&
          !doesAnyValueCrossUp(data, pastCandle.close, pastCandle.time, currentPrice, currentTime, 1.03, 'close') &&
          getAngle(pastRSI, pastCandle.time, currentRSI, currentTime) <= ANGLE_LIMIT
        ) {
          hBearishDivs.push({ candle: pastCandle, rsi: pastRSI, index: pastIndex })
        }
      }
    }
    
    // Add all hidden bearish divergences
    for (const div of hBearishDivs) {
      divergences.push({
        startTime: div.candle.time,
        endTime: currentTime,
        rsiStart: div.rsi,
        rsiEnd: currentRSI,
        priceStart: div.candle.close,
        priceEnd: currentPrice,
        type: 'h_bearish'
      })
    }
  }
  
  // HIDDEN BULLISH DIVERGENCE - 30 < RSI ≤ 50 and RSI change < 0
  else if (currentRSI > 30 && currentRSI <= 50 && currentRSIChange < 0) {
    console.log('🟡 Checking HIDDEN BULLISH divergences...')
    const hBullishDivs: Array<{ candle: OHLCVDataPoint; rsi: number; index: number }> = []
    
    for (let i = 1; i < candidateCandles.length - 1; i++) {
      const pastCandle = candidateCandles[i]
      const prevCandle = candidateCandles[i - 1]
      const nextCandle = candidateCandles[i + 1]
      
      if (!pastCandle || !prevCandle || !nextCandle) continue
      
      const pastIndex = data.indexOf(pastCandle)
      const pastRSI = rsiValues[pastIndex]
      const prevRSI = rsiValues[data.indexOf(prevCandle)]
      const nextRSI = rsiValues[data.indexOf(nextCandle)]
      
      if (pastRSI === undefined || prevRSI === undefined || nextRSI === undefined) continue
      
      // Check if pastRSI is a local minimum
      if (prevRSI > pastRSI && pastRSI < nextRSI && pastRSI > 40 && pastRSI < 55) {
        const baseValueChange = calcPercentageIncrease(pastCandle.close, currentPrice)
        const rsiChange = calcPercentageIncrease(pastRSI, currentRSI)
        
        // Get data between past and current for linear regression
        const periodData = data.filter(d => d.time >= pastCandle.time && d.time <= currentTime)
        const periodPrices = periodData.map(d => d.close)
        const periodRSIs = periodData.map(d => {
          const idx = data.indexOf(d)
          return rsiValues[idx]
        }).filter(val => val !== undefined)
        const periodTimes = periodData.map(d => d.time / 1000)
        
        const priceRegression = linearRegression(periodTimes, periodPrices)
        const rsiRegression = linearRegression(periodTimes, periodRSIs)
        
        // Check hidden bullish divergence conditions
        if (
          rsiChange <= -6 &&
          baseValueChange > 0 &&
          priceRegression.slope > 0 &&
          rsiRegression.slope < 0 &&
          priceRegression.rSquared > 0.3 &&
          !doesAnyValueCrossDown(data, pastRSI, pastCandle.time, currentRSI, currentTime, 1.05, 'rsi', rsiValues) &&
          !doesAnyValueCrossDown(data, pastCandle.close, pastCandle.time, currentPrice, currentTime, 1.03, 'close') &&
          getAngle(pastRSI, pastCandle.time, currentRSI, currentTime) <= ANGLE_LIMIT
        ) {
          hBullishDivs.push({ candle: pastCandle, rsi: pastRSI, index: pastIndex })
        }
      }
    }
    
    // Add all hidden bullish divergences
    for (const div of hBullishDivs) {
      divergences.push({
        startTime: div.candle.time,
        endTime: currentTime,
        rsiStart: div.rsi,
        rsiEnd: currentRSI,
        priceStart: div.candle.close,
        priceEnd: currentPrice,
        type: 'h_bullish'
      })
    }
  }
  
  // TEMPORARY: Test with relaxed conditions to verify algorithm logic
  if (divergences.length === 0 && candidateCandles.length > 10) {
    console.log('🧪 Testing with RELAXED thresholds...')
    
    // Test basic logic with any RSI level and minimal change requirements
    if (Math.abs(currentRSIChange) > 1) { // Just 1% change instead of 6%
      console.log(`  Testing with RSI change of ${currentRSIChange}%`)
      
      for (let i = 0; i < Math.min(candidateCandles.length, 5); i++) {
        const pastCandle = candidateCandles[i]
        if (!pastCandle) continue
        
        const pastIndex = data.indexOf(pastCandle)
        const pastRSI = rsiValues[pastIndex]
        
        if (pastRSI === undefined) continue
        
        const baseValueChange = calcPercentageIncrease(pastCandle.close, currentPrice)
        const rsiChange = calcPercentageIncrease(pastRSI, currentRSI)
        
        console.log(`    Past RSI: ${pastRSI.toFixed(2)}, Current RSI: ${currentRSI.toFixed(2)}`)
        console.log(`    Price change: ${baseValueChange.toFixed(2)}%, RSI change: ${rsiChange.toFixed(2)}%`)
        
        // Very relaxed test condition
        if (Math.abs(rsiChange) > 1) {
          console.log(`    ✅ Would be a relaxed divergence (RSI change: ${rsiChange}%)`)
          break
        }
      }
    }
  }
  
  console.log(`📈 Candle ${curIdx} summary: Found ${divergences.length} divergences`)
  return divergences
}

// Get all RSI divergences for entire dataset
function getAllRSIDivergences(data: OHLCVDataPoint[], rsiValues: number[]): DivergencePoint[] {
  const allDivergences: DivergencePoint[] = []
  
  for (let i = 0; i < data.length; i++) {
    const divergences = getRSIDivergences(data, rsiValues, i)
    allDivergences.push(...divergences)
  }
  
  return allDivergences
}

export interface StochasticConfig {
  show: boolean
  type: 'Stochastic - Standard' | 'RSI Stochastic'
  source: 'Price' | 'Volume - On Balance Volume' | 'Volume - On Balance Volume - Locked to Standard Candles'
  showType: 'K and D' | 'K Only' | 'D Only' | 'Double Stochastic - K and D + Long Term RSI Stochastic K - Set Value: 14, 14, 3, 3' | 'Double Stochastic - K and D + Long Term Stochastic D - Set Value: 21, 4, 10'
  
  // Standard Stochastic Parameters
  kPeriod: number // Default: 6
  dPeriod: number // Default: 3
  smoothing: number // Default: 3
  
  // RSI Stochastic Parameters  
  rsiLength: number // Default: 13
  stochLength: number // Default: 13
  kSmoothing: number // Default: 3
  dSmoothing: number // Default: 3
  
  // Double Stochastic Parameters (Fixed values from Pine Script)
  doubleStochK: number // Fixed: 21
  doubleStochD: number // Fixed: 4
  doubleStochSmoothing: number // Fixed: 10
  
  // Double RSI Stochastic Parameters (Fixed values from Pine Script)
  doubleRSIStochRSI: number // Fixed: 14
  doubleRSIStochLength: number // Fixed: 14
  doubleRSIStochKSmoothing: number // Fixed: 3
  doubleRSIStochDSmoothing: number // Fixed: 3
  
  brightness: number
}

export interface StochasticResult {
  stochK: SeriesDataPoint[]
  stochD: SeriesDataPoint[]
  doubleStochK?: SeriesDataPoint[]
  doubleStochD?: SeriesDataPoint[]
  doubleRSIStochK?: SeriesDataPoint[]
  doubleRSIStochD?: SeriesDataPoint[]
}

// Export divergence functions for use in other components
export { getRSIDivergences, getAllRSIDivergences, type DivergencePoint }