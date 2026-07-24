'use client'

import { useMemo } from 'react'
import { m } from 'motion/react'
import { cn } from '@v1/ui/cn'
import { Liveline, type LivelinePoint, type LivelineSeries } from 'liveline'
import { useIsomorphicTheme } from '@/hooks/use-isomorphic-theme'
import { addOpacityToColor, generatePastelColors } from '@/lib/chart-colors'
import { adjustOklch } from '@/lib/oklch'

interface WatchlistComparisonEmptyStateProps {
  className?: string
}

const DOT_PATTERN_STYLE = {
  backgroundImage:
    `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='1' fill='rgba(255,255,255,0.2)'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'repeat' as const,
}

function mulberry32(seed: number) {
  let t = seed >>> 0
  return function next() {
    t += 0x6d2b79f5
    let x = t
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function buildFakeLineSeries(seed: number, pointCount: number): Array<LivelinePoint> {
  const rand = mulberry32(seed)
  const nowSecs = Math.floor(Date.now() / 1000)
  const stepSecs = 60 * 60 * 6

  const trend = (rand() - 0.5) * 0.08
  const volatility = 0.25 + rand() * 0.25

  let value = (rand() - 0.5) * 0.6
  const result: Array<LivelinePoint> = []

  for (let i = 0; i < pointCount; i++) {
    const noise = (rand() - 0.5) * volatility
    value += noise + trend
    value = Math.max(-6, Math.min(6, value))

    result.push({
      time: nowSecs - (pointCount - 1 - i) * stepSecs,
      value,
    })
  }

  return result
}

function ComparisonTinyChartIllustration() {
  const { isDarkMode } = useIsomorphicTheme()

  const pastelColors = useMemo(() => {
    const colors = generatePastelColors(3)
    if (isDarkMode) return colors

    // Keep the same "darker in light mode" adjustment used by multi-line-lightweight.
    return colors.map((base) => adjustOklch(base, { dl: -0.4, dc: 0.05 }))
  }, [isDarkMode])

  const fakeSeries = useMemo((): LivelineSeries[] => {
    const s1 = buildFakeLineSeries(11, 22)
    const s2 = buildFakeLineSeries(37, 22)
    const s3 = buildFakeLineSeries(23, 22)

    const v1 = s1[s1.length - 1]?.value ?? 0
    const v2 = s2[s2.length - 1]?.value ?? 0
    const v3 = s3[s3.length - 1]?.value ?? 0

    return [
      {
        id: 'line-1',
        data: s1,
        value: v1,
        color: pastelColors[0] ?? 'oklch(0.7945 0.046 249.44)',
      },
      {
        id: 'line-2',
        data: s2,
        value: v2,
        color: pastelColors[1] ?? 'oklch(0.7107 0.0351 256.79 / 0.85)',
      },
      {
        id: 'line-3',
        data: s3,
        value: v3,
        color: pastelColors[2] ?? 'oklch(0.7227 0.192 149.58 / 0.75)',
      },
    ]
  }, [pastelColors])

  const windowSecs = useMemo(() => {
    let min: number | null = null
    let max: number | null = null

    for (const s of fakeSeries) {
      const first = s.data[0]?.time
      const last = s.data[s.data.length - 1]?.time
      if (typeof first !== 'number' || typeof last !== 'number') continue
      if (min === null || first < min) min = first
      if (max === null || last > max) max = last
    }

    if (min === null || max === null) return 30
    return Math.max(30, max - min)
  }, [fakeSeries])

  return (
    <div aria-hidden className="w-full max-w-[560px]">
      <div className="grid grid-cols-12 gap-0 rounded-[16px] dark:bg-zinc-950/50 bg-zinc-100/50 border dark:border-zinc-800/50 border-zinc-800/10 overflow-hidden p-1">
        {/* Legend */}
        <div className="flex flex-col col-span-4 sm:col-span-3 p-3 pt-2 space-y-2">
          <div className="flex flex-col gap-2 p-0 pt-2">
            {/* Row 1 */}
            <div
              className="relative flex h-6 items-center gap-2 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800/70"
              style={{ backgroundColor: addOpacityToColor(pastelColors[0] ?? 'var(--primary)', 0.1) }}
            >
              <div
                className="absolute left-1.5 h-2 w-1.5 rounded-full border border-black/10 dark:border-black"
                style={{ backgroundColor: pastelColors[0] ?? 'var(--primary)' }}
              />
              <div className="flex h-8 flex-1 items-center gap-2 overflow-hidden pl-4.5 pr-3">
                <span className="h-2 w-10 rounded-full bg-zinc-500/15" />
                <span className="h-2 w-16 rounded-full bg-zinc-500/10" />
              </div>
            </div>

            {/* Row 2 */}
            <div className="relative flex h-6 items-center gap-2 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800/70 bg-white/0">
              <div
                className="absolute left-1.5 h-2 w-1.5 rounded-full border border-black/10 dark:border-black"
                style={{ backgroundColor: pastelColors[1] ?? 'oklch(0.7107 0.0351 256.79 / 0.85)' }}
              />
              <div className="flex h-8 flex-1 items-center gap-2 overflow-hidden pl-4.5 pr-3">
                <span className="h-2 w-12 rounded-full bg-zinc-500/15" />
                <span className="h-2 w-14 rounded-full bg-zinc-500/10" />
              </div>
            </div>

            {/* Row 3 */}
            <div className="relative flex h-6 items-center gap-2 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800/70 bg-white/0">
              <div
                className="absolute left-1.5 h-2 w-1.5 rounded-full border border-black/10 dark:border-black"
                style={{ backgroundColor: pastelColors[2] ?? 'oklch(0.7227 0.192 149.58 / 0.75)' }}
              />
              <div className="flex h-8 flex-1 items-center gap-2 overflow-hidden pl-4.5 pr-3">
                <span className="h-2 w-9 rounded-full bg-zinc-500/15" />
                <span className="h-2 w-20 rounded-full bg-zinc-500/10" />
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="col-span-8 sm:col-span-9 dark:bg-zinc-950/50 bg-white border dark:border-zinc-800/30 border-zinc-800/20 rounded-[13px] overflow-hidden shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.1),inset_0_-4px_30px_oklch(0_0_0_/_0.1),0_4px_8px_oklch(0_0_0_/_0.05)] dark:shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.2),inset_0_-4px_1990px_oklch(0.2978_0.0083_317.72_/_0.3),0_4px_16px_oklch(0_0_0_/_0.6)]">
          <div className="p-0 relative">
            <div className="absolute inset-0 z-[-1] size-full opacity-40 dark:opacity-30" style={DOT_PATTERN_STYLE} />

            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-1">
                <span className="size-6 rounded-full border border-zinc-200/70 dark:border-zinc-800/60 bg-zinc-900" />
                <span className="-ml-2 size-6 rounded-full border border-zinc-200/70 dark:border-zinc-800/60 bg-zinc-900" />
                <span className="-ml-2 size-6 rounded-full border border-zinc-200/70 dark:border-zinc-800/60 bg-zinc-900" />
              </div>
              <div className="flex items-center gap-1 rounded-full border border-zinc-200/60 dark:border-zinc-800/50 bg-zinc-500/5 px-2 py-1">
                <span className="h-2 w-6 rounded-full bg-zinc-500/12" />
                <span className="h-2 w-6 rounded-full bg-zinc-500/10" />
                <span className="h-2 w-6 rounded-full bg-zinc-500/10" />
              </div>
            </div>

            {/* Gradient-ish horizontal grid line vibes */}
            <div
              className="absolute inset-x-0 bottom-0 top-12 pointer-events-none"
              style={{
                backgroundImage: `
                  repeating-linear-gradient(
                    to bottom,
                    transparent 0px,
                    transparent 63px,
                    linear-gradient(to right, transparent 0%, oklch(1 0 0 / 0.06) 50%, transparent 100%) 64px,
                    transparent 65px,
                    transparent 128px
                  )
                `,
              }}
            />

            <div className="px-4 pb-4">
              <div className="relative h-36 w-full">
                <Liveline
                  data={[]}
                  value={0}
                  series={fakeSeries}
                  color="oklch(0.9276 0.0058 264.53)"
                  lineWidth={1.6}
                  window={windowSecs}
                  grid={false}
                  fill={false}
                  pulse={false}
                  badge={false}
                  dot={false}
                  scrub={false}
                  momentum={false}
                  formatTime={() => ''}
                  formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`}
                  padding={{ top: 10, right: 10, bottom: 10, left: 10 }}
                  className="absolute inset-0 size-full opacity-80"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function WatchlistComparisonEmptyState({ className }: WatchlistComparisonEmptyStateProps) {
  return (
    <div className={cn('group flex flex-col items-center justify-center py-20 px-4 text-center', className)}>
      <div className="mb-8">
        <ComparisonTinyChartIllustration />
      </div>

      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="max-w-sm"
      >
        <h3 className="text-2xl font-bold tracking-tight mb-3 text-balance">No Watchlists to compare</h3>
        <p className="text-muted-foreground mb-10 leading-relaxed text-pretty">
          Create some watchlists to compare their performance here.
        </p>
      </m.div>
    </div>
  )
}

