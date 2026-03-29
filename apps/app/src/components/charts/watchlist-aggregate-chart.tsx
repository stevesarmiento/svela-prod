'use client'

import type React from "react"
import { useMemo } from "react"
import type { Time as LightweightTime } from "lightweight-charts"
import { Liveline } from "liveline"
import type { LivelinePoint } from "liveline"

interface AggregateDataPoint {
  time: LightweightTime
  value: number
}

interface WatchlistAggregateChartProps {
  data: AggregateDataPoint[]
  isPositive: boolean
  width?: number
  height?: number
}

function toUnixSeconds(time: LightweightTime): number | null {
  if (typeof time === "number") return Number.isFinite(time) ? time : null

  if (typeof time === "string") {
    const [year, month, day] = time.split("-").map((part) => Number(part))
    if (!year || !month || !day) return null
    return Math.floor(Date.UTC(year, month - 1, day) / 1000)
  }

  if (typeof time === "object" && time) {
    const maybe = time as { year?: unknown; month?: unknown; day?: unknown }
    const year = typeof maybe.year === "number" ? maybe.year : null
    const month = typeof maybe.month === "number" ? maybe.month : null
    const day = typeof maybe.day === "number" ? maybe.day : null
    if (!year || !month || !day) return null
    return Math.floor(Date.UTC(year, month - 1, day) / 1000)
  }

  return null
}

export function WatchlistAggregateChart({ 
  data, 
  isPositive: _isPositive, 
  width = 0, 
  height = 0 
}: WatchlistAggregateChartProps) {
  const resolvedTheme = "dark"

  const points = useMemo((): LivelinePoint[] => {
    const result: LivelinePoint[] = []
    for (const point of data) {
      const time = toUnixSeconds(point.time)
      if (time === null) continue
      if (!Number.isFinite(point.value)) continue
      result.push({ time, value: point.value })
    }
    return result
  }, [data])

  const latestValue = points[points.length - 1]?.value ?? 0

  const windowSecs = useMemo(() => {
    if (points.length < 2) return 30
    const first = points[0]?.time
    const last = points[points.length - 1]?.time
    if (typeof first !== "number" || typeof last !== "number") return 30
    return Math.max(30, last - first)
  }, [points])

  if (points.length === 0) {
    return (
      <div 
        style={{ width, height }} 
        className="flex items-center justify-center text-xs text-muted-foreground"
      >
        Loading chart data...
      </div>
    )
  }

  const wrapperStyle: React.CSSProperties = {
    height,
    ...(width > 0 ? { width } : null),
  }

  const livelineTheme = "dark"
  const livelineColor = "#e5e7eb"
  const opacityClassName = "opacity-60"

  return (
    <div className="w-full relative" style={wrapperStyle}>
      <Liveline
        data={points}
        value={latestValue}
        theme={livelineTheme}
        color={livelineColor}
        lineWidth={2}
        window={windowSecs}
        formatTime={() => ""}
        exaggerate
        grid={false}
        badge={false}
        fill={false}
        pulse={false}
        scrub={false}
        momentum={false}
        className={`size-full ${opacityClassName}`}
      />
    </div>
  )
} 