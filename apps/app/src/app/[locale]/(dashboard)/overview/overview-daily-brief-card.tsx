'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { Badge } from "@v1/ui/badge"
import { cn } from "@v1/ui/cn"
import { Skeleton } from "@v1/ui/skeleton"
import { Spinner } from "@v1/ui/spinner"
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@v1/ui/carousel"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { IconTriangleFill } from "symbols-react"
import { TokenLogo } from "@/components/token-logo"
import { formatUsdPrice } from "@/lib/format-usd"
import { getTokenLogoURL } from "@/lib/logo-overrides"
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

// Fixed slide height so the carousel doesn't jump between slides of
// different content lengths. Cards fill the slide and scroll internally in
// the rare case content exceeds it.
const SLIDE_MIN_H = "h-[340px] sm:h-[280px]"
const SLIDE_INTERVAL_MS = 14000


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
  details?: unknown
}

type BreadthDetail = {
  advancers: number
  decliners: number
  flat: number
  medianChangePct: number
  bigMovers: number
}

type TechnicalsGroup = { label: string; symbols: string[] }

type HeadlineDetail = {
  symbol: string
  title: string
  tone?: string
  occurredAtMs?: number
}

function asBreadthDetail(details: unknown): BreadthDetail | null {
  if (!details || typeof details !== "object") return null
  const b = (details as { breadth?: unknown }).breadth
  if (!b || typeof b !== "object") return null
  const breadth = b as Partial<BreadthDetail>
  if (
    typeof breadth.advancers !== "number" ||
    typeof breadth.decliners !== "number" ||
    typeof breadth.flat !== "number"
  ) {
    return null
  }
  return {
    advancers: breadth.advancers,
    decliners: breadth.decliners,
    flat: breadth.flat,
    medianChangePct: typeof breadth.medianChangePct === "number" ? breadth.medianChangePct : 0,
    bigMovers: typeof breadth.bigMovers === "number" ? breadth.bigMovers : 0,
  }
}

function asTechnicalsGroups(details: unknown): TechnicalsGroup[] {
  if (!details || typeof details !== "object") return []
  const groups = (details as { groups?: unknown }).groups
  if (!Array.isArray(groups)) return []
  return groups.filter(
    (g): g is TechnicalsGroup =>
      Boolean(g) &&
      typeof g === "object" &&
      typeof (g as TechnicalsGroup).label === "string" &&
      Array.isArray((g as TechnicalsGroup).symbols) &&
      (g as TechnicalsGroup).symbols.length > 0,
  )
}

function asHeadlineDetails(details: unknown): HeadlineDetail[] {
  if (!details || typeof details !== "object") return []
  const headlines = (details as { headlines?: unknown }).headlines
  if (!Array.isArray(headlines)) return []
  return headlines.filter(
    (h): h is HeadlineDetail =>
      Boolean(h) &&
      typeof h === "object" &&
      typeof (h as HeadlineDetail).symbol === "string" &&
      typeof (h as HeadlineDetail).title === "string",
  )
}

type SnapshotMover = {
  symbol: string
  changePct: number
  impactUsd?: number | null
  name?: string
  coingeckoId?: string
  logoUrl?: string | null
}
type SnapshotMovers = {
  coinCount?: number
  missingMarketDataCount?: number
  gainers: SnapshotMover[]
  losers: SnapshotMover[]
  breadth?: BreadthDetail | null
}
type SnapshotEvent = {
  kind: string
  title: string
  occurredAtMs: number
  tone?: "positive" | "negative" | "neutral"
  coingeckoId?: string
  symbol?: string
  logoUrl?: string | null
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

/** Same construction as the feed's per-event percent badge. */
function PercentChangeBadge(props: { pct: number }) {
  const pct = Number.isFinite(props.pct) ? props.pct : 0
  const isPositive = pct > 0
  const isNegative = pct < 0
  const isNeutral = !isPositive && !isNegative
  return (
    <Badge
      variant={isPositive ? "success" : isNegative ? "destructive" : "outline"}
      className={cn(
        "inline-flex align-middle h-6 px-2 font-berkeley-mono text-[12px] tabular-nums gap-1",
        isNeutral && "border-zinc-200/60 text-muted-foreground dark:border-white/10",
      )}
    >
      <IconTriangleFill
        aria-hidden="true"
        className={cn("size-[6px] shrink-0 fill-current", isNegative && "rotate-180")}
      />
      {Math.abs(pct).toFixed(2)}%
    </Badge>
  )
}

type TokenRef = {
  symbol: string
  coingeckoId: string
  name?: string
  logoUrl?: string | null
}

/** Same construction as the feed's token top-label pill. */
function TokenPill(props: { token: TokenRef }) {
  const { token } = props
  const logo = getTokenLogoURL(token.symbol, token.logoUrl ?? undefined)
  return (
    <Link
      href={`/watchlists/${token.coingeckoId}`}
      aria-label={`${token.name ?? token.symbol} chart`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 align-middle",
        "h-6 rounded-full pl-1.5 pr-2.5",
        "bg-zinc-200/80 dark:bg-white/10",
        "hover:bg-zinc-300/80 dark:hover:bg-white/[0.15]",
        "transition-colors active:scale-[0.98]",
      )}
    >
      <TokenLogo
        src={logo}
        alt=""
        sizePx={14}
        className="ring ring-black/80"
        fallbackText={token.symbol}
        unoptimizedRemote
      />
      <span className="text-[14px] font-semibold text-zinc-950 dark:text-white tabular-nums">
        {token.symbol.toUpperCase()}
      </span>
    </Link>
  )
}

