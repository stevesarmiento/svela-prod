"use client"

import { useEffect, useMemo, useState } from "react"
import { useReducedMotion } from "motion/react"

import { cn } from "@v1/ui/cn"

/** Milliseconds since epoch (e.g. TanStack Query `dataUpdatedAt`), poll interval, optional fetching flag. */
export interface WatchlistAutoRefreshStatus {
  lastUpdatedAtMs: number | null
  refreshIntervalMs: number
  isRefreshing?: boolean
}

const lastUpdatedFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
})

function clamp01(n: number): number {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function formatCountdownMmSs(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

interface RefreshDualRingProps {
  intervalProgress: number
  minuteProgress: number
  sizePx?: number
  strokeWidthPx?: number
  className?: string
  hideMinuteArc?: boolean
}

/** Isolated ring UI so parent trees don’t re-render on the timer tick. */
function RefreshDualRing({
  intervalProgress,
  minuteProgress,
  sizePx = 28,
  strokeWidthPx = 3.5,
  className,
  hideMinuteArc = false,
}: RefreshDualRingProps) {
  const cx = sizePx / 2
  const cy = sizePx / 2
  const r = (sizePx - strokeWidthPx) / 2
  const c = 2 * Math.PI * r
  const dashOffsetGreen = c * (1 - clamp01(intervalProgress))
  const dashOffsetYellow = c * (1 - clamp01(minuteProgress))

  const ringRotate = { transform: "rotate(-90deg)", transformOrigin: "50% 50%" } as const

  return (
    <svg
      width={sizePx}
      height={sizePx}
      viewBox={`0 0 ${sizePx} ${sizePx}`}
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidthPx}
        className="text-primary/20"
      />
      {!hideMinuteArc ? (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidthPx}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={dashOffsetYellow}
          className="text-amber-400 shadow-sm"
          style={ringRotate}
        />
      ) : null}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidthPx}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={dashOffsetGreen}
        className="text-emerald-500/70 shadow-sm"
        style={ringRotate}
      />
    </svg>
  )
}

interface WatchlistAutoRefreshIndicatorProps {
  status: WatchlistAutoRefreshStatus
  className?: string
}

/**
 * Owns the wall-clock tick state so filter/table UI does not re-render every interval.
 */
export function WatchlistAutoRefreshIndicator({
  status,
  className,
}: WatchlistAutoRefreshIndicatorProps) {
  const shouldReduceMotion = useReducedMotion() ?? false
  const [nowMs, setNowMs] = useState(() => Date.now())

  const refreshUi = useMemo(() => {
    const lastUpdatedAtMs = status.lastUpdatedAtMs
    if (!lastUpdatedAtMs) {
      return {
        lastUpdatedValue: "—",
        countdownLabel: "0:00",
        progress: 0,
        minuteProgress: 0,
      }
    }

    const intervalMs = Math.max(5_000, status.refreshIntervalMs)
    const nextAtMs = lastUpdatedAtMs + intervalMs
    const remainingMs = nextAtMs - nowMs

    const lastUpdatedValue = lastUpdatedFormatter.format(new Date(lastUpdatedAtMs))
    const progress = clamp01(1 - remainingMs / intervalMs)
    const minuteProgress = clamp01((nowMs % 60_000) / 60_000)
    const countdownLabel = formatCountdownMmSs(remainingMs)

    return { lastUpdatedValue, countdownLabel, progress, minuteProgress }
  }, [status.lastUpdatedAtMs, status.refreshIntervalMs, nowMs])

  useEffect(() => {
    if (!status.lastUpdatedAtMs) return
    const tickMs = shouldReduceMotion ? 1000 : 250
    setNowMs(Date.now())
    const id = window.setInterval(() => setNowMs(Date.now()), tickMs)
    return () => window.clearInterval(id)
  }, [status.lastUpdatedAtMs, status.refreshIntervalMs, shouldReduceMotion])

  return (
    <div className={cn("flex shrink-0 items-center gap-2", className)}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1",
          status.isRefreshing && "bg-primary/5",
        )}
        aria-label={`Refreshes in ${refreshUi.countdownLabel}. Last updated ${refreshUi.lastUpdatedValue}.`}
      >
        <div className="flex flex-col items-end leading-tight">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-primary/40">Refreshes in:</span>
            <span className="text-[11px] tabular-nums text-primary/80">
              {refreshUi.countdownLabel}
            </span>
          </div>
          <div className="hidden md:flex items-center gap-1">
            <span className="text-[10px] text-primary/40">Last updated:</span>
            <span className="text-[11px] tabular-nums text-primary/80">
              {refreshUi.lastUpdatedValue}
            </span>
          </div>
        </div>

        <RefreshDualRing
          intervalProgress={refreshUi.progress}
          minuteProgress={refreshUi.minuteProgress}
          hideMinuteArc={shouldReduceMotion}
          className="text-primary/80"
        />
      </div>
    </div>
  )
}
