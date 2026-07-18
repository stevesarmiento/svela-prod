import { z } from 'zod'
import type { IndicatorData } from '@/lib/analyze-shared'

/**
 * Cross-asset statistics for the multi-token analysis: computed CLIENT-SIDE
 * from the daily price histories (LLMs can't be trusted to do this math),
 * displayed in the dialog's comparative sidebar, and passed to
 * /api/analyze/compare as precomputed ground truth for the prompt.
 *
 * All series are daily closes (1 point = 1 day), most-recent last.
 */

export const ComparativeTokenStatsSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  marketCap: z.number().nullable(),
  /** % return over the last 7 daily closes. */
  return7dPct: z.number().nullable(),
  /** % return over the provided history (~30d). */
  return30dPct: z.number().nullable(),
  /** 7d return minus the benchmark's 7d return (percentage points). */
  excessReturn7dPct: z.number().nullable(),
  /** 30d return minus the benchmark's 30d return (percentage points). */
  excessReturn30dPct: z.number().nullable(),
  /** Annualized realized volatility of daily returns, in %. */
  volatility30dAnnualizedPct: z.number().nullable(),
  /** OLS beta of daily returns vs the benchmark (benchmark = 1). */
  betaVsBenchmark: z.number().nullable(),
  rsi: z.number().nullable(),
  /** Position of the RSI-Bollinger value within its bands (0=lower, 1=upper). */
  bbPercentB: z.number().nullable(),
  /** Bollinger Band Width Percentile (0-100) on daily closes; <20 = squeeze, >80 = expansion climax. */
  bbwpPct: z.number().nullable(),
  /** Wave Trend posture, e.g. "bullish_cross (strong)". */
  waveTrend: z.string().nullable(),
  /** Money Flow posture, e.g. "inflow (moderate)". */
  moneyFlow: z.string().nullable(),
  openInterestChangePct: z.number().nullable(),
  /** 0..1 taker buy ratio. */
  takerBuyRatio: z.number().nullable(),
})

export const ComparativeStatsSchema = z.object({
  benchmarkId: z.string(),
  benchmarkSymbol: z.string(),
  tokens: z.array(ComparativeTokenStatsSchema),
  /**
   * Pearson correlation of aligned daily returns; row/col order matches
   * `tokens`. Diagonal is 1; null where the overlap is too short.
   */
  correlationMatrix: z.array(z.array(z.number().nullable())),
})

export type ComparativeTokenStats = z.infer<typeof ComparativeTokenStatsSchema>
export type ComparativeStats = z.infer<typeof ComparativeStatsSchema>

const MIN_OVERLAP_RETURNS = 10

function dailyReturns(prices: number[]): number[] {
  const returns: number[] = []
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1]!
    const curr = prices[i]!
    if (prev > 0 && Number.isFinite(prev) && Number.isFinite(curr)) {
      returns.push(curr / prev - 1)
    }
  }
  return returns
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** Align two return series on their most recent `n = min(len)` points. */
function alignTails(a: number[], b: number[]): [number[], number[]] {
  const n = Math.min(a.length, b.length)
  return [a.slice(-n), b.slice(-n)]
}

export function pearsonCorrelation(a: number[], b: number[]): number | null {
  const [x, y] = alignTails(a, b)
  if (x.length < MIN_OVERLAP_RETURNS) return null
  const mx = mean(x)
  const my = mean(y)
  let cov = 0
  let vx = 0
  let vy = 0
  for (let i = 0; i < x.length; i++) {
    const dx = x[i]! - mx
    const dy = y[i]! - my
    cov += dx * dy
    vx += dx * dx
    vy += dy * dy
  }
  if (vx === 0 || vy === 0) return null
  return cov / Math.sqrt(vx * vy)
}

export function betaVs(token: number[], benchmark: number[]): number | null {
  const [x, y] = alignTails(token, benchmark) // x = token, y = benchmark
  if (x.length < MIN_OVERLAP_RETURNS) return null
  const mx = mean(x)
  const my = mean(y)
  let cov = 0
  let varB = 0
  for (let i = 0; i < x.length; i++) {
    cov += (x[i]! - mx) * (y[i]! - my)
    varB += (y[i]! - my) ** 2
  }
  if (varB === 0) return null
  return cov / varB
}

export function annualizedVolatilityPct(returns: number[]): number | null {
  if (returns.length < MIN_OVERLAP_RETURNS) return null
  const m = mean(returns)
  const variance =
    returns.reduce((sum, r) => sum + (r - m) ** 2, 0) / (returns.length - 1)
  return Math.sqrt(variance) * Math.sqrt(365) * 100
}