const SLIDE_CARD_CLASS =
  "h-full overflow-y-auto rounded-2xl bg-zinc-100/80 dark:bg-white/[0.06] p-5 space-y-2"

function toneBadgeVariant(tone: BriefCardTone): "success" | "destructive" | "outline" {
  return tone === "positive" ? "success" : tone === "negative" ? "destructive" : "outline"
}

/** "Regime: Mixed" → "Mixed" for the top-label badge. */
function primaryValueOf(primary: string): string {
  const idx = primary.indexOf(": ")
  return idx >= 0 ? primary.slice(idx + 2) : primary
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const PCT = "[+\\-−]?\\d+(?:\\.\\d+)?"

/**
 * Renders the plain-text summary with known token symbols as pills and price
 * moves as badges — mirroring the feed's top labels. Handles "SYM (+12.34%)"
 * as pill+badge, "(+12.34%)" / signed "+12.34%" as a badge, and bare known
 * symbols as pills. Everything else stays text.
 */
function renderRichSummary(text: string, tokens: Map<string, TokenRef>): ReactNode[] {
  // Aliases: ticker symbols (uppercase) plus full coin names, all resolving
  // to the same token — so "CashCat", "CASHCAT", and "CashCat (CASHCAT)" each
  // render as one pill.
  const byAlias = new Map<string, TokenRef>()
  for (const token of tokens.values()) {
    byAlias.set(token.symbol.toUpperCase(), token)
    if (token.name && token.name.toUpperCase() !== token.symbol.toUpperCase()) {
      byAlias.set(token.name.toUpperCase(), token)
    }
  }
  const aliases = Array.from(byAlias.keys())
  const aliasAlt =
    aliases.length > 0
      ? Array.from(
          new Set([
            ...aliases,
            ...Array.from(tokens.values())
              .map((t) => t.name)
              .filter((n): n is string => Boolean(n)),
          ]),
        )
          .sort((a, b) => b.length - a.length)
          .map(escapeRegExp)
          .join("|")
      : null

  const parts: string[] = []
  if (aliasAlt) {
    // "Name (SYMBOL)" → single pill (dedupe the doubled reference).
    parts.push(`(?<dupA>\\b(?:${aliasAlt})\\b)\\s*\\(\\s*(?<dupB>${aliasAlt})\\s*\\)`)
    // "SYM (+12.34%)" → pill + badge.
    parts.push(`(?<comboSym>\\b(?:${aliasAlt})\\b)\\s*\\((?<comboPct>${PCT})%\\)`)
    // "(SYMBOL)" → pill, parens dropped.
    parts.push(`\\(\\s*(?<parenSym>${aliasAlt})\\s*\\)`)
  }
  parts.push(`\\((?<parenPct>${PCT})%\\)`)
  parts.push("(?<barePct>[+\\-−]\\d+(?:\\.\\d+)?)%")
  if (aliasAlt) parts.push(`(?<sym>\\b(?:${aliasAlt})\\b)`)
  const pattern = new RegExp(parts.join("|"), "g")

  const parsePct = (raw: string): number => Number.parseFloat(raw.replace("−", "-"))
  const lookup = (raw: string): TokenRef | undefined => byAlias.get(raw.toUpperCase())

  const nodes: ReactNode[] = []
  let cursor = 0
  let key = 0
  const pushToken = (raw: string) => {
    const token = lookup(raw)
    if (token) nodes.push(<TokenPill key={`pill-${key++}`} token={token} />)
    else nodes.push(raw)
  }

  for (const match of text.matchAll(pattern)) {
    const idx = match.index ?? 0
    if (idx > cursor) nodes.push(text.slice(cursor, idx))

    const g = match.groups ?? {}
    if (g.dupA && g.dupB != null) {
      const a = lookup(g.dupA)
      const b = lookup(g.dupB)
      if (a && b && a.coingeckoId === b.coingeckoId) {
        // Same token referenced twice ("CashCat (CASHCAT)") → one pill.
        pushToken(g.dupA)
      } else {
        pushToken(g.dupA)
        nodes.push(" (")
        pushToken(g.dupB)
        nodes.push(")")
      }
    } else if (g.comboSym && g.comboPct != null) {
      pushToken(g.comboSym)
      nodes.push(" ")
      nodes.push(<PercentChangeBadge key={`pct-${key++}`} pct={parsePct(g.comboPct)} />)
    } else if (g.parenSym) {
      pushToken(g.parenSym)
    } else if (g.parenPct != null) {
      nodes.push(<PercentChangeBadge key={`pct-${key++}`} pct={parsePct(g.parenPct)} />)
    } else if (g.barePct != null) {
      nodes.push(<PercentChangeBadge key={`pct-${key++}`} pct={parsePct(g.barePct)} />)
    } else if (g.sym) {
      pushToken(g.sym)
    }

    cursor = idx + match[0].length
  }
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

function signedPctLabel(value: number): string {
  if (!Number.isFinite(value)) return "—"
  const sign = value > 0 ? "+" : value < 0 ? "-" : ""
  return `${sign}${Math.abs(value).toFixed(2)}%`
}

function StatTile(props: { value: string; label: string; valueClass?: string }) {
  return (
    <div className="min-w-0">
      <div
        className={cn(
          "text-sm font-semibold tabular-nums font-berkeley-mono text-zinc-900 dark:text-white truncate",
          props.valueClass,
        )}
      >
        {props.value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
        {props.label}
      </div>
    </div>
  )
}

/** Advancers / flat / decliners meter + stat row for the regime card. */
function BreadthBlock(props: { breadth: BreadthDetail }) {
  const b = props.breadth
  const total = b.advancers + b.decliners + b.flat
  if (total <= 0) return null
  const width = (n: number) => ({ width: `${(n / total) * 100}%` })
  return (
    <div className="space-y-3 pt-1">
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-zinc-200/60 dark:bg-white/10"
        role="img"
        aria-label={`${b.advancers} advancing, ${b.flat} flat, ${b.decliners} declining`}
      >
        <div className="bg-emerald-500/80" style={width(b.advancers)} />
        <div className="bg-zinc-400/40 dark:bg-white/20" style={width(b.flat)} />
        <div className="bg-rose-500/80" style={width(b.decliners)} />
      </div>
      <div className="grid grid-cols-4 gap-3">
        <StatTile value={String(b.advancers)} label="Up" valueClass="text-emerald-500" />
        <StatTile value={String(b.decliners)} label="Down" valueClass="text-rose-500" />
        <StatTile
          value={signedPctLabel(b.medianChangePct)}
          label="Median"
          valueClass={
            b.medianChangePct > 0
              ? "text-emerald-500"
              : b.medianChangePct < 0
                ? "text-rose-500"
                : undefined
          }
        />
        <StatTile value={String(b.bigMovers)} label=">5% moves" />
      </div>
    </div>
  )
}

/** Token pill when the coin is known, otherwise a neutral symbol chip. */
function SymbolChip(props: { symbol: string; tokens: Map<string, TokenRef> }) {
  const token = props.tokens.get(props.symbol.toUpperCase())
  if (token) return <TokenPill token={token} />
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center align-middle",
        "h-6 rounded-full px-2.5",
        "bg-zinc-200/80 dark:bg-white/10",
        "text-[13px] font-semibold text-zinc-950 dark:text-white tabular-nums",
      )}
    >
      {props.symbol.toUpperCase()}
    </span>
  )
}

