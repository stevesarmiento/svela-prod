'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@v1/ui/cn"
import { Skeleton } from "@v1/ui/skeleton"
import { Spinner } from "@v1/ui/spinner"
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@v1/ui/carousel"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  DURATION_UI_S,
  EASE_OUT_CUBIC,
  motionDuration,
} from "@/lib/motion-tokens"
import {
  dominantThemeLabel,
  filterEventsInWindow,
  topEventKinds,
} from "@/lib/overview-daily-brief"

const MotionDiv = motion.div

const SLIDE_MIN_H = "min-h-[120px]"
const SLIDE_INTERVAL_MS = 8000


type BriefWindow = "24h" | "7d"
type OverviewStatus = "missing" | "fresh" | "stale"

type BriefCardKind = "top_gainer" | "top_loser" | "events" | "regime" | "technicals" | "theme"
type BriefCardTone = "positive" | "negative" | "neutral"

interface BriefCard {
  kind: BriefCardKind
  title: string
  primary: string
  secondary: string | null
  body: string
  tone: BriefCardTone
}

type SnapshotMover = { symbol: string; changePct: number; impactUsd?: number | null }
type SnapshotMovers = {
  coinCount?: number
  missingMarketDataCount?: number
  gainers: SnapshotMover[]
  losers: SnapshotMover[]
}
type SnapshotEvent = {
  kind: string
  title: string
  occurredAtMs: number
  tone?: "positive" | "negative" | "neutral"
  coingeckoId?: string
}
type SnapshotEvents = { events: SnapshotEvent[] }

interface DailyBrief {
  summary: string
  headline: string
  bullets: string[]
  risks: string[]
  opportunities: string[]
  cards: BriefCard[]
  generatedAt: number
  model: string | null
}

interface DailyBriefCache {
  status: "missing" | "fresh" | "stale"
  stale: boolean
  expiresAt: number | null
  generatedAt: number | null
  brief: DailyBrief | null
}

const MISSING_BRIEF_CACHE: DailyBriefCache = {
  status: "missing",
  stale: true,
  expiresAt: null,
  generatedAt: null,
  brief: null,
}

