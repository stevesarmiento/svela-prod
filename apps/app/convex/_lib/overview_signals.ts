export interface PriceHistoryPointLike {
  timestamp: number
  price: number
  volume: number
}

export interface BreakoutDetectionResult {
  isFresh: boolean
  isNewHigh: boolean
  isNewLow: boolean
  latestTimestamp: number
  latestPrice: number
  maxBeforeLatest: number
  minBeforeLatest: number
}

export function isPriceSpike(args: {
  changePct: number
  thresholdPct: number
}): boolean {
  if (!Number.isFinite(args.changePct)) return false
  if (!Number.isFinite(args.thresholdPct) || args.thresholdPct <= 0) return false
  return Math.abs(args.changePct) >= args.thresholdPct
}

export function detectBreakout(args: {
  points: Array<PriceHistoryPointLike>
  nowMs: number
  freshnessMs: number
}): BreakoutDetectionResult | null {
  const points = args.points
  if (points.length < 6) return null
  const latest = points[points.length - 1]
  if (!latest) return null
  if (!Number.isFinite(latest.timestamp) || !Number.isFinite(latest.price)) return null

  const isFresh = args.nowMs - latest.timestamp <= args.freshnessMs
  if (!isFresh) {
    return {
      isFresh: false,
      isNewHigh: false,
      isNewLow: false,
      latestTimestamp: latest.timestamp,
      latestPrice: latest.price,
      maxBeforeLatest: latest.price,
      minBeforeLatest: latest.price,
    }
  }

  const prior = points.slice(0, -1)
  if (prior.length < 5) return null

  let maxBeforeLatest = prior[0]!.price
  let minBeforeLatest = prior[0]!.price
  for (const p of prior) {
    if (!Number.isFinite(p.price)) continue
    if (p.price > maxBeforeLatest) maxBeforeLatest = p.price
    if (p.price < minBeforeLatest) minBeforeLatest = p.price
  }

  const isNewHigh = latest.price > maxBeforeLatest
  const isNewLow = latest.price < minBeforeLatest

  return {
    isFresh,
    isNewHigh,
    isNewLow,
    latestTimestamp: latest.timestamp,
    latestPrice: latest.price,
    maxBeforeLatest,
    minBeforeLatest,
  }
}

export interface VolumeAnomalyResult {
  ratio: number
  isHigh: boolean
  isLow: boolean
}

export function detectVolumeAnomaly(args: {
  historyVolumes: Array<number>
  currentVolume: number
  highRatio: number
  lowRatio: number
}): VolumeAnomalyResult | null {
  const current = args.currentVolume
  if (!Number.isFinite(current) || current <= 0) return null

  const vols = args.historyVolumes.filter((v) => Number.isFinite(v) && v > 0)
  if (vols.length < 5) return null

  let sum = 0
  for (const v of vols) sum += v
  if (!Number.isFinite(sum) || sum <= 0) return null
  const avg = sum / vols.length
  if (!Number.isFinite(avg) || avg <= 0) return null

  const ratio = current / avg
  if (!Number.isFinite(ratio) || ratio <= 0) return null

  const isHigh = ratio >= args.highRatio
  const isLow = ratio <= args.lowRatio
  if (!isHigh && !isLow) return null

  return { ratio, isHigh, isLow }
}

export function dedupeAndSortByOccurredAt<T extends { id: string; occurredAtMs: number }>(
  events: Array<T>,
): Array<T> {
  const map = new Map<string, T>()
  for (const e of events) {
    if (!map.has(e.id)) map.set(e.id, e)
  }
  const merged = Array.from(map.values())
  merged.sort((a, b) => b.occurredAtMs - a.occurredAtMs)
  return merged
}

export function rankMovers<T extends { changePct: number; impactUsd: number | null }>(
  movers: Array<T>,
  limit: number,
): {
  gainers: Array<T>
  losers: Array<T>
  contributors: Array<T>
} {
  const safeLimit = Math.min(20, Math.max(1, Math.floor(limit)))
  const gainers = [...movers].sort((a, b) => b.changePct - a.changePct).slice(0, safeLimit)
  const losers = [...movers].sort((a, b) => a.changePct - b.changePct).slice(0, safeLimit)
  const contributors = [...movers]
    .filter((m) => typeof m.impactUsd === "number" && Number.isFinite(m.impactUsd))
    .sort((a, b) => Math.abs(b.impactUsd as number) - Math.abs(a.impactUsd as number))
    .slice(0, safeLimit)
  return { gainers, losers, contributors }
}

export function isCacheFresh(expiresAtMs: number, nowMs: number): boolean {
  if (!Number.isFinite(expiresAtMs)) return false
  return expiresAtMs > nowMs
}