/** Grouped per-coin states (Stretched / Washed-out / Coiled / …). */
function TechnicalsGroupsBlock(props: {
  groups: TechnicalsGroup[]
  tokens: Map<string, TokenRef>
}) {
  if (props.groups.length === 0) {
    return (
      <p className="pt-1 text-[13px] text-muted-foreground">
        No stretched, washed-out, or coiled names in today’s sample.
      </p>
    )
  }
  return (
    <div className="space-y-2 pt-1">
      {props.groups.map((group) => (
        <div key={group.label} className="flex flex-wrap items-center gap-1.5">
          <span className="w-[5.5rem] shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground/70">
            {group.label}
          </span>
          {group.symbols.slice(0, 5).map((symbol) => (
            <SymbolChip key={symbol} symbol={symbol} tokens={props.tokens} />
          ))}
          {group.symbols.length > 5 ? (
            <span className="text-[11px] text-muted-foreground">
              +{group.symbols.length - 5} more
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

/** Mini headline list for the theme card. */
function ThemeHeadlinesBlock(props: {
  headlines: HeadlineDetail[]
  tokens: Map<string, TokenRef>
}) {
  if (props.headlines.length === 0) return null
  return (
    <div className="space-y-2 pt-1">
      {props.headlines.map((h) => (
        <div key={`${h.symbol}-${h.title}`} className="flex items-center gap-2 min-w-0">
          <SymbolChip symbol={h.symbol} tokens={props.tokens} />
          <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-600 dark:text-zinc-300">
            {h.title}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Restored styling from the old standalone movers feed list. */
function MoversList(props: { title: string; rows: SnapshotMover[] }) {
  return (
    <div className="space-y-2 min-w-0">
      <div className="text-xs font-medium text-zinc-600 dark:text-white/60">
        {props.title}
      </div>
      {props.rows.length === 0 ? (
        <div className="text-xs text-muted-foreground text-pretty">No data yet.</div>
      ) : (
        <ul className="space-y-2">
          {props.rows.map((row) => {
            const logo = getTokenLogoURL(row.symbol, row.logoUrl ?? undefined)
            const impactUsd = row.impactUsd ?? null
            const inner = (
              <>
                <div className="flex items-start gap-2 min-w-0">
                  <TokenLogo
                    src={logo}
                    alt={row.name ?? row.symbol}
                    sizePx={22}
                    fallbackText={row.symbol}
                    unoptimizedRemote
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-zinc-950 dark:text-white truncate">
                      {row.symbol.toUpperCase()}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {row.name ?? row.symbol}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <PercentChangeBadge pct={row.changePct} />
                  {impactUsd !== null ? (
                    <div
                      className={cn(
                        "text-[11px] font-berkeley-mono tabular-nums",
                        impactUsd > 0 && "text-emerald-400",
                        impactUsd < 0 && "text-rose-400",
                        impactUsd === 0 && "text-muted-foreground",
                      )}
                    >
                      {impactUsd > 0 ? "+" : impactUsd < 0 ? "-" : ""}
                      {formatUsdPrice(Math.abs(impactUsd))}
                    </div>
                  ) : null}
                </div>
              </>
            )
            const rowClass = cn(
              "flex items-center justify-between gap-3 min-w-0 active:scale-[0.98]",
              "-mx-2 rounded-xl p-2",
              "transition-colors duration-150",
              "hover:bg-zinc-950/5 dark:hover:bg-white/5",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            )
            return (
              <li key={row.coingeckoId ?? row.symbol} className="min-w-0">
                {row.coingeckoId ? (
                  <Link href={`/watchlists/${row.coingeckoId}`} className={rowClass}>
                    {inner}
                  </Link>
                ) : (
                  <div className={rowClass}>{inner}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
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
  brief24h: DailyBriefCache
  enableGeneration?: boolean
  movers24h?: SnapshotMovers | null
  events?: SnapshotEvents | null
  onGenerate: (args: { force?: boolean }) => Promise<DailyBrief>
}) {
  const cache = props.brief24h ?? MISSING_BRIEF_CACHE
  const generateBrief = props.onGenerate

  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedBrief, setGeneratedBrief] = useState<DailyBrief | null>(null)
  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null)
  const [selectedSlide, setSelectedSlide] = useState(0)
  const hasRequestedRef = useRef(false)

  useEffect(() => {
    if (props.status === "missing") return
    if (cache.status === "fresh" && cache.brief) return
    if (!props.enableGeneration) return

    const shouldGenerate = cache.status === "missing" || cache.status === "stale"
    if (!shouldGenerate) return

    if (hasRequestedRef.current) return
    hasRequestedRef.current = true

    setIsGenerating(true)
    generateBrief({})
      .then((next) => setGeneratedBrief(next))
      .catch(() => {
        // Allow the effect to retry on the next relevant state change —
        // otherwise a transient 5xx permanently disables auto-generation
        // for this mount.
        hasRequestedRef.current = false
      })
      .finally(() => setIsGenerating(false))
  }, [cache, generateBrief, props.enableGeneration, props.status])

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
  }, [carouselApi])

  const summary = useMemo(() => {
    const movers = props.movers24h
    const now = Date.now()
    const windowEvents = filterEventsInWindow(props.events?.events ?? [], "24h", now)
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
    // Strip decimal points ("+12.4%") before splitting so cited numbers
    // don't inflate the sentence count.
    const sentenceCount = fromSummary
      .replace(/(\d)\.(\d)/g, "$1$2")
      .split(/[.!?]+/)
      .filter((s) => s.trim()).length
    if (sentenceCount > 4) return fallback
    return fromSummary
  }, [brief, props.events?.events, props.movers24h])

  const fallbackCards = useMemo((): BriefCard[] => {
    const movers = props.movers24h
    const now = Date.now()
    const windowEvents = filterEventsInWindow(props.events?.events ?? [], "24h", now)

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
        details: { breadth: movers?.breadth ?? null },
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
        details: {
          headlines: (() => {
            const sorted = [...windowEvents].sort((a, b) => b.occurredAtMs - a.occurredAtMs)
            const seen = new Set<string>()
            const picked: HeadlineDetail[] = []
            for (const e of sorted) {
              const key = e.coingeckoId ?? e.title
              if (seen.has(key) || !e.symbol) continue
              seen.add(key)
              picked.push({ symbol: e.symbol.toUpperCase(), title: e.title, tone: e.tone })
              if (picked.length >= 3) break
            }
            return picked
          })(),
        },
      },
    ]
  }, [props.events?.events, props.movers24h])

  const cards = useMemo(() => {
    const current = brief?.cards ?? []
    const hasNewKinds = current.some((c) => c.kind === "regime" || c.kind === "technicals" || c.kind === "theme")
    if (hasNewKinds) return current
    return fallbackCards
  }, [brief?.cards, fallbackCards])

  // Technicals and theme cards are hidden from the slider for now — the data
  // is still generated and persisted, add the kind back here to resurface.
  const orderedCards = useMemo(() => {
    const byKind = new Map(cards.map((c) => [c.kind, c]))
    return (["regime"] as const)
      .map((k) => byKind.get(k))
      .filter((x) => Boolean(x)) as BriefCard[]
  }, [cards])

  // Known tokens (movers + event coins) for pill/badge rendering in the
  // summary slide.
  const tokenIndex = useMemo(() => {
    const map = new Map<string, TokenRef>()
    for (const row of [
      ...(props.movers24h?.gainers ?? []),
      ...(props.movers24h?.losers ?? []),
    ]) {
      if (!row.coingeckoId) continue
      const key = row.symbol.toUpperCase()
      if (!map.has(key)) {
        map.set(key, {
          symbol: row.symbol,
          coingeckoId: row.coingeckoId,
          name: row.name,
          logoUrl: row.logoUrl ?? null,
        })
      }
    }
    for (const e of props.events?.events ?? []) {
      if (!e.coingeckoId || !e.symbol) continue
      const key = e.symbol.toUpperCase()
      if (!map.has(key)) {
        map.set(key, {
          symbol: e.symbol,
          coingeckoId: e.coingeckoId,
          logoUrl: e.logoUrl ?? null,
        })
      }
    }
    return map
  }, [props.movers24h, props.events?.events])

  const richSummary = useMemo(
    () => renderRichSummary(summary, tokenIndex),
    [summary, tokenIndex],
  )

  // Top movers slide (last in the carousel): top 3 per side.
  const moversSlide = useMemo(() => {
    const gainers = (props.movers24h?.gainers ?? []).slice(0, 3)
    const losers = (props.movers24h?.losers ?? []).slice(0, 3)
    if (gainers.length === 0 && losers.length === 0) return null
    return { gainers, losers }
  }, [props.movers24h])

  // Autoplay timer -- the active indicator fills up, then advances to the
  // next slide. The fill is a pure CSS animation (keyed per slide, paused
  // via animation-play-state) and the advance is a single timeout — the old
  // 50ms setInterval re-rendered this whole card 20×/second while visible.
  const [isPaused, setIsPaused] = useState(false)
  const slideKeys = useMemo<Array<string>>(
    () => ["summary", ...orderedCards.map((c) => c.kind), ...(moversSlide ? ["movers"] : [])],
    [orderedCards, moversSlide],
  )
  const slideCount = slideKeys.length
  const progressRef = useRef(0)

  const resetProgress = useCallback(() => {
    progressRef.current = 0
  }, [])

  useEffect(() => {
    resetProgress()
  }, [selectedSlide, resetProgress])

  useEffect(() => {
    if (!carouselApi || isPaused || slideCount <= 1) return

    const remainingMs = Math.max(0, SLIDE_INTERVAL_MS - progressRef.current)
    const startedAt = Date.now()
    const id = setTimeout(() => {
      progressRef.current = 0
      carouselApi.scrollTo((selectedSlide + 1) % slideCount)
    }, remainingMs)

    return () => {
      clearTimeout(id)
      // Bank elapsed time so pause/resume continues where it left off,
      // mirroring the CSS animation's own paused progress.
      progressRef.current = Math.min(
        SLIDE_INTERVAL_MS,
        progressRef.current + (Date.now() - startedAt),
      )
    }
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
                      className={SLIDE_CARD_CLASS}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                          Brief
                        </span>
                        {brief.headline ? (
                          <Badge
                            variant="outline"
                            className="inline-flex h-6 px-2 align-middle text-[12px] font-berkeley-mono border-zinc-200/60 text-muted-foreground dark:border-white/10"
                          >
                            {brief.headline}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="text-xl leading-relaxed font-medium text-zinc-900 dark:text-zinc-100 text-pretty">
                        {richSummary}
                      </div>
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
                        className={SLIDE_CARD_CLASS}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">
                            {card.title}
                          </span>
                          <Badge
                            variant={toneBadgeVariant(card.tone)}
                            className={cn(
                              "inline-flex h-6 px-2 align-middle text-[12px] font-berkeley-mono",
                              card.tone === "neutral" &&
                                "border-zinc-200/60 text-muted-foreground dark:border-white/10",
                            )}
                          >
                            {primaryValueOf(card.primary)}
                          </Badge>
                        </div>
                        <div className="text-base leading-relaxed text-zinc-700 dark:text-zinc-200 text-pretty">
                          {renderRichSummary(card.body, tokenIndex)}
                        </div>

                        {card.kind === "regime" ? (
                          (() => {
                            const b = asBreadthDetail(card.details)
                            return b ? <BreadthBlock breadth={b} /> : null
                          })()
                        ) : null}
                        {card.kind === "technicals" ? (
                          <TechnicalsGroupsBlock
                            groups={asTechnicalsGroups(card.details)}
                            tokens={tokenIndex}
                          />
                        ) : null}
                        {card.kind === "theme" ? (
                          <ThemeHeadlinesBlock
                            headlines={asHeadlineDetails(card.details)}
                            tokens={tokenIndex}
                          />
                        ) : null}

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

              {moversSlide ? (
                <CarouselItem key="movers">
                  <div className={cn(SLIDE_MIN_H, "flex flex-col justify-center px-2 py-4")}>
                    <AnimatePresence mode="wait">
                      <MotionDiv
                        key={`card-movers-${selectedSlide}`}
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 0 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={shouldReduceMotion ? undefined : { opacity: 0, y: 0 }}
                        transition={{ duration: dur, ease: EASE_OUT_CUBIC }}
                        className={SLIDE_CARD_CLASS}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">
                            Top movers
                          </span>
                          <Badge
                            variant="outline"
                            className="inline-flex h-6 px-2 align-middle text-[12px] font-berkeley-mono border-zinc-200/60 text-muted-foreground dark:border-white/10"
                          >
                            24h
                          </Badge>
                        </div>
                        {/* Always two columns so the slide fits the fixed height on mobile. */}
                        <div className="grid grid-cols-2 gap-4 pt-1">
                          <MoversList title="Top gainers" rows={moversSlide.gainers} />
                          <MoversList title="Top losers" rows={moversSlide.losers} />
                        </div>
                      </MotionDiv>
                    </AnimatePresence>
                  </div>
                </CarouselItem>
              ) : null}
            </CarouselContent>
          </Carousel>

          <div className="flex items-center justify-start gap-1.5 px-2">
            <style>{"@keyframes brief-progress-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }"}</style>
            {slideKeys.map((slideKey, idx) => {
              const isActive = idx === selectedSlide

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
                      // Keyed per slide so the animation restarts on change.
                      key={`fill-${selectedSlide}`}
                      className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-zinc-900 dark:bg-white"
                      style={{
                        animation: `brief-progress-fill ${SLIDE_INTERVAL_MS}ms linear forwards`,
                        animationPlayState: isPaused ? "paused" : "running",
                      }}
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
