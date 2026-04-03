'use client'

import { type ComponentType, useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Card, CardContent } from '@v1/ui/card'
import { cn } from '@v1/ui/cn'
import { Kbd } from '@v1/ui/kbd'
import { IconRainbow, IconSparkles, IconTarget } from 'symbols-react'
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
    <motion.div
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
                  color="#ffffff50"
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
    </motion.div>
  )
}

interface WatchlistChartsEmptyStateProps {
  groupName?: string | null
  /** Convex watchlist group `color` key (e.g. `blue`, `orange`) — same as ColorPicker / watchlist cards. */
  groupColor?: string | null
}

export function WatchlistChartsEmptyState({ groupName, groupColor }: WatchlistChartsEmptyStateProps) {
  const shouldReduceMotion: boolean = useReducedMotion() ?? false
  const [isShiftDown, setIsShiftDown] = useState(false)
  const [isADown, setIsADown] = useState(false)

  const gridKeys = useMemo(() => Array.from({ length: 9 }, (_, i) => `grid-${i}`), [])

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

  function getKbdClassName(isActive: boolean) {
    return cn(
      'bg-white/10 text-white border-white/10 text-[10px] transition-colors',
      isActive && 'bg-primary/30 border-primary/40 text-white',
    )
  }

  const containerVariants = {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  }

  const itemVariants = {
    initial: { scale: 0.8, opacity: 0, y: 10 },
    animate: {
      scale: 1,
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 100,
        damping: 15,
      },
    },
  }

  const floatingAnimation = (delay = 0) => ({
    y: [0, -12, 0],
    transition: {
      duration: 1.5,
      repeat: Number.POSITIVE_INFINITY,
      ease: 'easeInOut',
      delay,
    },
  })

  const title = groupName ? `Add coins to ${groupName}` : 'Add coins to your watchlist'
  const subtitle = groupName
    ? `Once you add a few tokens, you can compare them here.`
    : 'Once you add a few tokens, you can compare them here.'

  const mainCardTokenLogos = useMemo(
    () => [
      { src: '/logos/popular/bitcoin.svg', alt: 'Bitcoin', fallbackText: 'B' },
      { src: '/logos/popular/ethereum.svg', alt: 'Ethereum', fallbackText: 'E' },
      { src: '/logos/popular/solana.svg', alt: 'Solana', fallbackText: 'S' },
      { src: '/logos/popular/tether.svg', alt: 'Tether', fallbackText: 'T' },
      { src: '/logos/popular/bnb.svg', alt: 'BNB', fallbackText: 'B' },
    ],
    [],
  )

  const middleCardTitle = groupName?.trim() ? groupName.trim() : 'Your watchlist'

  const middleCardSurfaceClassName = useMemo(
    () => getWatchlistGroupCardSurfaceClassName(groupColor),
    [groupColor],
  )

  return (
    <div className="group flex flex-col items-center justify-center py-20 px-4 text-center">
      <motion.div
        variants={containerVariants}
        initial="initial"
        animate="animate"
        className="relative w-80 h-80 mb-10 flex items-center justify-center"
      >
        <div className="absolute inset-0 grid grid-cols-3 gap-4 opacity-[0.02] scale-110 pointer-events-none">
          {gridKeys.map((key) => (
            <div key={key} className="aspect-square bg-foreground rounded-3xl border border-foreground" />
          ))}
        </div>

        <div className="absolute top-[70px] left-6 w-[200px] h-32 -rotate-6 z-10">
          <IllustrationWatchlistCard
            absoluteClassName="size-full"
            icon={IconTarget}
            cardTitle="Momentum"
            cardSubtitle="3 tokens"
            tokenCount={3}
            sparklineSeed={11}
            itemVariants={itemVariants}
            shouldReduceMotion={shouldReduceMotion}
            floatingAnimation={floatingAnimation}
            floatDelay={0}
          />
        </div>

        <div className="absolute z-20 w-[200px] h-32">
          <IllustrationWatchlistCard
            absoluteClassName="size-full"
            iconEmoji="🚀"
            icon={IconSparkles}
            cardSurfaceClassName={middleCardSurfaceClassName}
            cardTitle={middleCardTitle}
            tokenCount={5}
            tokenLogos={mainCardTokenLogos}
            sparklineSeed={37}
            itemVariants={itemVariants}
            shouldReduceMotion={shouldReduceMotion}
            floatingAnimation={floatingAnimation}
            floatDelay={1.2}
          />
        </div>

        <div className="absolute bottom-[70px] right-6 w-[200px] h-32 rotate-3 z-10">
          <IllustrationWatchlistCard
            absoluteClassName="size-full"
            icon={IconRainbow}
            cardTitle="Blue chips"
            cardSubtitle="4 tokens"
            tokenCount={4}
            sparklineSeed={23}
            itemVariants={itemVariants}
            shouldReduceMotion={shouldReduceMotion}
            floatingAnimation={floatingAnimation}
            floatDelay={0.6}
          />
        </div>
      </motion.div>

      <motion.div
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
      </motion.div>
    </div>
  )
}

