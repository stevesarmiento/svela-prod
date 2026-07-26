import { cn } from "@v1/ui/cn"
import { formatLargeNumber } from "@v1/ui/format-numbers"
import { Fragment, memo, useMemo, useDeferredValue } from "react"
import { Badge } from "@v1/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip"
import { Info } from "lucide-react"
import { IconInfinity, IconTriangleFill } from "symbols-react"
import { formatUsdPrice } from "@/lib/format-usd"

function MetricLabel({ label, helpText }: { label: string; helpText: string }) {
  return (
    <div className="inline-flex items-center gap-1">
      <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`${label} info`}
            className={cn(
              "inline-flex items-center justify-center rounded-sm p-0.5",
              "text-muted-foreground/70 hover:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/20",
            )}
          >
            <Info className="size-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="center"
          className="p-2.5 rounded-md max-w-xs text-pretty text-[11px] font-normal normal-case tracking-normal"
        >
          {helpText}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

function deriveUsdMoveFromPercentChange(args: { priceUsd: number; percentChange: number }): number | null {
  const priceUsd = args.priceUsd
  const percentChange = args.percentChange

  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null
  if (!Number.isFinite(percentChange)) return null

  const r = percentChange / 100
  const denom = 1 + r
  if (!Number.isFinite(denom) || denom <= 0) return null

  const previousPrice = priceUsd / denom
  const deltaUsd = priceUsd - previousPrice
  if (!Number.isFinite(deltaUsd)) return null

  return deltaUsd
}

interface DailyOhlcvBar {
  time: number
  open: number
  high: number
  low: number
  close: number
}

function computeFdvUsd(priceUsd: number | null, maxSupply: number | null): number | null {
  if (priceUsd == null || !Number.isFinite(priceUsd) || priceUsd <= 0) return null
  if (maxSupply == null || !Number.isFinite(maxSupply) || maxSupply <= 0) return null
  const fdv = priceUsd * maxSupply
  return Number.isFinite(fdv) ? fdv : null
}

function computeFloatPct(circulatingSupply: number | null, maxSupply: number | null): number | null {
  if (circulatingSupply == null || !Number.isFinite(circulatingSupply) || circulatingSupply <= 0) return null
  if (maxSupply == null || !Number.isFinite(maxSupply) || maxSupply <= 0) return null
  const pct = (circulatingSupply / maxSupply) * 100
  return Number.isFinite(pct) ? pct : null
}

function computeTurnoverPct(volume24hUsd: number | null, marketCapUsd: number | null): number | null {
  if (volume24hUsd == null || !Number.isFinite(volume24hUsd) || volume24hUsd <= 0) return null
  if (marketCapUsd == null || !Number.isFinite(marketCapUsd) || marketCapUsd <= 0) return null
  const pct = (volume24hUsd / marketCapUsd) * 100
  return Number.isFinite(pct) ? pct : null
}

function computeRangePositionPct(args: { dailyOhlcv: ReadonlyArray<DailyOhlcvBar>; days: number }): number | null {
  const cleaned = args.dailyOhlcv
    .filter((b) => {
      return (
        Number.isFinite(b.time) &&
        Number.isFinite(b.high) &&
        Number.isFinite(b.low) &&
        Number.isFinite(b.close) &&
        b.high > 0 &&
        b.low > 0 &&
        b.close > 0
      )
    })
    .slice()
    .sort((a, b) => a.time - b.time)

  if (cleaned.length < args.days) return null
  const window = cleaned.slice(-args.days)

  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY
  for (const b of window) {
    low = Math.min(low, b.low)
    high = Math.max(high, b.high)
  }

  const lastClose = window[window.length - 1]!.close
  const denom = high - low
  if (!Number.isFinite(low) || !Number.isFinite(high) || !Number.isFinite(lastClose)) return null
  if (denom <= 0) return null

  const pct = ((lastClose - low) / denom) * 100
  if (!Number.isFinite(pct)) return null
  return Math.max(0, Math.min(100, pct))
}

function computeAtrPct14d(dailyOhlcv: ReadonlyArray<DailyOhlcvBar>): number | null {
  const cleaned = dailyOhlcv
    .filter((b) => {
      return (
        Number.isFinite(b.time) &&
        Number.isFinite(b.open) &&
        Number.isFinite(b.high) &&
        Number.isFinite(b.low) &&
        Number.isFinite(b.close) &&
        b.open > 0 &&
        b.high > 0 &&
        b.low > 0 &&
        b.close > 0
      )
    })
    .slice()
    .sort((a, b) => a.time - b.time)

  // Need 15 daily bars to compute 14 TR values (TR uses prev close).
  if (cleaned.length < 15) return null

  const window = cleaned.slice(-15)
  let trSum = 0

  for (let i = 1; i < window.length; i++) {
    const prevClose = window[i - 1]!.close
    const high = window[i]!.high
    const low = window[i]!.low

    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose))
    if (!Number.isFinite(tr)) return null
    trSum += tr
  }

  const atr = trSum / 14
  const lastClose = window[window.length - 1]!.close
  if (!Number.isFinite(atr) || atr <= 0) return null
  if (!Number.isFinite(lastClose) || lastClose <= 0) return null

  const pct = (atr / lastClose) * 100
  return Number.isFinite(pct) ? pct : null
}

