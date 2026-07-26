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

// ---------------------------------------------------------------------------
// Reverse RSI (Siligardos "Reverse Engineering RSI"), consistent with rsi()
// above: solves for the close the NEXT bar would need for Wilder RSI to print
// a target level. rsi() itself is intentionally untouched.

export interface WilderRsiState {
  avgGain: number
  avgLoss: number
  lastClose: number
}

/**
 * Trailing Wilder avgGain/avgLoss + last close, matching rsi()'s internals
 * exactly (same gains/losses construction, same rma smoothing).
 *
 * Returns null when closes.length < period + 1: below that, the next bar's
 * averages would come from the rma SMA seed row rather than the Wilder
 * recurrence, so the reverse formula would not match the forward rsi().
 */
export function wilderRsiState(closes: number[], period: number): WilderRsiState | null {
  if (!Number.isFinite(period) || period < 1) return null
  if (closes.length < period + 1) return null

  const lastClose = closes[closes.length - 1]
  if (lastClose == null || !Number.isFinite(lastClose)) return null

  // Same gains/losses loop as rsi() so forward and reverse can never drift.
  const gains: number[] = []
  const losses: number[] = []
  for (let i = 1; i < closes.length; i++) {
    const current = closes[i]
    const previous = closes[i - 1]

    if (current != null && previous != null) {
      const change = current - previous
      gains.push(change > 0 ? change : 0)
      losses.push(change < 0 ? Math.abs(change) : 0)
    } else {
      gains.push(0)
      losses.push(0)
    }
  }

  const avgGain = rma(gains, period)[gains.length - 1]
  const avgLoss = rma(losses, period)[losses.length - 1]
  if (avgGain == null || !Number.isFinite(avgGain) || avgLoss == null || !Number.isFinite(avgLoss)) return null

  return { avgGain, avgLoss, lastClose }
}

// The Caretaker's zone levels: critical bull / control bull / scale mid /
// control bear / critical bear.
export const DEFAULT_REVERSE_RSI_TARGETS = [80, 62, 50, 38, 20] as const

export interface ReverseRsiLevel {
  target: number
  price: number | null
}

/**
 * Close price the NEXT bar would need for rsi() to print exactly `target`.
 *
 * With RS = target / (100 - target) and Wilder recurrence avg' = (avg*(p-1) + move)/p:
 * - Up bar   (gain = C - P, valid when RS*avgLoss >= avgGain): C = P + (p-1) * (RS*avgLoss - avgGain)
 * - Down bar (loss = P - C, otherwise):                        C = P - (p-1) * (avgGain/RS - avgLoss)
 *
 * Returns null for unreachable targets (<= 0, >= 100), a flat state
 * (avgGain = avgLoss = 0, where rsi() pins to 100), non-finite inputs, or a
 * solved price <= 0.
 */
export function reverseRsiPrice(state: WilderRsiState, period: number, target: number): number | null {
  if (!Number.isFinite(period) || period < 1) return null
  if (!Number.isFinite(target) || target <= 0 || target >= 100) return null

  const { avgGain, avgLoss, lastClose } = state
  if (!Number.isFinite(avgGain) || !Number.isFinite(avgLoss) || !Number.isFinite(lastClose)) return null
  if (avgGain <= 0 && avgLoss <= 0) return null

  const rs = target / (100 - target)
  const price =
    rs * avgLoss >= avgGain
      ? lastClose + (period - 1) * (rs * avgLoss - avgGain)
      : lastClose - (period - 1) * (avgGain / rs - avgLoss)

  return Number.isFinite(price) && price > 0 ? price : null
}

/**
 * Reverse-RSI price levels for a list of targets (default: Caretaker zones).
 * Prices are null when the state is degenerate or a target is unreachable.
 */
export function reverseRsiLevels(
  closes: number[],
  period: number,
  targets: readonly number[] = DEFAULT_REVERSE_RSI_TARGETS,
): ReverseRsiLevel[] {
  const state = wilderRsiState(closes, period)
  return targets.map((target) => ({
    target,
    price: state ? reverseRsiPrice(state, period, target) : null,
  }))
}