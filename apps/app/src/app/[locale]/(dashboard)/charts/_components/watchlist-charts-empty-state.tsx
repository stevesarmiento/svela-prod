'use client'

import { type ComponentType, useEffect, useMemo, useState } from 'react'
import { m, useReducedMotion } from 'motion/react'
import { Card, CardContent } from '@v1/ui/card'
import { cn } from '@v1/ui/cn'
import { Kbd } from '@v1/ui/kbd'
import { IconMagnifyingglass } from 'symbols-react'
import { Liveline, type LivelinePoint } from 'liveline'
import { TokenLogo } from '@/components/token-logo'
import { COLOR_THEMES } from '@/components/color-picker'

/** Middle card uses the same bg + border tokens as real watchlist cards from Convex `color`. */
function getWatchlistGroupCardSurfaceClassName(colorKey: string | null | undefined): string {
  const key: keyof typeof COLOR_THEMES =
    colorKey && colorKey in COLOR_THEMES ? (colorKey as keyof typeof COLOR_THEMES) : 'default'
  const theme = COLOR_THEMES[key]
  return cn(theme.bg, theme.border, 'backdrop-blur-md')
}

const DOT_PATTERN_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='5' cy='5' r='1' fill='rgba(255,255,255,0.12)'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'repeat' as const,
}

type IllustrationVariant = 'primary'

const VARIANT_STYLES: Record<
  IllustrationVariant,
  {
    iconClassName: string
    titleLineClassName: string
    subtitleLineClassName: string
    cardClassName: string
  }
