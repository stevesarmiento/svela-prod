'use client'

import { type ComponentType } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { LayoutGrid, Plus, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@v1/ui/card'
import { cn } from '@v1/ui/cn'
import { Kbd } from '@v1/ui/kbd'
import { IconRainbow, IconSparkles, IconTarget } from 'symbols-react'

type IllustrationVariant = 'orange' | 'blue' | 'primary'

interface SparklineSpec {
  viewBox: string
  d: string
  strokeWidth: number
}

const DOT_PATTERN_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='5' cy='5' r='1' fill='rgba(255,255,255,0.12)'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'repeat' as const,
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
  sparkline: SparklineSpec
  itemVariants: unknown
  sparklineVariants: unknown
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
  sparkline,
  itemVariants,
  sparklineVariants,
  shouldReduceMotion,
  floatingAnimation,
  floatDelay,
}: IllustrationWatchlistCardProps) {
  const styles = VARIANT_STYLES[variant]

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
            <svg
              className="w-full h-10 overflow-visible"
              viewBox={sparkline.viewBox}
              preserveAspectRatio="none"
            >
              <motion.path
                d={sparkline.d}
                fill="none"
                stroke={styles.sparklineStroke}
                strokeWidth={sparkline.strokeWidth}
                strokeLinecap="round"
                initial="initial"
                animate="animate"
                variants={sparklineVariants as never}
              />
            </svg>
          </div>

          <div className="flex items-center justify-between mt-auto">
            <div className="flex -space-x-1.5">
              {[...Array(tokenCount)].map((_, i) => (
                <div
                  key={i}
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

export function WatchlistGridEmptyState() {
  const shouldReduceMotion: boolean = useReducedMotion() ?? false

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

  const floatingAnimation = (delay: number = 0) => ({
    y: [0, -12, 0],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
      delay,
    },
  })

  // Draw once on mount (no looping).
  const sparklineVariants = {
    initial: { pathLength: 0, opacity: 0 },
    animate: {
      pathLength: 1,
      opacity: 0.4,
      transition: {
        duration: 1.5,
        ease: 'easeOut',
        delay: 0.8,
      },
    },
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <motion.div
        variants={containerVariants}
        initial="initial"
        animate="animate"
        className="relative w-80 h-80 mb-10 flex items-center justify-center"
      >
        {/* Background Grid Pattern - 3x3 */}
        <div className="absolute inset-0 grid grid-cols-3 gap-4 opacity-[0.02] scale-110 pointer-events-none">
          {[...Array(9)].map((_, i) => (
            <div
              key={i}
              className="aspect-square bg-foreground rounded-3xl border border-foreground"
            />
          ))}
        </div>

        <div className="absolute top-[70px] left-6 w-[200px] h-32 -rotate-6 z-10">
          <IllustrationWatchlistCard
            absoluteClassName="size-full"
            variant="primary"
            icon={IconTarget}
            cardBgClassName="bg-zinc-800 shadow-2xl shadow-black"
            cardBorderClassName="border-primary/10"
            titleWidthClassName="w-16"
            subtitleWidthClassName="w-8"
            tokenCount={3}
            footerPillWidthClassName="w-10"
            sparkline={{
              viewBox: '0 0 120 30',
              d: 'M 0 20 Q 15 5 30 15 T 60 10 T 90 25 T 120 15',
              strokeWidth: 1.2,
            }}
            itemVariants={itemVariants}
            sparklineVariants={sparklineVariants}
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
            cardBgClassName="bg-zinc-800 shadow-2xl shadow-black"
            cardBorderClassName="border-primary/10 "
            titleWidthClassName="w-24"
            subtitleWidthClassName="w-12"
            tokenCount={5}
            footerPillWidthClassName="w-14"
            sparkline={{
              viewBox: '0 0 140 40',
              d: 'M 0 30 Q 20 10 40 25 T 70 15 T 100 35 T 140 20',
              strokeWidth: 1.2,
            }}
            itemVariants={itemVariants}
            sparklineVariants={sparklineVariants}
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
            cardBgClassName="bg-zinc-800 shadow-2xl shadow-black"
            cardBorderClassName="border-primary/10"
            titleWidthClassName="w-20"
            subtitleWidthClassName="w-10"
            tokenCount={4}
            footerPillWidthClassName="w-12"
            sparkline={{
              viewBox: '0 0 140 30',
              d: 'M 0 10 Q 20 25 40 10 T 80 20 T 120 5 T 140 15',
              strokeWidth: 1.2,
            }}
            itemVariants={itemVariants}
            sparklineVariants={sparklineVariants}
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
        <h3 className="text-2xl font-bold tracking-tight mb-3 text-balance">Build your first watchlist</h3>
        <p className="text-muted-foreground mb-10 leading-relaxed text-pretty">
          Add tokens, track the groups performance <br />and spot trends at a glance.
        </p>

        <div className="inline-flex flex-col items-center gap-4 bg-zinc-900/50 px-6 py-4 rounded-xl border border-white/5 backdrop-blur-sm">
          <p className="text-sm font-medium flex items-center gap-3">
            Press <Kbd className="bg-white/10 text-white border-white/10 text-[10px]">Shift</Kbd> +{' '}
            <Kbd className="bg-white/10 text-white border-white/10 text-[10px]">N</Kbd> to create
            your first watchlist
          </p>
        </div>
      </motion.div>
    </div>
  )
}

