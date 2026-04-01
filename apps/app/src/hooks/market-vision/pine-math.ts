'use client'

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function nz(value: number | undefined | null, replacement = 0): number {
  return isFiniteNumber(value) ? value : replacement
}

export function pineSma(values: number[], length: number): number[] {
  const n = values.length
  const out: number[] = new Array(n).fill(Number.NaN)
  const period = Math.max(1, Math.floor(length))
  if (n === 0) return out

  for (let i = period - 1; i < n; i++) {
    let sum = 0
    for (let j = 0; j < period; j++) {
      const v = values[i - j]
      if (!isFiniteNumber(v)) {
        sum = Number.NaN
        break
      }
      sum += v
    }
    out[i] = isFiniteNumber(sum) ? sum / period : Number.NaN
  }

  return out
}

export function pineEma(values: number[], length: number): number[] {
  const n = values.length
  const out: number[] = new Array(n).fill(Number.NaN)
  const period = Math.max(1, Math.floor(length))
  if (n === 0) return out

  const alpha = 2 / (period + 1)

  // Seed with SMA of the first `period` values.
  if (n >= period) {
    let seedSum = 0
    for (let i = 0; i < period; i++) {
      const v = values[i]
      if (!isFiniteNumber(v)) {
        seedSum = Number.NaN
        break
      }
      seedSum += v
    }
    out[period - 1] = isFiniteNumber(seedSum) ? seedSum / period : Number.NaN
  }

  for (let i = period; i < n; i++) {
    const v = values[i]
    const prev = out[i - 1]
    if (!isFiniteNumber(v)) {
      out[i] = isFiniteNumber(prev) ? prev : Number.NaN
      continue
    }
    if (!isFiniteNumber(prev)) {
      out[i] = v
      continue
    }
    out[i] = v * alpha + prev * (1 - alpha)
  }

  return out
}

export function pineHighest(values: number[], length: number): number[] {
  const n = values.length
  const out: number[] = new Array(n).fill(Number.NaN)
  const period = Math.max(1, Math.floor(length))
  if (n === 0) return out

  for (let i = period - 1; i < n; i++) {
    let max = Number.NEGATIVE_INFINITY
    for (let j = 0; j < period; j++) {
      const v = values[i - j]
      if (!isFiniteNumber(v)) {
        max = Number.NaN
        break
      }
      if (v > max) max = v
    }
    out[i] = isFiniteNumber(max) ? max : Number.NaN
  }
  return out
}

export function pineLowest(values: number[], length: number): number[] {
  const n = values.length
  const out: number[] = new Array(n).fill(Number.NaN)
  const period = Math.max(1, Math.floor(length))
  if (n === 0) return out

  for (let i = period - 1; i < n; i++) {
    let min = Number.POSITIVE_INFINITY
    for (let j = 0; j < period; j++) {
      const v = values[i - j]
      if (!isFiniteNumber(v)) {
        min = Number.NaN
        break
      }
      if (v < min) min = v
    }
    out[i] = isFiniteNumber(min) ? min : Number.NaN
  }
  return out
}

export function pineRsi(values: number[], length: number): number[] {
  const n = values.length
  const out: number[] = new Array(n).fill(Number.NaN)
  const period = Math.max(1, Math.floor(length))
  if (n === 0) return out
  if (n <= period) return out

  let gainSum = 0
  let lossSum = 0
  for (let i = 1; i <= period; i++) {
    const cur = values[i]
    const prev = values[i - 1]
    if (!isFiniteNumber(cur) || !isFiniteNumber(prev)) return out
    const change = cur - prev
    if (change >= 0) gainSum += change
    else lossSum -= change
  }

  let avgGain = gainSum / period
  let avgLoss = lossSum / period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)

  for (let i = period + 1; i < n; i++) {
    const cur = values[i]
    const prev = values[i - 1]
    if (!isFiniteNumber(cur) || !isFiniteNumber(prev)) {
      out[i] = out[i - 1] ?? Number.NaN
      continue
    }
    const change = cur - prev
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? -change : 0

    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }

  return out
}