function formatBriefTime(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function windowLabel(window: BriefWindow): string {
  return window === "7d" ? "the last week" : "the last day"
}

function BriefSkeleton() {
  return (
    <div className="space-y-3 px-2">
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-11/12" />
      <Skeleton className="h-5 w-9/12" />
    </div>
  )
}

export function OverviewDailyBriefCard(props: {
  status: OverviewStatus
  window: BriefWindow
  brief24h: DailyBriefCache
  brief7d: DailyBriefCache
  enableGeneration?: boolean
  movers24h?: SnapshotMovers | null
  movers7d?: SnapshotMovers | null
  events?: SnapshotEvents | null
  onGenerate: (args: { window: BriefWindow; force?: boolean }) => Promise<DailyBrief>
}) {
  const cache =
    (props.window === "7d" ? props.brief7d : props.brief24h) ??
    MISSING_BRIEF_CACHE
  const generateBrief = props.onGenerate

  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedBrief, setGeneratedBrief] = useState<DailyBrief | null>(null)
  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null)
  const [selectedSlide, setSelectedSlide] = useState(0)
  const requestedKeyRef = useRef<string>("")

  const key = `watchlist:${props.window}`

  useEffect(() => {
    if (props.status === "missing") return
    if (cache.status === "fresh" && cache.brief) return
    if (!props.enableGeneration) return

    const shouldGenerate = cache.status === "missing" || cache.status === "stale"
    if (!shouldGenerate) return

    if (requestedKeyRef.current === key) return
    requestedKeyRef.current = key

    setIsGenerating(true)
    generateBrief({ window: props.window })
      .then((next) => setGeneratedBrief(next))
      .catch(() => {})
      .finally(() => setIsGenerating(false))
  }, [cache, generateBrief, key, props.enableGeneration, props.status, props.window])

  useEffect(() => {
    if (!generatedBrief) return
    const cached = cache?.brief
    if (!cached?.generatedAt) return
    if (cached.generatedAt >= generatedBrief.generatedAt) setGeneratedBrief(null)
  }, [cache?.brief, generatedBrief])

  const brief = useMemo(() => generatedBrief ?? cache?.brief ?? null, [cache?.brief, generatedBrief])

  useEffect(() => {
    if (!carouselApi) return
    const onSelect = () => setSelectedSlide(carouselApi.selectedScrollSnap())
    onSelect()
    carouselApi.on("select", onSelect)
    carouselApi.on("reInit", onSelect)
    return () => {
      carouselApi.off("select", onSelect)
    }
  }, [carouselApi])

  useEffect(() => {
    if (!carouselApi) return
    carouselApi.scrollTo(0)
    setSelectedSlide(0)
  }, [carouselApi, props.window])

  const summary = useMemo(() => {
    const movers = props.window === "7d" ? props.movers7d : props.movers24h
    const now = Date.now()
    const windowEvents = filterEventsInWindow(props.events?.events ?? [], props.window, now)
    const topKinds = topEventKinds(windowEvents, 2)
    const theme = dominantThemeLabel(topKinds)

    const eventToneCounts = windowEvents.reduce(
      (acc, e) => {
        if (e.tone === "positive") acc.positive++
        else if (e.tone === "negative") acc.negative++
        else acc.neutral++
        return acc
      },
      { positive: 0, negative: 0, neutral: 0 },
    )

    const mood = (() => {
      if (windowEvents.length === 0) return "quiet"
      if (eventToneCounts.positive > eventToneCounts.negative + 2) return "risk_on"
      if (eventToneCounts.negative > eventToneCounts.positive + 2) return "risk_off"
      return "mixed"
    })()

    const dispersion = (() => {
      const sample = [
        ...(movers?.gainers ?? []).slice(0, 3),
        ...(movers?.losers ?? []).slice(0, 3),
      ]
      const maxMove = sample.reduce((m, row) => Math.max(m, Math.abs(row?.changePct ?? 0)), 0)
      if (!Number.isFinite(maxMove) || maxMove <= 0) return "muted"
      if (maxMove >= 15) return "high"
      if (maxMove >= 7.5) return "medium"
      return "low"
    })()

    const dataQuality = (() => {
      const coinCount = movers?.coinCount ?? 0
      const missing = movers?.missingMarketDataCount ?? 0
      if (coinCount <= 0) return "unknown"
      const coverage = (coinCount - missing) / coinCount
      if (!Number.isFinite(coverage)) return "unknown"
      if (coverage >= 0.9) return "solid"
      if (coverage >= 0.7) return "ok"
      return "patchy"
    })()

    const fallback = (() => {
      const sentences: string[] = []
      if (mood === "quiet") sentences.push("The tape feels quieter than usual, with fewer signals competing for attention.")
      if (mood === "risk_on") sentences.push("The mood leans risk-on, even if participation feels uneven.")
      if (mood === "risk_off") sentences.push("The mood leans risk-off, with downside-style signals showing up more often.")
      if (mood === "mixed") sentences.push("The mood reads mixed, with strength and weakness side by side.")

      if (dispersion === "high") sentences.push("Dispersion is high, so the window can feel louder than the average name.")
      if (dispersion === "medium") sentences.push("Dispersion is noticeable, which can create quick leadership rotations.")
      if (dispersion === "muted") sentences.push("Dispersion is muted, more of a grind than a sprint.")

      if (windowEvents.length > 0) sentences.push(`The event tape clusters around ${theme.toLowerCase()}.`)
      else sentences.push("The event tape is light, mostly a price-action read.")

      return sentences.slice(0, 3).join(" ")
    })()

    if (!brief) return fallback
    const fromSummary = (brief.summary ?? "").trim()
    if (!fromSummary || fromSummary === brief.headline) return fallback
    const sentenceCount = fromSummary.split(/[.!?]+/).filter((s) => s.trim()).length
    if (sentenceCount > 4) return fallback
    return fromSummary
  }, [brief, props.events?.events, props.movers24h, props.movers7d, props.window])

  const fallbackCards = useMemo((): BriefCard[] => {
    const movers = props.window === "7d" ? props.movers7d : props.movers24h
    const now = Date.now()
    const windowEvents = filterEventsInWindow(props.events?.events ?? [], props.window, now)

    const topKinds = topEventKinds(windowEvents, 2)
    const theme = dominantThemeLabel(topKinds)

    const eventToneCounts = windowEvents.reduce(
      (acc, e) => {
        if (e.tone === "positive") acc.positive++
        else if (e.tone === "negative") acc.negative++
        else acc.neutral++
        return acc
      },
      { positive: 0, negative: 0, neutral: 0 },
    )

    const mood = (() => {
      if (windowEvents.length === 0) return "quiet"
      if (eventToneCounts.positive > eventToneCounts.negative + 2) return "risk_on"
      if (eventToneCounts.negative > eventToneCounts.positive + 2) return "risk_off"
      return "mixed"
    })()

    const dispersion = (() => {
      const sample = [
        ...(movers?.gainers ?? []).slice(0, 3),
        ...(movers?.losers ?? []).slice(0, 3),
      ]
      const maxMove = sample.reduce((m, row) => Math.max(m, Math.abs(row?.changePct ?? 0)), 0)
      if (!Number.isFinite(maxMove) || maxMove <= 0) return "muted"
      if (maxMove >= 15) return "high"
      if (maxMove >= 7.5) return "medium"
      return "low"
    })()

    const coverageLine = (() => {
      const coinCount = movers?.coinCount ?? 0
      const missing = movers?.missingMarketDataCount ?? 0
      if (coinCount <= 0) return "Coverage: unknown"
      const covered = Math.max(0, coinCount - missing)
      return `Coverage: ${covered}/${coinCount}`
    })()

    const uniqueCoins = new Set(windowEvents.map((e) => e.coingeckoId ?? e.title)).size
    const concentration = (() => {
      if (windowEvents.length === 0) return "none"
      if (uniqueCoins <= 0) return "unknown"
      const ratio = windowEvents.length / uniqueCoins
      if (!Number.isFinite(ratio)) return "unknown"
      if (ratio >= 3) return "narrow"
      if (ratio <= 1.4) return "broad"
      return "mixed"
    })()

    const regimeTone: BriefCardTone =
      mood === "risk_on" ? "positive" : mood === "risk_off" ? "negative" : "neutral"

    const themeTone: BriefCardTone =
      eventToneCounts.positive > eventToneCounts.negative + 1
        ? "positive"
        : eventToneCounts.negative > eventToneCounts.positive + 1
          ? "negative"
          : "neutral"

    return [
      {
        kind: "regime",
        title: "Regime",
        primary: `Regime: ${mood === "risk_on" ? "Risk-on" : mood === "risk_off" ? "Risk-off" : mood === "quiet" ? "Quiet" : "Mixed"}`,
        secondary: `${coverageLine} • Dispersion: ${titleCase(dispersion)}`,
        body:
          mood === "quiet"
            ? "It’s a lower-signal window, so small moves can feel more meaningful than they are."
            : mood === "risk_on"
              ? "Upside-style signals are showing up more often than downside ones, even if breadth is uneven."
              : mood === "risk_off"
                ? "Downside-style signals are showing up more often than upside ones, so follow-through may feel heavy."
                : "Signals are mixed, so it’s more about selectivity than a single clean direction.",
        tone: regimeTone,
      },
      {
        kind: "technicals",
        title: "Technicals",
        primary: "Posture: Unclear",
        secondary: "Regenerate to compute RSI/trend/vol posture.",
        body: "Once price history is available, this slide summarizes whether the list looks stretched, washed-out, or balanced.",
        tone: "neutral",
      },
      {
        kind: "theme",
        title: "Theme",
        primary: `Theme: ${theme}`,
        secondary:
          windowEvents.length > 0
            ? `Concentration: ${concentration} • ${windowEvents.length} events${topKinds.length > 0 ? ` • ${topKinds.join(" • ")}` : ""}`
            : "No notable watchlist events in this window.",
        body:
          windowEvents.length > 0
            ? "The event tape is repeating a couple of themes, which often explains why the feed feels louder than it is."
            : "No single theme is dominating the tape for this window.",
        tone: themeTone,
      },
    ]
  }, [props.events?.events, props.movers24h, props.movers7d, props.window])

  const cards = useMemo(() => {
    const current = brief?.cards ?? []
    const hasNewKinds = current.some((c) => c.kind === "regime" || c.kind === "technicals" || c.kind === "theme")
    if (hasNewKinds) return current
    return fallbackCards
  }, [brief?.cards, fallbackCards])

  const orderedCards = useMemo(() => {
    const byKind = new Map(cards.map((c) => [c.kind, c]))
    return (["regime", "technicals", "theme"] as const)
      .map((k) => byKind.get(k))
      .filter((x) => Boolean(x)) as BriefCard[]
  }, [cards])

  // Autoplay timer -- the active indicator fills up, then advances to the next slide
  const [isPaused, setIsPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const slideKeys = useMemo<Array<string>>(() => ["summary", ...orderedCards.map((c) => c.kind)], [orderedCards])
  const slideCount = slideKeys.length
  const progressRef = useRef(0)
  const lastTickRef = useRef(Date.now())

  const resetProgress = useCallback(() => {
    progressRef.current = 0
    lastTickRef.current = Date.now()
    setProgress(0)
  }, [])

  useEffect(() => {
    resetProgress()
  }, [selectedSlide, resetProgress])

  useEffect(() => {
    if (!carouselApi || isPaused || slideCount <= 1) return

    const tick = () => {
      const now = Date.now()
      const delta = now - lastTickRef.current
      lastTickRef.current = now
      progressRef.current = Math.min(progressRef.current + delta, SLIDE_INTERVAL_MS)
      setProgress(progressRef.current)

      if (progressRef.current >= SLIDE_INTERVAL_MS) {
        const next = (selectedSlide + 1) % slideCount
        carouselApi.scrollTo(next)
      }
    }

    const id = setInterval(tick, 50)
    return () => clearInterval(id)
  }, [carouselApi, isPaused, selectedSlide, slideCount])

  const handleDotClick = useCallback(
    (idx: number) => {
      carouselApi?.scrollTo(idx)
      resetProgress()
    },
    [carouselApi, resetProgress],
  )

  const shouldReduceMotion = useReducedMotion()
  const showSkeleton = props.status === "missing"
  if (showSkeleton) return <BriefSkeleton />

  const dur = motionDuration(shouldReduceMotion, DURATION_UI_S)

  return (
    <div className="space-y-3">
      {brief ? (
        <div
          className="space-y-3"
          onPointerDown={() => setIsPaused(true)}
          onPointerUp={() => setIsPaused(false)}
          onPointerLeave={() => setIsPaused(false)}
        >
          <Carousel
            setApi={(api) => setCarouselApi(api)}
            opts={{ loop: false, align: "start" }}
            className="w-full"
          >
            <CarouselContent>
              <CarouselItem>
                <div className={cn(SLIDE_MIN_H, "flex flex-col justify-center px-2 py-4")}>
                  <AnimatePresence mode="wait">
                    <MotionDiv
                      key={`summary-${selectedSlide}`}
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 0 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={shouldReduceMotion ? undefined : { opacity: 0, y: 0 }}
                      transition={{ duration: dur, ease: EASE_OUT_CUBIC }}
                    >
                      <p className="text-xl leading-relaxed font-medium text-zinc-900 dark:text-zinc-100 text-pretty">
                        {summary}
                      </p>
                    </MotionDiv>
                  </AnimatePresence>
                </div>
              </CarouselItem>

              {orderedCards.map((card) => (
                <CarouselItem key={card.kind}>
                  <div className={cn(SLIDE_MIN_H, "flex flex-col justify-center px-2 py-4")}>
                    <AnimatePresence mode="wait">
                      <MotionDiv
                        key={`card-${card.kind}-${selectedSlide}`}
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 0 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={shouldReduceMotion ? undefined : { opacity: 0, y: 0 }}
                        transition={{ duration: dur, ease: EASE_OUT_CUBIC }}
                        className="space-y-2"
                      >
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                          {card.title}
                        </span>
                        <p className="text-lg font-medium text-zinc-900 dark:text-white">
                          {card.primary}
                        </p>
                        <p className="text-base leading-relaxed text-zinc-700 dark:text-zinc-200 text-pretty">
                          {card.body}
                        </p>
                        {card.secondary ? (
                          <p className="text-xs text-muted-foreground/70">
                            {card.secondary}
                          </p>
                        ) : null}
                      </MotionDiv>
                    </AnimatePresence>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>

          <div className="flex items-center justify-start gap-1.5 px-2">
            {slideKeys.map((slideKey, idx) => {
              const isActive = idx === selectedSlide
              const fillPct = isActive
                ? Math.min((progress / SLIDE_INTERVAL_MS) * 100, 100)
                : 0

              return (
                <button
                  key={slideKey}
                  type="button"
                  aria-label={`Go to slide ${idx + 1}`}
                  className={cn(
                    "relative rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden",
                    isActive ? "h-1.5 flex-1 max-w-8" : "h-1.5 w-3",
                  )}
                  onClick={() => handleDotClick(idx)}
                >
                  {isActive ? (
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-zinc-900 dark:bg-white"
                      style={{ width: `${fillPct}%` }}
                    />
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div
          className={cn("text-xs text-muted-foreground text-pretty px-2", isGenerating && "opacity-70")}
        >
          {cache?.status === "missing"
            ? "Generating your first brief…"
            : cache?.status === "stale"
              ? "Refreshing brief…"
              : "Brief unavailable."}
        </div>
      )}
    </div>
  )
}
