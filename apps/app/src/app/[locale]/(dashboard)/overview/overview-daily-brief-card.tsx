'use client'

import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card"
import { Badge } from "@v1/ui/badge"
import { cn } from "@v1/ui/cn"
import { Skeleton } from "@v1/ui/skeleton"
import { Spinner } from "@v1/ui/spinner"
import { Button } from "@v1/ui/button"

type BriefWindow = "24h" | "7d"
type OverviewStatus = "missing" | "fresh" | "stale"

interface DailyBrief {
  summary: string
  headline: string
  bullets: string[]
  risks: string[]
  opportunities: string[]
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

function formatBriefTime(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function buildStableTextRows(items: readonly string[], prefix: string): Array<{ key: string; text: string }> {
  const counts = new Map<string, number>()
  return items.map((text) => {
    const next = (counts.get(text) ?? 0) + 1
    counts.set(text, next)
    return { key: `${prefix}:${text}:${next}`, text }
  })
}

function BriefSkeleton() {
  return (
    <Card className="border border-zinc-800/20 dark:border-zinc-800/30 rounded-[20px] bg-white dark:bg-zinc-950/50 overflow-hidden">
      <CardHeader className="p-5 pb-3 space-y-0">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-16 rounded-md" />
        </div>
      </CardHeader>
      <CardContent className="p-5 pt-0 space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-10/12" />
        <Skeleton className="h-3 w-9/12" />
      </CardContent>
    </Card>
  )
}

export function OverviewDailyBriefCard(props: {
  status: OverviewStatus
  window: BriefWindow
  brief24h: DailyBriefCache
  brief7d: DailyBriefCache
  onGenerate: (args: { window: BriefWindow; force?: boolean }) => Promise<DailyBrief>
}) {
  const cache = props.window === "7d" ? props.brief7d : props.brief24h
  const generateBrief = props.onGenerate

  const [isGenerating, setIsGenerating] = useState(false)
  const requestedKeyRef = useRef<string>("")

  const key = `watchlist:${props.window}`

  useEffect(() => {
    if (props.status === "missing") return
    if (cache.status === "fresh" && cache.brief) return

    const shouldGenerate = cache.status === "missing" || cache.status === "stale"
    if (!shouldGenerate) return

    if (requestedKeyRef.current === key) return
    requestedKeyRef.current = key

    setIsGenerating(true)
    generateBrief({ window: props.window })
      .catch(() => {})
      .finally(() => setIsGenerating(false))
  }, [cache, generateBrief, key, props.status, props.window])

  const brief = useMemo(() => cache?.brief ?? null, [cache?.brief])
  const opportunityRows = useMemo(
    () => buildStableTextRows(brief?.opportunities ?? [], "o"),
    [brief?.opportunities],
  )
  const riskRows = useMemo(() => buildStableTextRows(brief?.risks ?? [], "r"), [brief?.risks])
  const summary = useMemo(() => {
    if (!brief) return ""
    const fromSummary = (brief.summary ?? "").trim()
    if (fromSummary && fromSummary !== brief.headline) return fromSummary
    const fromBullets = (brief.bullets ?? []).filter(Boolean).join(" ").trim()
    return fromBullets || fromSummary || brief.headline
  }, [brief])
  const showSkeleton = props.status === "missing"

  if (showSkeleton) return <BriefSkeleton />

  return (
    <Card className="border border-zinc-800/20 dark:border-zinc-800/30 rounded-[20px] bg-white dark:bg-zinc-950/50 overflow-hidden">
      <CardHeader className="p-5 pb-3 space-y-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm font-medium text-zinc-950 dark:text-white text-balance">
              Daily brief
            </CardTitle>
            <div className="mt-1 text-[11px] text-muted-foreground text-pretty">
              {brief?.generatedAt ? (
                <>
                  Updated {formatBriefTime(brief.generatedAt)}
                  {brief.model ? ` • ${brief.model}` : ""}
                </>
              ) : (
                "Generates a short summary from movers + events."
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {cache?.status === "fresh" ? (
              <Badge variant="success" className="font-berkeley-mono text-[11px]">
                Fresh
              </Badge>
            ) : cache?.status === "stale" ? (
              <Badge variant="warning" className="font-berkeley-mono text-[11px]">
                Stale
              </Badge>
            ) : (
              <Badge variant="outline" className="font-berkeley-mono text-[11px] text-muted-foreground">
                Missing
              </Badge>
            )}

            {isGenerating ? (
              <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Spinner className="h-3 w-3" />
                Updating
              </div>
            ) : null}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isGenerating}
              onClick={async () => {
                if (isGenerating) return
                requestedKeyRef.current = `${key}:force:${Date.now()}`
                setIsGenerating(true)
                try {
                  await generateBrief({ window: props.window, force: true })
                } finally {
                  setIsGenerating(false)
                }
              }}
              className="h-8 rounded-[10px]"
            >
              Regenerate
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-0">
        {brief ? (
          <div className="space-y-4">
            {brief.headline ? (
              <div className="text-xs font-medium text-zinc-600 dark:text-white/60">{brief.headline}</div>
            ) : null}

            <div className="text-sm text-zinc-700 dark:text-zinc-200 text-pretty">{summary}</div>

            {brief.opportunities.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs font-medium text-zinc-600 dark:text-white/60">
                  Opportunities
                </div>
                <ul className="space-y-1 text-sm text-zinc-700 dark:text-zinc-200 text-pretty">
                  {opportunityRows.map((row) => (
                    <li key={row.key} className="flex gap-2">
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-emerald-400/70" aria-hidden />
                      <span className="min-w-0">{row.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {brief.risks.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs font-medium text-zinc-600 dark:text-white/60">Risks</div>
                <ul className="space-y-1 text-sm text-zinc-700 dark:text-zinc-200 text-pretty">
                  {riskRows.map((row) => (
                    <li key={row.key} className="flex gap-2">
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-rose-400/70" aria-hidden />
                      <span className="min-w-0">{row.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <div
            className={cn("text-xs text-muted-foreground text-pretty", isGenerating && "opacity-70")}
          >
            {cache?.status === "missing"
              ? "Generating your first brief…"
              : cache?.status === "stale"
                ? "Refreshing brief…"
                : "Brief unavailable."}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
