'use client'

import { useEffect, useMemo, useState } from 'react'
import { m, useReducedMotion } from 'motion/react'
import { cn } from '@v1/ui/cn'
import { Kbd } from '@v1/ui/kbd'
import { Liveline, type LivelinePoint, type LivelineSeries } from 'liveline'
import { generatePastelColors, addOpacityToColor } from '@/lib/chart-colors'
import { TokenLogo } from '@/components/token-logo'

const FEED_TOKENS = [
  { src: '/logos/popular/bitcoin.svg', alt: 'Bitcoin', fallback: 'B' },
  { src: '/logos/popular/solana.svg', alt: 'Solana', fallback: 'S' },
  { src: '/logos/popular/ethereum.svg', alt: 'Ethereum', fallback: 'E' },
  { src: '/logos/popular/sui.svg', alt: 'Sui', fallback: 'S' },
  { src: '/logos/popular/hyperliquid.svg', alt: 'Hyperliquid', fallback: 'H' },
  { src: '/logos/popular/uniswap.svg', alt: 'Uniswap', fallback: 'U' },
] as const

const GROUP_TOKEN_STACKS = [
  [
    { src: '/logos/popular/bitcoin.svg', alt: 'Bitcoin', fallback: 'B' },
    { src: '/logos/popular/ethereum.svg', alt: 'Ethereum', fallback: 'E' },
    { src: '/logos/popular/solana.svg', alt: 'Solana', fallback: 'S' },
  ],
  [
    { src: '/logos/popular/uniswap.svg', alt: 'Uniswap', fallback: 'U' },
    { src: '/logos/popular/sui.svg', alt: 'Sui', fallback: 'S' },
    { src: '/logos/popular/jito.svg', alt: 'Jito', fallback: 'J' },
  ],
  [
    { src: '/logos/popular/hyperliquid.svg', alt: 'Hyperliquid', fallback: 'H' },
    { src: '/logos/popular/aptos.svg', alt: 'Aptos', fallback: 'A' },
    { src: '/logos/popular/bnb.svg', alt: 'BNB', fallback: 'B' },
  ],
] as const