> = {
  primary: {
    iconClassName: 'text-primary',
    titleLineClassName: 'bg-primary/20',
    subtitleLineClassName: 'bg-primary/10',
    cardClassName: 'border border-primary/20 backdrop-blur-md',
  },
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

function buildFakeSparkline(seed: number, pointCount: number) {
  const rand = mulberry32(seed)
  const nowSecs = Math.floor(Date.now() / 1000)
  const stepSecs = 60 * 30

  const trend = (rand() - 0.5) * 0.12
  const volatility = 0.35 + rand() * 0.25

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

interface IllustrationWatchlistCardProps {
  absoluteClassName: string
  icon?: ComponentType<{ className?: string }>
  iconEmoji?: string
  /** Watchlist-style name in the header; when set, replaces skeleton lines. */
  cardTitle?: string
  /** Optional muted line under the title (e.g. token count hint). */
  cardSubtitle?: string
  /** Skeleton title width when `cardTitle` is not set. */
  titleWidthClassName?: string
  /** Skeleton subtitle width when `cardTitle` is not set. */
  subtitleWidthClassName?: string
  tokenCount: number
  tokenLogos?: Array<{ src: string; alt: string; fallbackText?: string }>
  sparklineSeed: number
  itemVariants: unknown
  shouldReduceMotion: boolean
  floatingAnimation: (delay: number) => unknown
  floatDelay: number
  /** Overrides default `bg-zinc-800` + border when `cardSurfaceClassName` is not set. */
  cardBgClassName?: string
  /**
   * Full surface (bg + border + blur) for the card, e.g. DB watchlist theme.
   * When set, overrides `cardBgClassName` + default border styling.
   */
  cardSurfaceClassName?: string
}

function IllustrationWatchlistCard({
  absoluteClassName,
  icon: Icon,
  iconEmoji,
  cardTitle,
  cardSubtitle,
  titleWidthClassName,
  subtitleWidthClassName,
  tokenCount,
  tokenLogos,
  sparklineSeed,
  itemVariants,
  shouldReduceMotion,
  floatingAnimation,
  floatDelay,
  cardBgClassName,
  cardSurfaceClassName,
}: IllustrationWatchlistCardProps) {
  const styles = VARIANT_STYLES.primary

  const sparklineData = useMemo(() => buildFakeSparkline(sparklineSeed, 18), [sparklineSeed])
  const tokenKeys = useMemo(
    () => Array.from({ length: tokenCount }, (_, i) => `token-${tokenCount}-${i}`),
    [tokenCount],
  )

  const sparklineWindowSecs = useMemo(() => {
    if (sparklineData.length < 2) return 30
    const first = sparklineData[0]?.time
    const last = sparklineData[sparklineData.length - 1]?.time
    if (typeof first !== 'number' || typeof last !== 'number') return 30
    return Math.max(30, last - first)
  }, [sparklineData])

  const sparklineLatestValue = sparklineData[sparklineData.length - 1]?.value ?? 0

  return (
    <m.div
      variants={itemVariants as never}
      animate={shouldReduceMotion ? {} : (floatingAnimation(floatDelay) as never)}
      className={absoluteClassName}
    >
      <Card
        aria-hidden
        className={cn(
          'relative rounded-[20px] overflow-hidden shadow-2xl shadow-black',
          cardSurfaceClassName ?? cn(cardBgClassName ?? 'bg-zinc-800', styles.cardClassName),
        )}
      >
        <div className="absolute inset-0 opacity-40" style={DOT_PATTERN_STYLE} />
        <CardContent className="relative p-4 h-full flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <div className="size-7 bg-zinc-700/20 rounded-full flex items-center justify-center border border-primary/10">
              {iconEmoji ? (
                <span aria-hidden className="text-[12px] leading-none">
                  {iconEmoji}
                </span>
              ) : Icon ? (
                <Icon className={cn('size-3.5 fill-primary/50', styles.iconClassName)} />
              ) : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 text-left">
              {cardTitle ? (
                <>
                  <p className="truncate text-[13px] font-semibold leading-tight text-white/90">{cardTitle}</p>
                </>
              ) : (
                <div className="flex flex-col gap-1.5 opacity-50">
                  <div
                    className={cn('h-2.5 rounded-full', styles.titleLineClassName, titleWidthClassName)}
                  />
                  <div
                    className={cn(
                      'h-1.5 rounded-full',
                      styles.subtitleLineClassName,
                      subtitleWidthClassName,
                    )}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center relative px-2">
            <div
              className="[mask-image:linear-gradient(to_right,transparent_0%,black_30%,black_100%)]"
              style={{
                WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 30%, black 100%)',
                maskImage: 'linear-gradient(to right, transparent 0%, black 30%, black 100%)',
              }}
            >
              <div className="h-10 w-[180px]">
                <Liveline
                  data={sparklineData}
                  value={sparklineLatestValue}
                  color="oklch(1 0 0 / 0.3137)"
                  lineWidth={2}
                  window={sparklineWindowSecs}
                  showValue={false}
                  dot
                  grid={false}
                  badge={false}
                  fill={false}
                  pulse={false}
                  scrub={false}
                  momentum={false}
                  exaggerate
                  formatTime={() => ''}
                  padding={{ top: 8, right: 5, bottom: 8, left: 2 }}
                  className="size-full opacity-60"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mt-auto">
            <div className="flex -space-x-1.5">
              {tokenLogos?.length
                ? tokenLogos.map((token) => (
                    <TokenLogo
                      key={token.src}
                      src={token.src}
                      alt={token.alt}
                      fallbackText={token.fallbackText}
                      sizePx={20}
                      className="ring-0 border border-primary/5 bg-zinc-700/30"
                      quality={85}
                    />
                  ))
                : tokenKeys.map((key) => (
                    <div
                      key={key}
                      className="size-4 rounded-full bg-zinc-700/30 backdrop-blur-sm border border-primary/5"
                    />
                  ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </m.div>
  )
}

function CoinSearchIllustrationRow({
  src,
  name,
  symbol,
  priceWidthClassName,
  changeWidthClassName,
}: {
  src: string
  name: string
  symbol: string
  priceWidthClassName: string
  changeWidthClassName: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors">
      <TokenLogo
        src={src}
        alt={name}
        sizePx={24}
        fallbackText={symbol.slice(0, 1)}
        className="ring-0 bg-transparent"
        quality={80}
      />
      <div className="min-w-0 flex-1 text-left">
        <div className="truncate text-sm font-semibold text-white/90">{name}</div>
        <div className="-mt-0.5 text-[11px] text-white/50">{symbol}</div>
      </div>
      <div className="flex items-center gap-3">
        <div className={cn('h-3 rounded-full bg-white/10', priceWidthClassName)} />
        <div className={cn('h-3 rounded-full bg-white/10', changeWidthClassName)} />
      </div>
    </div>
  )
}

/** Fades the whole illustration (card edge + shadow) to transparent so no hard bottom is visible. */
// const COIN_SEARCH_ILLUSTRATION_MASK_STYLE = {
//   WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 52%, oklch(0 0 0 / 0.45) 72%, transparent 100%)',
//   maskImage: 'linear-gradient(to bottom, black 0%, black 52%, oklch(0 0 0 / 0.45) 72%, transparent 100%)',
//   WebkitMaskRepeat: 'no-repeat' as const,
//   maskRepeat: 'no-repeat' as const,
//   WebkitMaskSize: '100% 100%',
//   maskSize: '100% 100%',
// }

const COIN_SEARCH_ILLUSTRATION_MASK_STYLE = {
  WebkitMaskImage:
    'radial-gradient(ellipse 125% 100% at 50% 12%, black 28%, oklch(0 0 0 / 0.55) 52%, transparent 78%)',
  maskImage:
    'radial-gradient(ellipse 125% 100% at 50% 12%, black 28%, oklch(0 0 0 / 0.55) 52%, transparent 78%)',
  WebkitMaskRepeat: 'no-repeat' as const,
  maskRepeat: 'no-repeat' as const,
  WebkitMaskSize: '100% 100%',
  maskSize: '100% 100%',
}

function CoinSearchIllustration({ coinLogos }: { coinLogos: Array<{ src: string; name: string; symbol: string }> }) {
  return (
    <div aria-hidden className="relative w-[360px]" style={COIN_SEARCH_ILLUSTRATION_MASK_STYLE}>
      <Card className="rounded-[29px] overflow-hidden dark:bg-zinc-950/50 bg-white border dark:border-zinc-800/30 border-zinc-800/20 rounded-[13px] overflow-hidden shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.1),inset_0_-4px_30px_oklch(0_0_0_/_0.1),0_4px_8px_oklch(0_0_0_/_0.05)] dark:shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.2),inset_0_-4px_1990px_oklch(0.2978_0.0083_317.72_/_0.3),0_4px_16px_oklch(0_0_0_/_0.6)]">
        <CardContent className="p-0">
          <div className="p-2 sticky top-0 border-b border-zinc-800/50">
            <div className="relative overflow-hidden p-1">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <IconMagnifyingglass className="h-4 w-4 fill-white/50" />
                <div className="h-4 w-[210px] rounded-full bg-white/5" />
                <Kbd className="ml-auto bg-white/10 text-white border-white/10 text-[10px] w-8">ESC</Kbd>
              </div>
            </div>
          </div>

          <div className="space-y-2 p-3 px-2">
            <div className="space-y-1">
              <CoinSearchIllustrationRow
                src={coinLogos[0]?.src ?? '/logos/popular/bitcoin.svg'}
                name={coinLogos[0]?.name ?? 'Bitcoin'}
                symbol={coinLogos[0]?.symbol ?? 'BTC'}
                priceWidthClassName="w-12"
                changeWidthClassName="w-10"
              />
              <CoinSearchIllustrationRow
                src={coinLogos[2]?.src ?? '/logos/popular/solana.svg'}
                name={coinLogos[2]?.name ?? 'Solana'}
                symbol={coinLogos[2]?.symbol ?? 'SOL'}
                priceWidthClassName="w-14"
                changeWidthClassName="w-9"
              />
              <CoinSearchIllustrationRow
                src={coinLogos[1]?.src ?? '/logos/popular/ethereum.svg'}
                name={coinLogos[1]?.name ?? 'Ethereum'}
                symbol={coinLogos[1]?.symbol ?? 'ETH'}
                priceWidthClassName="w-10"
                changeWidthClassName="w-12"
              />
              <CoinSearchIllustrationRow
                src={coinLogos[3]?.src ?? '/logos/popular/tether.svg'}
                name={coinLogos[3]?.name ?? 'Tether'}
                symbol={coinLogos[3]?.symbol ?? 'USDT'}
                priceWidthClassName="w-11"
                changeWidthClassName="w-8"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface WatchlistChartsEmptyStateProps {
  groupName?: string | null
  /** Convex watchlist group `color` key (e.g. `blue`, `orange`) — same as ColorPicker / watchlist cards. */
  groupColor?: string | null
}

function getKbdClassName(isActive: boolean) {
  return cn(
    'bg-white/10 text-white border-white/10 text-[10px] transition-colors',
    isActive && 'bg-primary/30 border-primary/40 text-white',
  )
}

export function WatchlistChartsEmptyState({ groupName, groupColor }: WatchlistChartsEmptyStateProps) {
  const shouldReduceMotion: boolean = useReducedMotion() ?? false
  const [isShiftDown, setIsShiftDown] = useState(false)
  const [isADown, setIsADown] = useState(false)

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false
      if (target.isContentEditable) return true
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return
      if (event.key === 'Shift') setIsShiftDown(true)
      if (event.key.toLowerCase() === 'a') setIsADown(true)
      if (event.shiftKey) setIsShiftDown(true)
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key === 'Shift') setIsShiftDown(false)
      if (event.key.toLowerCase() === 'a') setIsADown(false)
      if (!event.shiftKey) setIsShiftDown(false)
    }

    function handleBlur() {
      setIsShiftDown(false)
      setIsADown(false)
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

  const title = 'Add some tokens to watch'
  const subtitle = 'Once you add a few, you can compare them here.'

  const coinLogos = useMemo(
    () => [
      { src: '/logos/popular/bitcoin.svg', name: 'Bitcoin', symbol: 'BTC' },
      { src: '/logos/popular/ethereum.svg', name: 'Ethereum', symbol: 'ETH' },
      { src: '/logos/popular/solana.svg', name: 'Solana', symbol: 'SOL' },
      { src: '/logos/popular/tether.svg', name: 'Tether', symbol: 'USDT' },
    ],
    [],
  )

  return (
    <div className="group flex flex-col items-center justify-center py-20 px-4 text-center">
      <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mb-10">
        <CoinSearchIllustration coinLogos={coinLogos} />
      </m.div>

      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="max-w-sm mt-[-77px]"
      >
        <h3 className="text-2xl font-bold tracking-tight mb-3 text-balance">{title}</h3>
        <p className="text-muted-foreground mb-10 leading-relaxed text-pretty">{subtitle}</p>

        <div className="inline-flex flex-col items-center gap-4 bg-zinc-900/50 px-6 py-4 rounded-xl border border-white/5 backdrop-blur-sm">
          <p className="text-sm font-medium flex items-center gap-3">
            Press <Kbd className={getKbdClassName(isShiftDown)}>Shift</Kbd> +{' '}
            <Kbd className={getKbdClassName(isADown)}>A</Kbd> to add your first token
          </p>
        </div>
      </m.div>
    </div>
  )
}

