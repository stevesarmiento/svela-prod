'use client'

import { useCallback, useMemo } from "react"
import { Liveline } from "liveline"
import type { LivelinePoint } from "liveline"

export interface HoldingsChartHoverPoint {
  time: number
  value: number
}

function findClosestPoint(
  data: Array<LivelinePoint>,
  targetTimeSec: number,
): LivelinePoint | null {
  if (data.length === 0) return null

  let low = 0
  let high = data.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const midTime = data[mid]?.time
    if (midTime === undefined) break
    if (midTime === targetTimeSec) return data[mid] ?? null
    if (midTime < targetTimeSec) low = mid + 1
    else high = mid - 1
  }

  const right = data[low]
  const left = data[low - 1]
  if (!left) return right ?? null
  if (!right) return left ?? null

  const leftDiff = Math.abs(left.time - targetTimeSec)
  const rightDiff = Math.abs(right.time - targetTimeSec)
  return leftDiff <= rightDiff ? left : right
}

interface HoldingsValueChartProps {
  points: LivelinePoint[]
  height?: number
  onHover?: (hover: HoldingsChartHoverPoint | null) => void
}

/** Y-axis / grid labels: compact so Liveline’s right-side scale stays readable. */
function formatAxisUsd(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(0)}`
}

export function HoldingsValueChart({
  points,
  height = 320,
  onHover,
}: HoldingsValueChartProps) {
  const latestValue = points[points.length - 1]?.value ?? 0

  const windowSecs = useMemo(() => {
    if (points.length < 2) return 30
    const first = points[0]?.time
    const last = points[points.length - 1]?.time
    if (typeof first !== "number" || typeof last !== "number") return 30
    return Math.max(30, last - first)
  }, [points])

  // Wider spans need a year on the time axis; Liveline reads `formatTime(unixSeconds)`.
  const formatTime = useMemo(() => {
    const first = points[0]?.time
    const last = points[points.length - 1]?.time
    const spanSec =
      typeof first === "number" && typeof last === "number" ? last - first : 0
    const includeYear = spanSec > 180 * 24 * 60 * 60

    return (epochSeconds: number) => {
      const dt = new Date(epochSeconds * 1000)
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        ...(includeYear ? { year: "numeric" as const } : {}),
      }).format(dt)
    }
  }, [points])

  const handleHover = useCallback(
    (hover: { time: number; value: number; x: number; y: number } | null) => {
      if (!onHover) return
      if (!hover) {
        onHover(null)
        return
      }
      const timeSec = Math.round(hover.time)
      const closest = findClosestPoint(points, timeSec)
      if (!closest) {
        onHover(null)
        return
      }
      onHover({ time: closest.time, value: closest.value })
    },
    [onHover, points],
  )

  if (!points.length) {
    return (
      <div
        className="flex items-center justify-center text-xs text-muted-foreground"
        style={{ height }}
      >
        Loading chart data...
      </div>
    )
  }

  return (
    <div className="w-full relative" style={{ height }}>
      <Liveline
        data={points}
        value={latestValue}
        theme="dark"
        color="#e5e7eb"
        lineWidth={2}
        window={windowSecs}
        formatTime={formatTime}
        formatValue={formatAxisUsd}
        grid={true}
        badge={true}
        fill={false}
        pulse={false}
        scrub
        momentum={true}
        // Hide canvas tooltip (overview card shows scrub value); scrub crosshair still draws.
        tooltipY={-9999}
        tooltipOutline={false}
        padding={{ top: 12, right: 60, bottom: 20, left: 12 }}
        onHover={handleHover}
        className="size-full"
      />
    </div>
  )
}