// Hoisted default so the reference is stable across renders (keeps memo /
// hook dependency checks referentially equal when the prop is omitted).
const EMPTY_OHLCV: ReadonlyArray<DailyOhlcvBar> = []

interface MarketMetricsProps {
  data: {
    // CoinGecko format
    current_price: number | null
    total_volume: number | null
    market_cap: number | null
    price_change_percentage_24h: number | null
    market_cap_rank: number | null
    circulating_supply: number | null
    max_supply: number | null
    symbol: string
  }
  dailyOhlcv?: ReadonlyArray<DailyOhlcvBar>
  isPending?: boolean
}

export const MarketMetrics = memo(function MarketMetrics({ data, dailyOhlcv = EMPTY_OHLCV, isPending }: MarketMetricsProps) {
  // React 19: Defer expensive data processing
  const deferredData = useDeferredValue(data)
  // React 19: Memoized debug logging (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log('MarketMetrics received data:', {
      raw_data: deferredData,
      data_keys: Object.keys(deferredData),
      current_price: deferredData.current_price,
      total_volume: deferredData.total_volume,
      market_cap: deferredData.market_cap,
      price_change_percentage_24h: deferredData.price_change_percentage_24h,
      circulating_supply: deferredData.circulating_supply,
      max_supply: deferredData.max_supply,
      symbol: deferredData.symbol
    })
  }

  // React 19: Memoized metrics calculation using deferred data
  const metrics: Array<{ label: string; helpText: string; value: React.ReactNode; className?: string }> = useMemo(() => {
    const marketCap =
      deferredData.market_cap != null && Number.isFinite(deferredData.market_cap)
        ? `$${formatLargeNumber(deferredData.market_cap)}`
        : <span className="text-muted-foreground">—</span>

    const fdv = computeFdvUsd(deferredData.current_price, deferredData.max_supply)
    const fdvValue =
      fdv != null ? (
        `$${formatLargeNumber(fdv)}`
      ) : (
        <span className="text-muted-foreground"><IconInfinity className="size-4 fill-muted-foreground" /></span>
      )

    const volume24h =
      deferredData.total_volume != null && Number.isFinite(deferredData.total_volume)
        ? `$${formatLargeNumber(deferredData.total_volume)}`
        : <span className="text-muted-foreground">—</span>

    const turnoverPct = computeTurnoverPct(deferredData.total_volume, deferredData.market_cap)
    const turnoverValue =
      turnoverPct != null ? (
        `${turnoverPct.toFixed(2)}%`
      ) : (
        <span className="text-muted-foreground">—</span>
      )

    const rangePositionPct30d = computeRangePositionPct({ dailyOhlcv, days: 30 })
    const rangePositionValue =
      rangePositionPct30d != null ? (
        `${rangePositionPct30d.toFixed(0)}%`
      ) : (
        <span className="text-muted-foreground">—</span>
      )

    const dailyPerformance = (() => {
      const change24h = deferredData.price_change_percentage_24h
      const priceUsd = deferredData.current_price

      if (change24h == null || !Number.isFinite(change24h) || priceUsd == null || !Number.isFinite(priceUsd) || priceUsd <= 0) {
        return <span className="text-muted-foreground">—</span>
      }

      const isPositive = change24h > 0
      const isNegative = change24h < 0
      const isNeutral = !isPositive && !isNegative
      const usdMove = deriveUsdMoveFromPercentChange({ priceUsd, percentChange: change24h })
      const usdSign = isPositive ? "+" : isNegative ? "-" : ""

      return (
        <div className="inline-flex items-center justify-center gap-2">
          <span
            className={cn(
              "font-berkeley-mono text-xs tabular-nums",
              isPositive && "text-emerald-400",
              isNegative && "text-rose-400",
              isNeutral && "text-muted-foreground",
            )}
          >
            {usdMove === null ? "—" : `${usdSign}${formatUsdPrice(Math.abs(usdMove))}`}
          </span>
          <Badge
            variant={isPositive ? "success" : isNegative ? "destructive" : "outline"}
            className={cn(
              "h-5 px-1.5 font-berkeley-mono text-[11px] tabular-nums gap-1",
              isNeutral && "border-zinc-200/60 text-muted-foreground dark:border-white/10",
            )}
          >
            <IconTriangleFill
              aria-hidden="true"
              className={cn("size-[4px] shrink-0 fill-current", isNegative && "rotate-180")}
            />
            {Math.abs(change24h).toFixed(2)}%
          </Badge>
        </div>
      )
    })()

    const atrPct14d = computeAtrPct14d(dailyOhlcv)
    const atrValue =
      atrPct14d != null ? (
        `${atrPct14d.toFixed(2)}%`
      ) : (
        <span className="text-muted-foreground">—</span>
      )

    const floatPct = computeFloatPct(deferredData.circulating_supply, deferredData.max_supply)
    const floatValue =
      floatPct != null ? (
        `${floatPct.toFixed(1)}%`
      ) : (
        <span className="text-muted-foreground"><IconInfinity className="size-4 fill-muted-foreground" /></span>
      )

    return [
      {
        label: "Market Cap",
        helpText: "Market cap in USD (spot price × circulating supply when available).",
        value: marketCap,
      },
      {
        label: "FDV",
        helpText: "Fully diluted valuation: price × max supply. Shows — when max supply is unknown/uncapped (e.g. ETH).",
        value: fdvValue,
      },
      {
        label: "Float %",
        helpText: "Circulating supply ÷ max supply. Shows — when max supply is unknown/uncapped.",
        value: floatValue,
      },
      {
        label: "ATR % (14d)",
        helpText: "14-day Average True Range as a percent of price, using daily-bucketed candles (volatility proxy).",
        value: atrValue,
      },
      {
        label: "30d Position",
        helpText:
          "Where today’s close sits within the last 30 daily candles’ low→high range. 0% = near 30d lows, 100% = near 30d highs.",
        value: rangePositionValue,
      },
      {
        label: "24h Volume",
        helpText: "Notional USD traded in the last 24 hours across tracked venues.",
        value: volume24h,
      },
      {
        label: "Daily Performance",
        helpText: "Rolling 24h move. Left number is the inferred USD move; badge is the 24h percent change.",
        value: dailyPerformance,
      },
      {
        label: "Turnover",
        helpText: "24h volume ÷ market cap. Interpreted as “% of the market cap that traded today” (a liquidity/velocity proxy).",
        value: turnoverValue,
      },
    ]
  }, [deferredData, dailyOhlcv])

  // React 19: Memoized development logging
  if (process.env.NODE_ENV === 'development') {
    console.log('Calculated metrics for display:', metrics.map(metric => ({
      label: metric.label,
      value: metric.value,
      className: metric.className
    })))
  }

  // React 19: Show pending states
  const showPending = isPending

  return (
    <div className={cn(
      "bg-white dark:bg-zinc-950/50 backdrop-blur-xl border border-zinc-800/20 dark:border-zinc-800/30 rounded-[15px] overflow-hidden shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.1),inset_0_-4px_30px_oklch(0_0_0_/_0.1),0_4px_8px_oklch(0_0_0_/_0.05)] dark:shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.2),inset_0_-4px_1990px_oklch(0.2978_0.0083_317.72_/_0.3),0_4px_16px_oklch(0_0_0_/_0.6)] will-change-auto",
      showPending && "opacity-80 transition-opacity duration-200"
    )}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 md:flex md:items-center md:gap-x-0 md:gap-y-0">
        {metrics.map((metric, index) => (
          <Fragment key={metric.label}>
            <div
              className={cn(
                "flex flex-col items-center py-3",
                "md:flex-1 md:py-4",
                showPending && "opacity-80", 
              )}
            >
              <div className="flex items-center gap-2 text-center mb-2">
                <MetricLabel label={metric.label} helpText={metric.helpText} />
              </div>
              <div
                className={cn(
                  "font-berkeley-mono text-xs tabular-nums text-center",
                  metric.className || "text-foreground",
                  showPending && "animate-pulse motion-reduce:animate-none",
                )}
              >
                {metric.value}
              </div>
            </div>
            {index < metrics.length - 1 ? (
              <div className="hidden md:flex justify-center">
                <div className="h-[77px] w-px bg-gradient-to-b from-transparent via-black/20 to-transparent" />
                <div className="h-[77px] w-px bg-gradient-to-b from-transparent via-foreground/20 to-transparent" />
                <div className="h-[77px] w-px bg-gradient-to-b from-transparent via-black to-transparent" />
                </div>
            ) : null}
          </Fragment>
        ))}
      </div>
    </div>
  )
})