const DOT_PATTERN_STYLE = {
  backgroundImage:
    `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='5' cy='5' r='1' fill='rgba(255,255,255,0.12)'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'repeat' as const,
}

const ILLUSTRATION_MASK_STYLE = {
  WebkitMaskImage:
    'radial-gradient(ellipse 115% 95% at 50% 14%, black 28%, oklch(0 0 0 / 0.5) 54%, transparent 78%)',
  maskImage:
    'radial-gradient(ellipse 115% 95% at 50% 14%, black 28%, oklch(0 0 0 / 0.5) 54%, transparent 78%)',
  WebkitMaskRepeat: 'no-repeat' as const,
  maskRepeat: 'no-repeat' as const,
  WebkitMaskSize: '100% 100%',
  maskSize: '100% 100%',
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

function OverviewDashboardIllustration() {
  const pastelColors = useMemo(() => generatePastelColors(3), [])

  const fakeSeries = useMemo((): LivelineSeries[] => {
    const s1 = buildFakeLineSeries(42, 24)
    const s2 = buildFakeLineSeries(73, 24)
    const v1 = s1[s1.length - 1]?.value ?? 0
    const v2 = s2[s2.length - 1]?.value ?? 0
    return [
      { id: 'portfolio', data: s1, value: v1, color: 'oklch(1 0 0 / 0.5)' },
      { id: 'market', data: s2, value: v2, color: 'oklch(0.7253 0.1752 349.76 / 0.5)' },
    ]
  }, [])

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
    <div aria-hidden className="w-[580px] max-w-full mx-auto" style={ILLUSTRATION_MASK_STYLE}>
      {/* Two-column layout mirroring the real dashboard */}
      <div className="grid grid-cols-12 gap-2 items-start">

        {/* ─── Left: Overview Card ─── */}
        <div className="col-span-5">
          <div className="bg-white dark:bg-zinc-950/50 backdrop-blur-xl border border-zinc-800/20 dark:border-zinc-800/30 rounded-[14px] overflow-hidden shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.1),inset_0_-4px_30px_oklch(0_0_0_/_0.1),0_4px_8px_oklch(0_0_0_/_0.05)] dark:shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.2),inset_0_-4px_1990px_oklch(0.2978_0.0083_317.72_/_0.3),0_4px_16px_oklch(0_0_0_/_0.6)]">
            <div className="p-3 relative">
              {/* Portfolio value */}
              <div className="absolute top-2 left-2 flex flex-col items-start">
                <span className="h-5 w-20 rounded-md bg-zinc-500/15" />
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="h-2.5 w-10 rounded-full bg-zinc-500/12" />
                  <span className="h-2.5 w-10 rounded-full bg-emerald-500/10" />
                </div>
              </div>

              {/* Chart area */}
              <div className="relative mt-3 -mx-3">
                <div
                  className="pointer-events-none absolute inset-0 z-[-1] size-full opacity-40 dark:opacity-30"
                  style={{
                    ...DOT_PATTERN_STYLE,
                    maskImage: 'radial-gradient(ellipse 62% 48% at 50% 48%, oklch(0 0 0) 28%, oklch(0 0 0) 42%, transparent 78%)',
                    WebkitMaskImage: 'radial-gradient(ellipse 62% 48% at 50% 48%, oklch(0 0 0) 28%, oklch(0 0 0) 42%, transparent 78%)',
                  }}
                />

                {/* Time scale pills */}
                <div className="flex items-center justify-end px-3 pb-1">
                  <div className="flex items-center gap-0.5 rounded-full border border-zinc-200/60 dark:border-zinc-800/50 bg-zinc-500/5 px-1.5 py-0.5">
                    <span className="h-1.5 w-3 rounded-full bg-zinc-500/15" />
                    <span className="h-1.5 w-3.5 rounded-full bg-zinc-500/10" />
                    <span className="h-1.5 w-3.5 rounded-full bg-zinc-500/10" />
                    <span className="h-1.5 w-3 rounded-full bg-zinc-500/8" />
                  </div>
                </div>

                <div className="px-2">
                  <div className="relative h-[100px] w-full">
                    <Liveline
                      data={[]}
                      value={0}
                      series={fakeSeries}
                      color="oklch(0.9276 0.0058 264.53)"
                      lineWidth={1.4}
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
                      padding={{ top: 6, right: 6, bottom: 6, left: 6 }}
                      className="absolute inset-0 size-full opacity-80"
                    />
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="w-full scale-x-110 h-[1px] bg-black border-b border-white/15 mt-2" />

              {/* Holdings breakdown bar */}
              <div className="mt-2.5">
                <span className="block h-1.5 w-16 rounded-full bg-zinc-500/12 mb-1.5" />
                <div className="h-2 w-full overflow-hidden rounded-[3px]">
                  <div className="flex h-full w-full gap-0.5">
                    {pastelColors.map((color, i) => (
                      <div
                        key={color}
                        className="h-full rounded-[3px]"
                        style={{
                          width: i === 0 ? '50%' : i === 1 ? '30%' : '20%',
                          backgroundColor: addOpacityToColor(color, 0.6),
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="w-full scale-x-110 h-[1px] bg-black border-b border-white/15 mt-2.5" />

              {/* Group rows */}
              <div className="mt-2 space-y-2">
                {pastelColors.map((color, i) => (
                  <div key={color} className="flex items-center gap-2">
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <span
                        className="h-2 rounded-full bg-zinc-500/15"
                        style={{ width: i === 0 ? '3.5rem' : i === 1 ? '2.5rem' : '3rem' }}
                      />
                      <div className="h-1.5 w-full overflow-hidden rounded-[2px]">
                        <div className="flex h-full w-full gap-px">
                          <div className="h-full rounded-[1px]" style={{ width: '55%', backgroundColor: addOpacityToColor(color, 0.45) }} />
                          <div className="h-full rounded-[1px] bg-zinc-500/10" style={{ width: '30%' }} />
                          <div className="h-full rounded-[1px] bg-zinc-500/7" style={{ width: '15%' }} />
                        </div>
                      </div>
                    </div>
                    {/* Avatar stack */}
                    <div className="flex -space-x-1 shrink-0">
                      {GROUP_TOKEN_STACKS[i]?.map((token) => (
                        <TokenLogo
                          key={token.src}
                          src={token.src}
                          alt={token.alt}
                          fallbackText={token.fallback}
                          sizePx={16}
                          className="ring-0 border border-zinc-800 bg-zinc-500/15"
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Right: Activity Feed ─── */}
        <div className="col-span-7">
          <div className="bg-transparent">
            {/* Tab bar */}
            <div className="px-3 pb-1">
              <div className="flex items-center gap-0 border-b border-zinc-200/10 dark:border-zinc-800/40">
                <span className="px-2.5 py-1.5 border-b-2 border-primary/60">
                  <span className="block h-2 w-6 rounded-full bg-zinc-300/20" />
                </span>
                <span className="px-2.5 py-1.5">
                  <span className="block h-2 w-6 rounded-full bg-zinc-500/10" />
                </span>
              </div>
            </div>

            {/* Feed items */}
            <div className="px-3 pt-2 space-y-3">
              {/* Date header */}
              <span className="block h-1.5 w-8 rounded-full bg-zinc-500/12" />

              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="flex items-start gap-2">
                  <TokenLogo
                    src={FEED_TOKENS[row]?.src}
                    alt={FEED_TOKENS[row]?.alt ?? ''}
                    fallbackText={FEED_TOKENS[row]?.fallback}
                    sizePx={24}
                    className="shrink-0 ring-0 border border-zinc-800/20 dark:border-zinc-800/40"
                  />
                  <div className="flex-1 space-y-1 pt-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-8 rounded-full bg-zinc-500/15" />
                      <span className="h-1.5 w-4 rounded-full bg-zinc-500/8 ml-auto" />
                    </div>
                    <span
                      className="block h-2 rounded-full bg-zinc-500/10"
                      style={{ width: row % 2 === 1 ? '88%' : '72%' }}
                    />
                    <span
                      className="block h-1.5 rounded-full bg-zinc-500/6"
                      style={{ width: row % 3 === 0 ? '95%' : '80%' }}
                    />
                    <span
                      className={cn(
                        'block h-2.5 w-9 rounded-full',
                        row === 0
                          ? 'bg-emerald-500/10'
                          : row === 1
                            ? 'bg-zinc-500/8'
                            : row === 2
                              ? 'bg-emerald-500/10'
                              : 'bg-rose-500/10',
                      )}
                    />
                  </div>
                </div>
              ))}

              {/* Second date header */}
              <span className="block h-1.5 w-10 rounded-full bg-zinc-500/10" />

              {[4, 5].map((row) => (
                <div key={row} className="flex items-start gap-2">
                  <TokenLogo
                    src={FEED_TOKENS[row]?.src}
                    alt={FEED_TOKENS[row]?.alt ?? ''}
                    fallbackText={FEED_TOKENS[row]?.fallback}
                    sizePx={24}
                    className="shrink-0 ring-0 border border-zinc-800/20 dark:border-zinc-800/40"
                  />
                  <div className="flex-1 space-y-1 pt-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-9 rounded-full bg-zinc-500/15" />
                      <span className="h-1.5 w-4 rounded-full bg-zinc-500/8 ml-auto" />
                    </div>
                    <span className="block h-2 w-[78%] rounded-full bg-zinc-500/10" />
                    <span className="block h-1.5 w-[88%] rounded-full bg-zinc-500/6" />
                    <span
                      className={cn(
                        'block h-2.5 w-9 rounded-full',
                        row % 2 === 0 ? 'bg-emerald-500/10' : 'bg-zinc-500/8',
                      )}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function getKbdClassName(isActive: boolean) {
  return cn(
    'bg-white/10 text-white border-white/10 text-[10px] transition-colors',
    isActive && 'bg-primary/30 border-primary/40 text-white',
  )
}

export function OverviewEmptyState() {
  const shouldReduceMotion: boolean = useReducedMotion() ?? false
  const [isGDown, setIsGDown] = useState(false)
  const [isWDown, setIsWDown] = useState(false)

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false
      if (target.isContentEditable) return true
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return
      if (event.key.toLowerCase() === 'g') setIsGDown(true)
      if (event.key.toLowerCase() === 'w') setIsWDown(true)
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'g') setIsGDown(false)
      if (event.key.toLowerCase() === 'w') setIsWDown(false)
    }

    function handleBlur() {
      setIsGDown(false)
      setIsWDown(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  return (
    <div className="group flex w-full flex-col items-center justify-center py-20 px-4 text-center">
      <m.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mb-10"
      >
        <OverviewDashboardIllustration />
      </m.div>

      <m.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="max-w-sm mt-[-77px]"
      >
        <h3 className="text-2xl font-bold tracking-tight mb-3 text-balance">Your holdings overview</h3>
        <p className="text-muted-foreground mb-10 leading-relaxed text-pretty">
          Create a watchlist and add some tokens to unlock your holdings tracking, movers, and daily briefs.
        </p>

        <div className="inline-flex flex-col items-center gap-4 bg-zinc-900/50 px-6 py-4 rounded-xl border border-white/5 backdrop-blur-sm">
          <p className="text-sm font-medium flex items-center gap-3">
            Press <Kbd className={getKbdClassName(isGDown)}>G</Kbd> +{' '}
            <Kbd className={getKbdClassName(isWDown)}>W</Kbd> to go to watchlist
          </p>
        </div>
      </m.div>
    </div>
  )
}