function periodReturnPct(prices: number[], periods: number): number | null {
  if (prices.length < periods + 1) {
    // Fall back to full available history for the "30d" horizon.
    if (prices.length >= 2 && periods >= 30) {
      const first = prices[0]!
      const last = prices[prices.length - 1]!
      return first > 0 ? (last / first - 1) * 100 : null
    }
    return null
  }
  const start = prices[prices.length - 1 - periods]!
  const end = prices[prices.length - 1]!
  return start > 0 ? (end / start - 1) * 100 : null
}

/** Benchmark rule: BTC if present, else ETH, else largest market cap. */
export function pickBenchmarkIndex(
  tokens: Array<{ symbol: string; marketCap: number | null }>,
): number {
  const bySymbol = (sym: string) =>
    tokens.findIndex((t) => t.symbol.toLowerCase() === sym)
  const btc = bySymbol('btc')
  if (btc >= 0) return btc
  const eth = bySymbol('eth')
  if (eth >= 0) return eth
  let best = 0
  for (let i = 1; i < tokens.length; i++) {
    if ((tokens[i]!.marketCap ?? 0) > (tokens[best]!.marketCap ?? 0)) best = i
  }
  return best
}

export interface ComparativeStatsInput {
  id: string
  data: IndicatorData
  /**
   * Timestamped chart series (unix-second `time`). Strongly preferred over
   * `data.priceContext.priceHistory`: the chart hook serves sub-daily bars
   * whose cache windows differ per token, so index-aligned histories can be
   * offset in time — timestamps let us bucket to daily closes and align
   * pairs BY DAY, which is what makes correlation/beta meaningful.
   */
  series?: Array<{ time: unknown; value: number }>
  /** Precomputed BBWP (0-100) — computed client-side from the daily closes. */
  bbwpPct?: number | null
}

interface DailyCloses {
  /** Unix day numbers (floor(unixSeconds / 86400)), ascending. */
  days: number[]
  closes: number[]
}

export function toDailyCloses(
  series: Array<{ time: unknown; value: number }>,
): DailyCloses {
  const byDay = new Map<number, number>()
  for (const point of series) {
    const t = Number(point.time)
    if (!Number.isFinite(t) || !Number.isFinite(point.value)) continue
    // Last value seen for a day wins (series is chronological → daily close).
    byDay.set(Math.floor(t / 86400), point.value)
  }
  const days = [...byDay.keys()].sort((a, b) => a - b)
  return { days, closes: days.map((d) => byDay.get(d)!) }
}

/** Fallback when no timestamps exist: treat indexes as consecutive days. */
function syntheticDailyCloses(prices: number[]): DailyCloses {
  return { days: prices.map((_, i) => i), closes: [...prices] }
}

/**
 * Returns computed over the two tokens' COMMON days only, so each return pair
 * covers the identical time span for both assets.
 */
function alignedReturnsByDay(a: DailyCloses, b: DailyCloses): [number[], number[]] {
  const bByDay = new Map<number, number>()
  b.days.forEach((day, i) => bByDay.set(day, b.closes[i]!))
  const closesA: number[] = []
  const closesB: number[] = []
  a.days.forEach((day, i) => {
    const closeB = bByDay.get(day)
    if (closeB !== undefined) {
      closesA.push(a.closes[i]!)
      closesB.push(closeB)
    }
  })
  return [dailyReturns(closesA), dailyReturns(closesB)]
}

const CORRELATION_WINDOW_DAYS = 30

