'use client'

import { type ComponentType, useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { LayoutGrid, Plus, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@v1/ui/card'
import { cn } from '@v1/ui/cn'
import { Kbd } from '@v1/ui/kbd'
import { IconRainbow, IconSparkles, IconTarget } from 'symbols-react'
import { Liveline, type LivelinePoint } from 'liveline'

type IllustrationVariant = 'orange' | 'blue' | 'primary'

const DOT_PATTERN_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='5' cy='5' r='1' fill='rgba(255,255,255,0.12)'/%3E%3C/svg%3E\")",
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

const VARIANT_STYLES: Record<
  IllustrationVariant,
  {
    iconRingClassName: string
    iconClassName: string
    titleLineClassName: string
    subtitleLineClassName: string
    footerPillClassName: string
    cardClassName: string
    sparklineStroke: string
  }
> = {
  orange: {
    iconRingClassName: 'bg-orange-500/10 border border-orange-500/10',
    iconClassName: 'text-orange-500/70',
    titleLineClassName: 'bg-white/10',
    subtitleLineClassName: 'bg-white/5',
    footerPillClassName: 'bg-orange-500/10',
    cardClassName: 'border border-white/5',
    sparklineStroke: 'rgba(249, 115, 22, 1)',
  },
  blue: {
    iconRingClassName: 'bg-blue-500/10 border border-blue-500/10',
    iconClassName: 'text-blue-500/70',
    titleLineClassName: 'bg-white/10',
    subtitleLineClassName: 'bg-white/5',
    footerPillClassName: 'bg-blue-500/10',
    cardClassName: 'border border-white/5',
    sparklineStroke: 'rgba(59, 130, 246, 1)',
  },
  primary: {
    iconRingClassName: 'bg-primary/10 border border-primary/20',
    iconClassName: 'text-primary',
    titleLineClassName: 'bg-primary/20',
    subtitleLineClassName: 'bg-primary/10',
    footerPillClassName: 'bg-primary/20',
    cardClassName:
      'border border-primary/20 shadow-[0_0_50px_-12px_hsl(var(--primary)/0.3)] backdrop-blur-md',
    sparklineStroke: 'hsl(var(--primary))',
  },
}

interface IllustrationWatchlistCardProps {
  absoluteClassName: string
  variant: IllustrationVariant
  icon: ComponentType<{ className?: string }>
  cardBgClassName?: string
  cardBorderClassName?: string
  titleWidthClassName: string
  subtitleWidthClassName: string
  tokenCount: number
  footerPillWidthClassName: string
  sparklineSeed: number
  sparklinePointCount?: number
  itemVariants: unknown
  shouldReduceMotion: boolean
  floatingAnimation: (delay: number) => unknown
  floatDelay: number
}

function IllustrationWatchlistCard({
  absoluteClassName,
  variant,
  icon: Icon,
  cardBgClassName = 'bg-zinc-900',
  cardBorderClassName,
  titleWidthClassName,
  subtitleWidthClassName,
  tokenCount,
  footerPillWidthClassName,
  sparklineSeed,
  sparklinePointCount = 18,
  itemVariants,
  shouldReduceMotion,
  floatingAnimation,
  floatDelay,
}: IllustrationWatchlistCardProps) {
  const styles = VARIANT_STYLES[variant]
  const sparklineData = useMemo(
    () => buildFakeSparkline(sparklineSeed, sparklinePointCount),
    [sparklineSeed, sparklinePointCount],
  )
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
          'relative rounded-[20px] shadow-2xl overflow-hidden',
          cardBgClassName,
          styles.cardClassName,
          cardBorderClassName,
        )}
      >
        <div className="absolute inset-0 opacity-40" style={DOT_PATTERN_STYLE} />
        <CardContent className="relative p-4 h-full flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <div className={cn('size-7 bg-zinc-700 rounded-full flex items-center justify-center border border-primary/10')}>
              <Icon className={cn('size-3.5 fill-primary/50', styles.iconClassName)} />
            </div>
            <div className="flex flex-col gap-1.5 opacity-50">
              <div className={cn('h-2.5 rounded-full', styles.titleLineClassName, titleWidthClassName)} />
              <div className={cn('h-1.5 rounded-full', styles.subtitleLineClassName, subtitleWidthClassName)} />
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
                    color={"#ffffff50"}
                    lineWidth={2}
                    window={sparklineWindowSecs}
                    showValue={false}
                    dot={true}
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
              {tokenKeys.map((key) => (
                <div
                  key={key}
                  className={cn(
                    'size-4 rounded-full',
                    variant === 'primary'
                      ? 'bg-zinc-700/30 backdrop-blur-sm border border-primary/5'
                      : '',
                  )}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

export function WatchlistEmptyIllustration() {
  const shouldReduceMotion: boolean = useReducedMotion() ?? false

  const gridKeys = useMemo(
    () => Array.from({ length: 9 }, (_, i) => `grid-${i}`),
    [],
  )

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

  return (
    <motion.div
      variants={containerVariants}
      initial="initial"
      animate="animate"
      className="relative w-80 h-80 mb-10 flex items-center justify-center"
    >
      {/* Background Grid Pattern - 3x3 */}
      <div className="absolute inset-0 grid grid-cols-3 gap-4 opacity-[0.02] scale-110 pointer-events-none">
        {gridKeys.map((key) => (
          <div key={key} className="aspect-square bg-foreground rounded-3xl border border-foreground" />
        ))}
      </div>

      <div className="absolute top-[70px] left-6 w-[200px] h-32 -rotate-6 z-10">
        <IllustrationWatchlistCard
          absoluteClassName="size-full"
          variant="primary"
          icon={IconTarget}
          cardBgClassName="bg-zinc-800 shadow-2xl shadow-black group-hover:scale-105 group-hover:rotate-[-2deg] transition-all duration-300"
          cardBorderClassName="border-primary/10"
          titleWidthClassName="w-16"
          subtitleWidthClassName="w-8"
          tokenCount={3}
          footerPillWidthClassName="w-10"
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
          variant="primary"
          icon={IconSparkles}
          cardBgClassName="bg-zinc-800 shadow-2xl shadow-black group-hover:scale-105 group-hover:rotate-2 transition-all duration-300"
          cardBorderClassName="border-primary/10 "
          titleWidthClassName="w-24"
          subtitleWidthClassName="w-12"
          tokenCount={5}
          footerPillWidthClassName="w-14"
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
          variant="primary"
          icon={IconRainbow}
          cardBgClassName="bg-zinc-800 shadow-2xl shadow-black group-hover:scale-105 group-hover:rotate-[-2deg] transition-all duration-300"
          cardBorderClassName="border-primary/10"
          titleWidthClassName="w-20"
          subtitleWidthClassName="w-10"
          tokenCount={4}
          footerPillWidthClassName="w-12"
          sparklineSeed={23}
          itemVariants={itemVariants}
          shouldReduceMotion={shouldReduceMotion}
          floatingAnimation={floatingAnimation}
          floatDelay={0.6}
        />
      </div>
    </motion.div>
  )
}

export function WatchlistGridEmptyState() {
  const [isShiftDown, setIsShiftDown] = useState(false)
  const [isNDown, setIsNDown] = useState(false)

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
      if (event.key.toLowerCase() === 'n') setIsNDown(true)
      if (event.shiftKey) setIsShiftDown(true)
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key === 'Shift') setIsShiftDown(false)
      if (event.key.toLowerCase() === 'n') setIsNDown(false)
      if (!event.shiftKey) setIsShiftDown(false)
    }

    function handleBlur() {
      setIsShiftDown(false)
      setIsNDown(false)
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

  return (
    <div className="group flex flex-col items-center justify-center py-20 px-4 text-center">
      <WatchlistEmptyIllustration />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="max-w-sm mt-[-77px]"
      >
        <h3 className="text-2xl font-bold tracking-tight mb-3 text-balance">Build your first watchlist</h3>
        <p className="text-muted-foreground mb-10 leading-relaxed text-pretty">
          Add tokens, track the groups performance <br />and spot trends at a glance.
        </p>

        <div className="inline-flex flex-col items-center gap-4 bg-zinc-900/50 px-6 py-4 rounded-xl border border-white/5 backdrop-blur-sm">
          <p className="text-sm font-medium flex items-center gap-3">
            Press <Kbd className={getKbdClassName(isShiftDown)}>Shift</Kbd> +{' '}
            <Kbd className={getKbdClassName(isNDown)}>N</Kbd> to create your first watchlist
          </p>
        </div>
      </motion.div>
    </div>
  )
}

