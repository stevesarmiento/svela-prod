import * as React from "react"

import { cn } from "@v1/ui/cn"

export interface ChartLoadingSkeletonProps {
  className?: string
  height?: number
  /**
   * How many fake lines to render (min 1).
   * Pass the same count as the real series you expect (coins/watchlists).
   */
  lines?: number
}

interface ChartPoint {
  x: number
  y: number
}

function normalizeLines(lines: number | undefined): number {
  if (typeof lines !== "number" || Number.isNaN(lines)) return 3
  return Math.max(1, Math.floor(lines))
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function sanitizeSvgId(value: string): string {
  // `useId()` returns colons (:) which can be finicky inside `url(#...)` in SVG.
  return value.replace(/[^a-zA-Z0-9_-]/g, "")
}

const DEFAULT_POINT_COUNT = 49 // ~2d @ 1h points (48 intervals)
const DEFAULT_LINE_SEEDS: readonly number[] = [11, 29, 53] as const

function mulberry32(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildLinePath(points: ChartPoint[]): string {
  const first = points[0]
  if (!first) return ""

  const parts: Array<string> = [`M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`]
  for (let i = 1; i < points.length; i++) {
    const point = points[i]
    if (!point) continue
    parts.push(`L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
  }
  return parts.join(" ")
}

function generateSporadicLine(args: {
  seed: number
  points?: number
  yMin: number
  yMax: number
  baselineY?: number
  startY?: number
}): string {
  const pointCount = args.points ?? DEFAULT_POINT_COUNT
  const rand = mulberry32(args.seed)

  const yMin = args.yMin
  const yMax = args.yMax
  const targetY =
    typeof args.baselineY === "number" && !Number.isNaN(args.baselineY)
      ? clamp(args.baselineY, yMin, yMax)
      : (yMin + yMax) / 2

  const startY =
    typeof args.startY === "number" && !Number.isNaN(args.startY)
      ? clamp(args.startY, yMin, yMax)
      : targetY

  // Start clustered on the left, then fan out.
  let y = startY + (rand() - 0.5) * 1.6
  let velocity = (rand() - 0.5) * 1.2
  let drift = (rand() - 0.5) * 1.4

  const points: Array<ChartPoint> = []
  for (let i = 0; i < pointCount; i++) {
    const x = (i / (pointCount - 1)) * 100
    points.push({ x, y })

    const t = i / (pointCount - 1)
    const ramp = clamp(t * 3, 0, 1)

    // Regime shifts (trend changes).
    if (rand() < 0.12 * ramp) drift = (rand() - 0.5) * 2.6

    // Small step noise + mild mean reversion.
    const noise = (rand() - 0.5) * 4.2 * (0.25 + 0.75 * ramp)
    const meanReversion = (targetY - y) * (0.01 + 0.06 * ramp)
    velocity = velocity * 0.62 + drift * 0.35 + noise + meanReversion

    // Occasional impulse spikes for more “real” PA.
    if (rand() < 0.07 * ramp) velocity += (rand() - 0.5) * 18 * ramp

    y = clamp(y + velocity, yMin, yMax)
  }

  return buildLinePath(points)
}

export function ChartLoadingSkeleton({ className, height = 400, lines }: ChartLoadingSkeletonProps) {
  const lineCount = normalizeLines(lines)

  const rawId = React.useId()
  const safeId = sanitizeSvgId(rawId)
  const maskId = `chartLoadingMask_${safeId}`
  const gradientId = `chartLoadingGradient_${safeId}`

  // Skeleton “time range”: ~2 days of hourly points across the width.
  // This is intentionally deterministic (seeded) so it doesn’t flicker on re-render.
  const yMin = 18
  const yMax = 82
  const ySpan = yMax - yMin
  const startY = (yMin + yMax) / 2

  const paths = Array.from({ length: lineCount }, (_, index) => {
    const baseSeed = DEFAULT_LINE_SEEDS[index % DEFAULT_LINE_SEEDS.length] ?? 11
    const seed = baseSeed + index * 101
    const baselineY = lineCount === 1 ? (yMin + yMax) / 2 : yMin + ((index + 1) / (lineCount + 1)) * ySpan
    return generateSporadicLine({
      seed,
      points: DEFAULT_POINT_COUNT,
      yMin,
      yMax,
      baselineY,
      startY,
    })
  })

  const strokeWidthPx = 1

  return (
    <div className={cn("relative w-full overflow-hidden", className)} style={{ height }}>
      <span className="sr-only">Loading chart</span>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="size-full"
        aria-hidden="true"
      >
        <defs>
          {/* Base skeleton line mask */}
          <mask id={maskId}>
            <rect x="0" y="0" width="100" height="100" fill="black" />
            {paths.map((d) => (
              <path
                key={d}
                d={d}
                fill="none"
                stroke="white"
                strokeWidth={strokeWidthPx}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </mask>

          {/* Shine gradient (inspired by `.ck-qr-shine`) */}
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(1 0 0 / 0)" />
            <stop offset="50%" stopColor="oklch(1 0 0 / 0.22)" />
            <stop offset="100%" stopColor="oklch(1 0 0 / 0)" />
          </linearGradient>
        </defs>

        {/* Static faint lines (so the chart is visible even between shines) */}
        {paths.map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke="color-mix(in oklab, var(--muted-foreground) 25%, transparent)"
            strokeWidth={strokeWidthPx}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Animated shine, masked to the line(s) */}
        <g mask={`url(#${maskId})`}>
          <rect
            x={-200}
            y={-200}
            width={500}
            height={500}
            fill={`url(#${gradientId})`}
            className="animate-[ck-qr-slide-diagonal_0.55s_linear_infinite] motion-reduce:animate-none"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>
    </div>
  )
}