/** Build the full cross-asset stats block from each token's data. */
export function computeComparativeStats(
  tokens: ComparativeStatsInput[],
): ComparativeStats {
  const bases = tokens.map(({ id, data, series, bbwpPct }) => {
    const daily =
      series && series.length > 0
        ? toDailyCloses(series)
        : syntheticDailyCloses(data.priceContext?.priceHistory ?? [])
    const bb = data.bollingerBands
    const bandWidth = bb ? bb.upperBand - bb.lowerBand : 0
    const wt = data.marketVision?.waveTrend
    const mf = data.marketVision?.moneyFlow
    return {
      id,
      symbol: data.symbol,
      name: data.name,
      marketCap: data.quote.USD.market_cap ?? null,
      daily,
      rsi: data.marketVision?.rsi?.value ?? null,
      bbPercentB:
        bb && bandWidth > 0 ? (bb.currentValue - bb.lowerBand) / bandWidth : null,
      bbwpPct: bbwpPct ?? null,
      waveTrend: wt ? `${wt.signal}${wt.momentum ? ` (${wt.momentum})` : ''}` : null,
      moneyFlow: mf ? `${mf.direction} (${mf.strength})` : null,
      openInterestChangePct: data.liquidationData?.openInterestChange ?? null,
      takerBuyRatio: data.orderFlow?.takerBuyRatio ?? null,
    }
  })

  const benchIdx = pickBenchmarkIndex(bases)
  const bench = bases[benchIdx]!
  const benchReturn7d = periodReturnPct(bench.daily.closes, 7)
  const benchReturn30d = periodReturnPct(bench.daily.closes, 30)

  const tokenStats: ComparativeTokenStats[] = bases.map((base, i) => {
    const return7dPct = periodReturnPct(base.daily.closes, 7)
    const return30dPct = periodReturnPct(base.daily.closes, 30)
    const [tokenReturns, benchReturns] = alignedReturnsByDay(
      base.daily,
      bench.daily,
    )
    return {
      id: base.id,
      symbol: base.symbol,
      name: base.name,
      marketCap: base.marketCap,
      return7dPct,
      return30dPct,
      excessReturn7dPct:
        return7dPct !== null && benchReturn7d !== null
          ? return7dPct - benchReturn7d
          : null,
      excessReturn30dPct:
        return30dPct !== null && benchReturn30d !== null
          ? return30dPct - benchReturn30d
          : null,
      volatility30dAnnualizedPct: annualizedVolatilityPct(
        dailyReturns(base.daily.closes).slice(-CORRELATION_WINDOW_DAYS),
      ),
      betaVsBenchmark:
        i === benchIdx
          ? 1
          : betaVs(
              tokenReturns.slice(-CORRELATION_WINDOW_DAYS),
              benchReturns.slice(-CORRELATION_WINDOW_DAYS),
            ),
      rsi: base.rsi,
      bbPercentB: base.bbPercentB,
      bbwpPct: base.bbwpPct,
      waveTrend: base.waveTrend,
      moneyFlow: base.moneyFlow,
      openInterestChangePct: base.openInterestChangePct,
      takerBuyRatio: base.takerBuyRatio,
    }
  })

  const correlationMatrix = bases.map((a, i) =>
    bases.map((b, j) => {
      if (i === j) return 1
      const [ra, rb] = alignedReturnsByDay(a.daily, b.daily)
      return pearsonCorrelation(
        ra.slice(-CORRELATION_WINDOW_DAYS),
        rb.slice(-CORRELATION_WINDOW_DAYS),
      )
    }),
  )

  return {
    benchmarkId: bench.id,
    benchmarkSymbol: bench.symbol,
    tokens: tokenStats,
    correlationMatrix,
  }
}

const fmt = (v: number | null, digits = 2, suffix = ''): string =>
  v === null ? 'N/A' : `${v.toFixed(digits)}${suffix}`

/** Markdown block for the compare prompt — precomputed ground truth. */
export function formatComparativeStats(stats: ComparativeStats): string {
  const lines: string[] = []
  lines.push(
    `Benchmark: ${stats.benchmarkSymbol.toUpperCase()} (rule: BTC, else ETH, else largest market cap in the selection)`,
  )
  lines.push('')
  lines.push(
    '| Asset | 7d Return | 30d Return | Excess 7d vs Bench | Excess 30d vs Bench | Ann. Volatility | Beta vs Bench | RSI | OI Δ | Taker Buy |',
  )
  lines.push('|---|---|---|---|---|---|---|---|---|---|')
  for (const t of stats.tokens) {
    lines.push(
      `| ${t.symbol.toUpperCase()} | ${fmt(t.return7dPct, 2, '%')} | ${fmt(t.return30dPct, 2, '%')} | ${fmt(t.excessReturn7dPct, 2, 'pp')} | ${fmt(t.excessReturn30dPct, 2, 'pp')} | ${fmt(t.volatility30dAnnualizedPct, 0, '%')} | ${fmt(t.betaVsBenchmark)} | ${fmt(t.rsi, 1)} | ${fmt(t.openInterestChangePct, 2, '%')} | ${t.takerBuyRatio === null ? 'N/A' : `${(t.takerBuyRatio * 100).toFixed(1)}%`} |`,
    )
  }
  lines.push('')
  lines.push('Indicator posture per asset (Wave Trend / Money Flow from Market Vision; %B = RSI-Bollinger position 0..1; BBWP = Bollinger Band Width Percentile on daily closes, <20 squeeze / >80 expansion climax):')
  lines.push('| Asset | Wave Trend | Money Flow | RSI-BB %B | BBWP |')
  lines.push('|---|---|---|---|---|')
  for (const t of stats.tokens) {
    lines.push(
      `| ${t.symbol.toUpperCase()} | ${t.waveTrend ?? 'N/A'} | ${t.moneyFlow ?? 'N/A'} | ${fmt(t.bbPercentB, 2)} | ${fmt(t.bbwpPct, 0)} |`,
    )
  }
  lines.push('')
  const symbols = stats.tokens.map((t) => t.symbol.toUpperCase())
  lines.push('Pairwise correlation of daily returns (30d):')
  lines.push(`| | ${symbols.join(' | ')} |`)
  lines.push(`|---|${symbols.map(() => '---').join('|')}|`)
  stats.correlationMatrix.forEach((row, i) => {
    lines.push(
      `| ${symbols[i]} | ${row.map((v) => (v === null ? 'N/A' : v.toFixed(2))).join(' | ')} |`,
    )
  })
  return lines.join('\n')
}
