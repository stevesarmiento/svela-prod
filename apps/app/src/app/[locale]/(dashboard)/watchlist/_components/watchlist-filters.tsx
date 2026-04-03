"use client"

import * as React from "react"
import { ArrowUp, X } from "lucide-react"
import { IconArrowTurnDownRight, IconArrowTurnUpRight, IconCommand, IconSparkleMagnifyingglass, IconSparkles, IconTelegramLogo } from "symbols-react"

import { Badge } from "@v1/ui/badge"
import { Button } from "@v1/ui/button"
import { cn } from "@v1/ui/cn"
import { Kbd } from "@v1/ui/kbd"
import { formatLargeNumber } from "@v1/ui/format-numbers"
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip"
import { toast } from "sonner"

import { useBottomNav } from "@/components/navigation/bottom-nav-context"
import type { TakerFilterState } from "@/hooks/use-watchlist-data"
import { shouldApplySmartScreenerResult } from "@/lib/smart-screener/client-result"
import {
  SmartScreenerScreenResponseSchema,
  type SmartScreenerScreenResponse,
} from "@/lib/smart-screener/screen-api"
import { formatDslSummary } from "@/lib/smart-screener/screening-dsl"
import { promptLooksLikeConstraints } from "@/lib/smart-screener/prompt-gating"
import type { WatchlistTableStatus } from "./watchlist-table-section"

interface FilterChip {
  key: string
  label: string
  value: string
}

export interface WatchlistFiltersProps {
  mode?: "watchlist" | "screener"
  // Filter state
  searchText: string
  priceRange: [number, number]
  marketCapRange: [number, number]
  volumeRange: [number, number]
  changeFilter: "all" | "positive" | "negative"
  sortBy: "name" | "price" | "change" | "marketCap" | "volume"
  sortOrder: "asc" | "desc"
  watchlistGroupId: string | null
  watchlistGroupOptions: Array<{ id: string; name: string }>
  takerFilter: TakerFilterState | null

  // Selection state
  selectedCoins: Set<string>
  totalCoins: number

  // Filter handlers
  onSearchTextChange: (value: string) => void
  onPriceRangeChange: (range: [number, number]) => void
  onMarketCapRangeChange: (range: [number, number]) => void
  onVolumeRangeChange: (range: [number, number]) => void
  onChangeFilterChange: (value: "all" | "positive" | "negative") => void
  onSortByChange: (value: "name" | "price" | "change" | "marketCap" | "volume") => void
  onSortOrderChange: (value: "asc" | "desc") => void
  onWatchlistGroupIdChange: (value: string | null) => void
  onTakerFilterChange: (value: TakerFilterState | null) => void
  onClearAllFilters: () => void

  // Selection handlers
  onSelectAll: (checked: boolean) => void
  onRemoveSelected: () => void

  // Loading states
  isRemoving?: boolean

  // Layout
  align?: "left" | "right"

  // Smart screener UX
  onSmartScreenerStatusChange?: (status: WatchlistTableStatus | null) => void
  smartScreenerSummary?: string | null
  onSmartScreenerScreenResultChange?: (result: SmartScreenerScreenResponse | null) => void
}

function normalizeFilterQuery(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ")
}

function stripLeadingThe(input: string): string {
  return input.replace(/^the\s+/, "")
}

function splitFilterClauses(input: string): Array<string> {
  return input
    .split(/[,;]+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const prev: Array<number> = Array.from({ length: b.length + 1 }, (_, i) => i)
  const curr: Array<number> = Array.from({ length: b.length + 1 }, () => 0)

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i
    const ai = a.charCodeAt(i - 1)
    for (let j = 1; j <= b.length; j += 1) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1, // deletion
        (curr[j - 1] ?? 0) + 1, // insertion
        (prev[j - 1] ?? 0) + cost, // substitution
      )
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j] ?? 0
  }

  return prev[b.length] ?? Math.max(a.length, b.length)
}

type NaturalLanguageAction =
  | { kind: "watchlist"; watchlistGroupId: string }
  | { kind: "change"; value: "all" | "positive" | "negative" }
  | { kind: "sortBy"; value: "name" | "price" | "change" | "marketCap" | "volume" }
  | { kind: "sortOrder"; value: "asc" | "desc" }
  | { kind: "priceRange"; value: [number, number] }
  | { kind: "marketCapRange"; value: [number, number] }
  | { kind: "volumeRange"; value: [number, number] }

const RANGE_DEFAULTS = {
  priceMax: 1_000_000,
  marketCapMax: 10_000_000_000_000,
  volumeMax: 1_000_000_000_000,
} as const

function parseCompactNumber(raw: string): number | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replaceAll("$", "")
    .replaceAll(",", "")
    .replaceAll("_", "")

  if (!cleaned) return null

  const match = cleaned.match(/^([0-9]*\.?[0-9]+)\s*(k|m|b|t|bn)?$/)
  if (!match) return null

  const n = Number(match[1])
  if (!Number.isFinite(n)) return null

  const suffix = match[2] ?? ""
  const mult =
    suffix === "k"
      ? 1e3
      : suffix === "m"
        ? 1e6
        : suffix === "b" || suffix === "bn"
          ? 1e9
          : suffix === "t"
            ? 1e12
            : 1

  const value = n * mult
  return Number.isFinite(value) ? value : null
}

type RangeField = "price" | "marketCap" | "volume"

function parseRangeClause(args: {
  clause: string
  field: RangeField
  max: number
}): [number, number] | null {
  const fieldRe =
    args.field === "price"
      ? /\bprice\b/
      : args.field === "marketCap"
        ? /\bmcap\b|\bmarket\s*cap\b|\bmarketcap\b/
        : /\bvol\b|\bvolume\b/

  if (!fieldRe.test(args.clause)) return null

  const between = args.clause.match(
    new RegExp(
      `${fieldRe.source}\\s*(?:between|from)\\s*([^\\s]+)\\s*(?:and|to|-)\\s*([^\\s]+)`,
    ),
  )
  if (between) {
    const a = parseCompactNumber(between[1] ?? "")
    const b = parseCompactNumber(between[2] ?? "")
    if (a === null || b === null) return null
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    return [Math.max(0, lo), Math.min(args.max, hi)]
  }

  const cmp = args.clause.match(
    new RegExp(`${fieldRe.source}\\s*(<=|>=|<|>|under|below|over|above)\\s*([^\\s]+)`),
  )
  if (!cmp) return null

  const op = (cmp[1] ?? "").toLowerCase()
  const v = parseCompactNumber(cmp[2] ?? "")
  if (v === null) return null

  if (op === "<" || op === "<=" || op === "under" || op === "below") {
    return [0, Math.min(args.max, v)]
  }
  if (op === ">" || op === ">=" || op === "over" || op === "above") {
    return [Math.max(0, v), args.max]
  }

  return null
}

function parseNaturalLanguageActions(args: {
  rawInput: string
  watchlistGroupIndex: Array<{
    id: string
    name: string
    normalizedName: string
    normalizedNameNoThe: string
  }>
}): Array<NaturalLanguageAction> {
  const clauses = splitFilterClauses(args.rawInput)
  const actions: Array<NaturalLanguageAction> = []

  for (const clauseRaw of clauses) {
    const clause = normalizeFilterQuery(clauseRaw)
    if (!clause) continue
    const clauseNoThe = stripLeadingThe(clause)

    // 1) Watchlist name match (exact -> startsWith -> small typo tolerance)
    if (clause.length >= 2) {
      const exact = args.watchlistGroupIndex.filter(
        (g) => g.normalizedName === clause || g.normalizedNameNoThe === clauseNoThe,
      )
      if (exact.length === 1) {
        actions.push({ kind: "watchlist", watchlistGroupId: exact[0]!.id })
        continue
      }

      const prefix = args.watchlistGroupIndex.filter(
        (g) => g.normalizedName.startsWith(clause) || g.normalizedNameNoThe.startsWith(clauseNoThe),
      )
      if (prefix.length === 1) {
        actions.push({ kind: "watchlist", watchlistGroupId: prefix[0]!.id })
        continue
      }

      if (clauseNoThe.length >= 3) {
        const contains = args.watchlistGroupIndex.filter(
          (g) => g.normalizedName.includes(clause) || g.normalizedNameNoThe.includes(clauseNoThe),
        )
        if (contains.length === 1) {
          actions.push({ kind: "watchlist", watchlistGroupId: contains[0]!.id })
          continue
        }
      }

      if (clause.length >= 6) {
        let best: { id: string; dist: number } | null = null
        let bestIsTied = false

        for (const g of args.watchlistGroupIndex) {
          const dist = Math.min(
            levenshteinDistance(clause, g.normalizedName),
            levenshteinDistance(clauseNoThe, g.normalizedNameNoThe),
          )
          if (dist > 2) continue
          if (!best || dist < best.dist) {
            best = { id: g.id, dist }
            bestIsTied = false
          } else if (best && dist === best.dist) {
            bestIsTied = true
          }
        }

        if (best && !bestIsTied) {
          actions.push({ kind: "watchlist", watchlistGroupId: best.id })
          continue
        }
      }
    }

    // 2) 24h change
    if (["positive", "pos", "up", "+", "green"].includes(clause)) {
      actions.push({ kind: "change", value: "positive" })
      continue
    }
    if (["negative", "neg", "down", "-", "red"].includes(clause)) {
      actions.push({ kind: "change", value: "negative" })
      continue
    }
    if (["all", "any"].includes(clause)) {
      actions.push({ kind: "change", value: "all" })
      continue
    }

    // 3) Sort phrases
    const clauseForSort = clause.replace(/^sort(\s+by)?\s+/, "")

    const sortOrderValue =
      clauseForSort.includes("descending") ||
      clauseForSort.includes("desc") ||
      clauseForSort.includes("decending")
        ? ("desc" as const)
        : clauseForSort.includes("ascending") || clauseForSort.includes("asc")
          ? ("asc" as const)
          : null

    const sortByValue = /\bmarket\s*cap\b|\bmarketcap\b|\bmcap\b/.test(clauseForSort)
      ? ("marketCap" as const)
      : /\bvolume\b|\bvol\b/.test(clauseForSort)
        ? ("volume" as const)
        : /\bprice\b/.test(clauseForSort)
          ? ("price" as const)
          : /\bchange\b|\b24h\b/.test(clauseForSort)
            ? ("change" as const)
            : /\bname\b/.test(clauseForSort)
              ? ("name" as const)
              : null

    if (sortByValue || sortOrderValue) {
      if (sortByValue) actions.push({ kind: "sortBy", value: sortByValue })
      if (sortOrderValue) actions.push({ kind: "sortOrder", value: sortOrderValue })
      continue
    }

    // 4) Shortcuts
    if (/\btop\s+gainers\b|\bgainers\b/.test(clause)) {
      actions.push({ kind: "change", value: "positive" })
      actions.push({ kind: "sortBy", value: "change" })
      actions.push({ kind: "sortOrder", value: "desc" })
      continue
    }
    if (/\btop\s+losers\b|\blosers\b/.test(clause)) {
      actions.push({ kind: "change", value: "negative" })
      actions.push({ kind: "sortBy", value: "change" })
      actions.push({ kind: "sortOrder", value: "asc" })
      continue
    }

    // 5) Numeric range clauses (USD)
    const marketCapRange = parseRangeClause({
      clause,
      field: "marketCap",
      max: RANGE_DEFAULTS.marketCapMax,
    })
    if (marketCapRange) {
      actions.push({ kind: "marketCapRange", value: marketCapRange })
      continue
    }

    const volumeRange = parseRangeClause({
      clause,
      field: "volume",
      max: RANGE_DEFAULTS.volumeMax,
    })
    if (volumeRange) {
      actions.push({ kind: "volumeRange", value: volumeRange })
      continue
    }

    const priceRange = parseRangeClause({
      clause,
      field: "price",
      max: RANGE_DEFAULTS.priceMax,
    })
    if (priceRange) actions.push({ kind: "priceRange", value: priceRange })
  }

  return actions
}

function doesQueryLookLikeFilterIntent(raw: string): boolean {
  const s = normalizeFilterQuery(raw)
  if (!s) return false
  if (s.length < 6) return false
  if (
    /\b(sort|top|gainers|losers|market|mcap|volume|price|change|between|under|over|above|below|taker|buy|sell|ratio|net)\b/.test(
      s,
    )
  ) {
    return true
  }
  if (/[<>]=?/.test(s)) return true
  return s.split(" ").length >= 3
}

type PreviewAction =
  | { kind: "searchText"; value: string }
  | NaturalLanguageAction
  | { kind: "takerFilter"; value: TakerFilterState }

function previewActionToChip(action: PreviewAction): FilterChip {
  if (action.kind === "searchText") {
    return { key: "preview:searchText", label: "Search", value: action.value }
  }
  if (action.kind === "watchlist") {
    return { key: "preview:watchlist", label: "Watchlist", value: action.watchlistGroupId }
  }
  if (action.kind === "change") {
    return { key: "preview:change", label: "24h Change", value: action.value }
  }
  if (action.kind === "sortBy") {
    return { key: "preview:sortBy", label: "Sort", value: action.value }
  }
  if (action.kind === "sortOrder") {
    return { key: "preview:sortOrder", label: "Order", value: action.value }
  }
  if (action.kind === "takerFilter") {
    const parts: Array<string> = []
    if (action.value.exchange) parts.push(action.value.exchange)
    if (action.value.minBuyRatio != null) parts.push(`buyRatio ≥ ${(action.value.minBuyRatio * 100).toFixed(0)}%`)
    if (action.value.minBuyVolumeUsd != null) parts.push(`buy ≥ $${formatLargeNumber(action.value.minBuyVolumeUsd)}`)
    if (action.value.minTotalVolumeUsd != null) parts.push(`total ≥ $${formatLargeNumber(action.value.minTotalVolumeUsd)}`)
    if (action.value.requireBuyGreaterThanSell) parts.push("buy > sell")
    if (action.value.minNetBuyUsd != null) parts.push(`netBuy ≥ $${formatLargeNumber(action.value.minNetBuyUsd)}`)
    return {
      key: "preview:takerFilter",
      label: "Taker",
      value: parts.length > 0 ? parts.join(" • ") : action.value.range,
    }
  }
  if (action.kind === "priceRange") {
    return { key: "preview:priceRange", label: "Price", value: `$${action.value[0]} - $${action.value[1]}` }
  }
  if (action.kind === "marketCapRange") {
    return {
      key: "preview:marketCapRange",
      label: "Market Cap",
      value: `$${formatLargeNumber(action.value[0])} - $${formatLargeNumber(action.value[1])}`,
    }
  }
  return {
    key: "preview:volumeRange",
    label: "Volume",
    value: `$${formatLargeNumber(action.value[0])} - $${formatLargeNumber(action.value[1])}`,
  }
}

function getActiveFilters(args: {
  isScreener: boolean
  searchText: string
  watchlistGroupId: string | null
  watchlistGroupOptions: Array<{ id: string; name: string }>
  takerFilter: TakerFilterState | null
  smartScreenerSummary: string | null
  priceRange: [number, number]
  marketCapRange: [number, number]
  volumeRange: [number, number]
  changeFilter: "all" | "positive" | "negative"
  sortBy: "name" | "price" | "change" | "marketCap" | "volume"
  sortOrder: "asc" | "desc"
}): FilterChip[] {
  const chips: FilterChip[] = []

  if (args.smartScreenerSummary) {
    chips.push({
      key: "smartScreener",
      label: "Screener",
      value: args.smartScreenerSummary,
    })
  }

  if (args.searchText) chips.push({ key: "searchText", label: "Search", value: args.searchText })

  if (!args.isScreener && args.watchlistGroupId) {
    const name =
      args.watchlistGroupOptions.find((o) => o.id === args.watchlistGroupId)?.name ?? "Selected"
    chips.push({ key: "watchlistGroup", label: "Watchlist", value: name })
  }

  if (args.takerFilter) {
    const parts: Array<string> = []
    if (args.takerFilter.exchange) parts.push(args.takerFilter.exchange)
    if (args.takerFilter.minBuyRatio != null) {
      parts.push(`buyRatio ≥ ${(args.takerFilter.minBuyRatio * 100).toFixed(0)}%`)
    }
    if (args.takerFilter.minBuyVolumeUsd != null) {
      parts.push(`buy ≥ $${formatLargeNumber(args.takerFilter.minBuyVolumeUsd)}`)
    }
    if (args.takerFilter.minTotalVolumeUsd != null) {
      parts.push(`total ≥ $${formatLargeNumber(args.takerFilter.minTotalVolumeUsd)}`)
    }
    if (args.takerFilter.requireBuyGreaterThanSell) parts.push("buy > sell")
    if (args.takerFilter.minNetBuyUsd != null) {
      parts.push(`netBuy ≥ $${formatLargeNumber(args.takerFilter.minNetBuyUsd)}`)
    }

    chips.push({
      key: "takerFilter",
      label: "Taker",
      value: parts.length > 0 ? parts.join(" • ") : args.takerFilter.range,
    })
  }

  if (args.priceRange[0] > 0 || args.priceRange[1] < RANGE_DEFAULTS.priceMax) {
    chips.push({
      key: "priceRange",
      label: "Price",
      value: `$${args.priceRange[0]} - $${args.priceRange[1]}`,
    })
  }

  if (args.marketCapRange[0] > 0 || args.marketCapRange[1] < RANGE_DEFAULTS.marketCapMax) {
    chips.push({
      key: "marketCapRange",
      label: "Market Cap",
      value: `$${formatLargeNumber(args.marketCapRange[0])} - $${formatLargeNumber(args.marketCapRange[1])}`,
    })
  }

  if (args.volumeRange[0] > 0 || args.volumeRange[1] < RANGE_DEFAULTS.volumeMax) {
    chips.push({
      key: "volumeRange",
      label: "Volume",
      value: `$${formatLargeNumber(args.volumeRange[0])} - $${formatLargeNumber(args.volumeRange[1])}`,
    })
  }

  if (args.changeFilter !== "all") {
    chips.push({
      key: "changeFilter",
      label: "24h Change",
      value: args.changeFilter === "positive" ? "Positive" : "Negative",
    })
  }

  if (args.sortBy !== "marketCap" || args.sortOrder !== "desc") {
    chips.push({
      key: "sort",
      label: "Sort",
      value: `${args.sortBy} ${args.sortOrder}`,
    })
  }

  return chips
}

export function WatchlistFilters({
  mode = "watchlist",
  searchText,
  priceRange,
  marketCapRange,
  volumeRange,
  changeFilter,
  sortBy,
  sortOrder,
  watchlistGroupId,
  watchlistGroupOptions,
  takerFilter,
  selectedCoins,
  totalCoins,
  onSearchTextChange,
  onPriceRangeChange,
  onMarketCapRangeChange,
  onVolumeRangeChange,
  onChangeFilterChange,
  onSortByChange,
  onSortOrderChange,
  onWatchlistGroupIdChange,
  onTakerFilterChange,
  onClearAllFilters,
  onSelectAll,
  onRemoveSelected,
  isRemoving,
  align = "left",
  onSmartScreenerStatusChange,
  smartScreenerSummary = null,
  onSmartScreenerScreenResultChange,
}: WatchlistFiltersProps) {
  const isScreener = mode === "screener"
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState("")
  const [isInterpreting, setIsInterpreting] = React.useState(false)

  const inputRef = React.useRef<HTMLInputElement>(null)
  const interpretAbortRef = React.useRef<AbortController | null>(null)
  const { setNavigationMode, setSelectionMode } = useBottomNav()
  const intentConfidenceThreshold = 0.6

  const watchlistGroupIndex = React.useMemo(() => {
    if (isScreener) return []
    return watchlistGroupOptions.map((g) => ({
      id: g.id,
      name: g.name,
      normalizedName: normalizeFilterQuery(g.name),
      normalizedNameNoThe: stripLeadingThe(normalizeFilterQuery(g.name)),
    }))
  }, [isScreener, watchlistGroupOptions])

  const activeFilters = React.useMemo(
    () =>
      getActiveFilters({
        isScreener,
        smartScreenerSummary,
        searchText,
        watchlistGroupId,
        watchlistGroupOptions,
        takerFilter,
        priceRange,
        marketCapRange,
        volumeRange,
        changeFilter,
        sortBy,
        sortOrder,
      }),
    [
      isScreener,
      smartScreenerSummary,
      searchText,
      watchlistGroupId,
      watchlistGroupOptions,
      takerFilter,
      priceRange,
      marketCapRange,
      volumeRange,
      changeFilter,
      sortBy,
      sortOrder,
    ],
  )

  const hasActiveFilters = activeFilters.length > 0
  const hasSelectedCoins = selectedCoins.size > 0

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault()
        setOpen(true)
        return
      }

      if (e.key === "Escape" && !open && hasActiveFilters) {
        e.preventDefault()
        onClearAllFilters()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [hasActiveFilters, onClearAllFilters, open])

  React.useEffect(() => {
    if (!open) return
    setDraft("")
    setIsInterpreting(false)
    interpretAbortRef.current?.abort()
    interpretAbortRef.current = null

    const t = window.setTimeout(() => inputRef.current?.focus(), 60)
    return () => window.clearTimeout(t)
  }, [open])

  // Sync selection state to bottom navigation context (external system).
  React.useEffect(() => {
    if (selectedCoins.size > 0) {
      setSelectionMode({
        selectedCoins,
        totalCoins,
        onSelectAll,
        onRemoveSelected,
        isRemoving: isRemoving || false,
      })
    } else {
      setNavigationMode()
    }
  }, [
    selectedCoins,
    totalCoins,
    onSelectAll,
    onRemoveSelected,
    isRemoving,
    setSelectionMode,
    setNavigationMode,
  ])

  function removeFilter(key: string) {
    switch (key) {
      case "smartScreener":
        onSmartScreenerScreenResultChange?.(null)
        return
      case "searchText":
        onSearchTextChange("")
        return
      case "watchlistGroup":
        if (!isScreener) onWatchlistGroupIdChange(null)
        return
      case "takerFilter":
        onTakerFilterChange(null)
        return
      case "priceRange":
        onPriceRangeChange([0, RANGE_DEFAULTS.priceMax])
        return
      case "marketCapRange":
        onMarketCapRangeChange([0, RANGE_DEFAULTS.marketCapMax])
        return
      case "volumeRange":
        onVolumeRangeChange([0, RANGE_DEFAULTS.volumeMax])
        return
      case "changeFilter":
        onChangeFilterChange("all")
        return
      case "sort":
        onSortByChange("marketCap")
        onSortOrderChange("desc")
        return
    }
  }

  function applyNaturalLanguageActions(actions: Array<NaturalLanguageAction>) {
    for (const action of actions) {
      if (action.kind === "watchlist") {
        if (!isScreener) onWatchlistGroupIdChange(action.watchlistGroupId)
        continue
      }
      if (action.kind === "change") {
        onChangeFilterChange(action.value)
        continue
      }
      if (action.kind === "sortBy") {
        onSortByChange(action.value)
        continue
      }
      if (action.kind === "sortOrder") {
        onSortOrderChange(action.value)
        continue
      }
      if (action.kind === "priceRange") {
        onPriceRangeChange(action.value)
        continue
      }
      if (action.kind === "marketCapRange") {
        onMarketCapRangeChange(action.value)
        continue
      }
      if (action.kind === "volumeRange") onVolumeRangeChange(action.value)
    }
  }

  function applyServerActions(serverActions: Array<unknown>) {
    for (const a of serverActions) {
      if (typeof a !== "object" || a === null) continue
      const kind = (a as Record<string, unknown>).kind
      const value = (a as Record<string, unknown>).value

      if (kind === "watchlistGroupId") {
        if (isScreener) continue
        if (typeof value === "string" || value === null) onWatchlistGroupIdChange(value)
        continue
      }
      if (kind === "changeFilter") {
        if (value === "all" || value === "positive" || value === "negative") {
          onChangeFilterChange(value)
        }
        continue
      }
      if (kind === "sortBy") {
        if (
          value === "name" ||
          value === "price" ||
          value === "change" ||
          value === "marketCap" ||
          value === "volume"
        ) {
          onSortByChange(value)
        }
        continue
      }
      if (kind === "sortOrder") {
        if (value === "asc" || value === "desc") onSortOrderChange(value)
        continue
      }

      if (kind === "takerFilter") {
        if (typeof value !== "object" || value === null) continue
        const record = value as Record<string, unknown>

        const range =
          record.range === "1h" ||
          record.range === "4h" ||
          record.range === "12h" ||
          record.range === "24h" ||
          record.range === "7d"
            ? (record.range as TakerFilterState["range"])
            : ("24h" as const)
        const exchange = record.exchange === null || typeof record.exchange === "string" ? record.exchange : null
        const minBuyRatioRaw =
          record.minBuyRatio === null || typeof record.minBuyRatio === "number" ? record.minBuyRatio : null
        const minBuyVolumeUsdRaw =
          record.minBuyVolumeUsd === null || typeof record.minBuyVolumeUsd === "number" ? record.minBuyVolumeUsd : null
        const minTotalVolumeUsdRaw =
          record.minTotalVolumeUsd === null || typeof record.minTotalVolumeUsd === "number" ? record.minTotalVolumeUsd : null
        const minNetBuyUsdRaw =
          record.minNetBuyUsd === null || typeof record.minNetBuyUsd === "number" ? record.minNetBuyUsd : null
        const requireBuyGreaterThanSell =
          typeof record.requireBuyGreaterThanSell === "boolean" ? record.requireBuyGreaterThanSell : false

        const minBuyRatio =
          minBuyRatioRaw == null
            ? null
            : Math.max(0, Math.min(1, Number.isFinite(minBuyRatioRaw) ? minBuyRatioRaw : 0))
        const minNetBuyUsd =
          minNetBuyUsdRaw == null
            ? null
            : Math.max(0, Number.isFinite(minNetBuyUsdRaw) ? minNetBuyUsdRaw : 0)
        const minBuyVolumeUsd =
          minBuyVolumeUsdRaw == null
            ? null
            : Math.max(0, Number.isFinite(minBuyVolumeUsdRaw) ? minBuyVolumeUsdRaw : 0)
        const minTotalVolumeUsd =
          minTotalVolumeUsdRaw == null
            ? null
            : Math.max(0, Number.isFinite(minTotalVolumeUsdRaw) ? minTotalVolumeUsdRaw : 0)

        onTakerFilterChange({
          range,
          exchange,
          minBuyRatio,
          minBuyVolumeUsd,
          minTotalVolumeUsd,
          minNetBuyUsd,
          requireBuyGreaterThanSell,
        })
        continue
      }
    }
  }

  async function interpretAndApply(raw: string): Promise<void> {
    const trimmed = raw.trim()
    if (!trimmed) return

    // Keep derivatives/taker prompts on the existing intent endpoint for now.
    const looksLikeDerivatives =
      /\b(taker|net\s*buy|open\s*interest|oi\b|liquidat|funding)\b/i.test(trimmed)

    const isAdvancedScreenerQuery =
      /\b(fdv|ath|atl|drawdown|return|volatility|trend|momentum)\b/i.test(trimmed) ||
      /\b(7d|30d|24h)\b/i.test(trimmed) ||
      /\b(range)\b/i.test(trimmed)

    const shouldUseServerScreener =
      isScreener &&
      !looksLikeDerivatives &&
      (isAdvancedScreenerQuery || promptLooksLikeConstraints(trimmed))

    // In screener mode, prefer the server screener for metric/constraint prompts even if the
    // local parser can partially interpret them (to avoid "sort-only" / partial applies).
    if (shouldUseServerScreener) {
      interpretAbortRef.current?.abort()
      const abortController = new AbortController()
      interpretAbortRef.current = abortController

      setIsInterpreting(true)
      onSmartScreenerStatusChange?.({ kind: "interpreting", text: "Interpreting…" })
      try {
        const res = await fetch("/api/smart-screener/screen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
          body: JSON.stringify({
            text: trimmed,
            surface: "screener",
          }),
        })

        const json: unknown = await res.json().catch(() => null)
        const parsed = SmartScreenerScreenResponseSchema.safeParse(json)
        if (!parsed.success) {
          toast.error("Try again", {
            description: "Couldn’t interpret that. Try rephrasing with concrete constraints.",
          })
          return
        }

        const data = parsed.data
        if (data.userMessage) {
          if (data.ok) toast.message("Smart screener", { description: data.userMessage })
          else toast.error("Try again", { description: data.userMessage })
        }

        if (!data.ok) return

        // Clear potentially-conflicting local filters so server result sets render as expected.
        onSearchTextChange("")
        onPriceRangeChange([0, RANGE_DEFAULTS.priceMax])
        onMarketCapRangeChange([0, RANGE_DEFAULTS.marketCapMax])
        onVolumeRangeChange([0, RANGE_DEFAULTS.volumeMax])
        onChangeFilterChange("all")
        onSortByChange("marketCap")
        onSortOrderChange("desc")
        onTakerFilterChange(null)

        onSmartScreenerScreenResultChange?.({
          ...data,
          summary: formatDslSummary(data.dsl),
        })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        toast.error("Smart screener unavailable", {
          description: "Couldn’t interpret that right now. Try again in a moment.",
        })
        return
      } finally {
        setIsInterpreting(false)
        onSmartScreenerStatusChange?.(null)
      }
    }

    const actions = parseNaturalLanguageActions({ rawInput: trimmed, watchlistGroupIndex })

    // Fast path: if it looks like a simple token search, apply immediately.
    if (actions.length === 0 && trimmed.split(/\s+/g).length === 1 && trimmed.length <= 18) {
      onSearchTextChange(trimmed)
      return
    }

    // Local parse success: apply immediately.
    if (actions.length > 0) return applyNaturalLanguageActions(actions)

    const looksLikeIntent = doesQueryLookLikeFilterIntent(trimmed)
    if (!looksLikeIntent) {
      onSearchTextChange(trimmed)
      return
    }

    // For screener mode, use the server-side screen endpoint for broader market/metric queries.
    if (isScreener && !looksLikeDerivatives) {
      interpretAbortRef.current?.abort()
      const abortController = new AbortController()
      interpretAbortRef.current = abortController

      setIsInterpreting(true)
      onSmartScreenerStatusChange?.({ kind: "interpreting", text: "Interpreting…" })
      try {
        const res = await fetch("/api/smart-screener/screen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
          body: JSON.stringify({
            text: trimmed,
            surface: "screener",
          }),
        })

        const json: unknown = await res.json().catch(() => null)
        const parsed = SmartScreenerScreenResponseSchema.safeParse(json)
        if (!parsed.success) {
          toast.error("Try again", {
            description: "Couldn’t interpret that. Try rephrasing with concrete constraints.",
          })
          return
        }

        const data = parsed.data
        if (data.userMessage) {
          if (data.ok) {
            toast.message("Smart screener", { description: data.userMessage })
          } else {
            toast.error("Try again", { description: data.userMessage })
          }
        }

        if (!data.ok) return

        // Clear potentially-conflicting local filters so server result sets render as expected.
        onSearchTextChange("")
        onPriceRangeChange([0, RANGE_DEFAULTS.priceMax])
        onMarketCapRangeChange([0, RANGE_DEFAULTS.marketCapMax])
        onVolumeRangeChange([0, RANGE_DEFAULTS.volumeMax])
        onChangeFilterChange("all")
        onSortByChange("marketCap")
        onSortOrderChange("desc")
        onTakerFilterChange(null)

        onSmartScreenerScreenResultChange?.({
          ...data,
          summary: formatDslSummary(data.dsl),
        })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        toast.error("Smart screener unavailable", {
          description: "Couldn’t interpret that right now. Try again in a moment.",
        })
        return
      } finally {
        setIsInterpreting(false)
        onSmartScreenerStatusChange?.(null)
      }
    }

    interpretAbortRef.current?.abort()
    const abortController = new AbortController()
    interpretAbortRef.current = abortController

    setIsInterpreting(true)
    onSmartScreenerStatusChange?.({ kind: "interpreting", text: "Interpreting…" })
    try {
      const res = await fetch("/api/watchlist-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          text: trimmed,
          surface: isScreener ? "screener" : "watchlist",
          watchlistGroups: isScreener ? [] : watchlistGroupOptions,
          current: {
            watchlistGroupId: isScreener ? null : watchlistGroupId,
            changeFilter,
            sortBy,
            sortOrder,
            takerFilter,
          },
        }),
      })

      const data = (await res.json().catch(() => null)) as unknown
      const obj = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null
      const confidence = typeof obj?.confidence === "number" ? obj.confidence : 0
      const serverActions = Array.isArray(obj?.actions) ? (obj.actions as Array<unknown>) : []

      const shouldApplyActions = shouldApplySmartScreenerResult({
        ok: res.ok,
        confidence,
        actionsCount: serverActions.length,
        threshold: intentConfidenceThreshold,
      })
      if (!shouldApplyActions) {
        toast.error("Try again", {
          description:
            "Couldn’t confidently interpret that. Try rephrasing (e.g. “taker buy > sell, net buy > $10m”).",
        })
        return
      }

      applyServerActions(serverActions)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      toast.error("Smart screener unavailable", {
        description: "Couldn’t interpret that right now. Try again in a moment.",
      })
    } finally {
      setIsInterpreting(false)
      onSmartScreenerStatusChange?.(null)
    }
  }

  const examples = React.useMemo(
    () => [
      "taker buy > sell, net buy > $10m",
      "market cap over 500m, price under 0.10",
      "top gainers with > 100m volume",
    ],
    [],
  )

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center w-full">
        <div
          className={cn(
            "flex items-center gap-2 flex-1 min-w-0",
            align === "right" && "flex-row-reverse justify-start",
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                aria-label="Open Smart Screener"
                variant="ghost"
                size="sm"
                className={cn(
                  "group h-6.5 px-2 gap-1.5 rounded-lg bg-accent hover:bg-accent/90 border border-border hover:ring-1 ring-primary/30 relative",
                  hasActiveFilters && "ring-1 ring-blue-500/50 dark:ring-blue-400",
                  hasSelectedCoins && "ring-1 ring-red-500/50",
                )}
                onClick={() => setOpen(true)}
              >
                <IconSparkles className="size-3 fill-primary/70" />
                <span>Smart Screener</span>
                {hasActiveFilters ? (
                  <span className="absolute -top-1 -right-1 size-2 bg-blue-500 rounded-full" />
                ) : null}
                {hasSelectedCoins ? (
                  <span className="absolute -top-1 -left-1 size-2 bg-red-500 rounded-full" />
                ) : null}
              </Button>
            </TooltipTrigger>
            <TooltipContent
              side={align === "right" ? "left" : "right"}
              className="flex items-center gap-2 p-1 pl-2 rounded-md text-xs"
            >
              <span>Open by pressing</span>
              <Kbd>
                <IconCommand className="h-2.5 w-2.5 fill-primary/70" />
              </Kbd>
              <span>+</span>
              <Kbd>F</Kbd>
            </TooltipContent>
          </Tooltip>

          {hasActiveFilters ? (
            <div className="flex flex-wrap gap-2 min-w-0 items-center">
              {activeFilters.map((filter) => (
                <Badge
                  key={filter.key}
                  variant="secondary"
                  className="group h-6 gap-1 pr-1 py-0 bg-primary/5 text-primary/50 hover:text-primary cursor-crosshair border-border border-dashed flex-shrink-0"
                >
                  <span className="text-xs font-medium opacity-50">{filter.label}</span>
                  <div className="h-[24px] w-[1px] bg-border mx-1" />
                  <span className="text-xs tabular-nums">{filter.value}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-1 h-4 w-4 p-0 rounded-md group-hover:bg-blue-500"
                    aria-label={`Remove ${filter.label} filter`}
                    onClick={() => removeFilter(filter.key)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
              <span className="text-[10px] uppercase text-muted-foreground ml-1">
                press <Kbd className="font-bold w-8">esc</Kbd> to clear
              </span>
            </div>
          ) : null}

          {open ? (
            <div
              className={cn(
                "fixed inset-0 z-[10000] flex items-start justify-center px-4 pt-40",
              )}
            >
              <button
                type="button"
                aria-label="Close smart screener"
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => setOpen(false)}
              />

              <div
                role="dialog"
                aria-modal="true"
                aria-label="Smart screener"
                className={cn(
                  "relative w-full max-w-3xl overflow-hidden rounded-[28px] border border-gray-200/50 bg-white/95 shadow-[0_3px_8px_rgba(0,0,0,0.1),0_2px_4px_rgba(0,0,0,0.06)] backdrop-blur-md dark:border-transparent dark:bg-zinc-900/80 dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_30px_rgba(47,44,48,0.9),0_4px_16px_rgba(0,0,0,0.4)]",
                  // tailwindcss-animate: compositor-friendly enter (skipped when prefers-reduced-motion)
                  "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200 motion-safe:ease-out",
                )}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <form
                  id="smart-screener-prompt-form"
                  className="pb-16"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const prompt = draft
                    setOpen(false)
                    setDraft("")
                    void interpretAndApply(prompt)
                  }}
                >
                  <div className="flex min-h-12 items-center gap-3 border-b border-black/60 pb-6 p-6">
                    <input
                      ref={inputRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Describe what you're looking for..."
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setOpen(false)
                      }}
                      className="min-w-0 flex-1 border-0 bg-transparent text-base text-foreground shadow-none outline-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    <button
                      type="button"
                      aria-label="Close smart screener"
                      className="shrink-0 rounded-md"
                      onClick={() => setOpen(false)}
                    >
                      <Kbd className="bg-primary/10 font-mono px-2 w-8 uppercase text-xs">esc</Kbd>
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 p-5 border-t border-white/5 pt-3">
                    {examples.map((example) => (
                      <button
                        key={example}
                        type="button"
                        className={cn(
                          "inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-dashed border-border bg-primary/5 py-0 pl-1.5 pr-1 text-primary/80",
                          "cursor-pointer transition-colors hover:text-primary",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        )}
                        onClick={() => {
                          setOpen(false)
                          setDraft("")
                          void interpretAndApply(example)
                        }}
                      >
                        <span className="max-w-[min(100%,20rem)] text-left text-xs text-pretty">
                          {example}
                        </span>
                      </button>
                    ))}
                  </div>
                </form>

                <Button
                  type="submit"
                  size="sm"
                  variant="default"
                  form="smart-screener-prompt-form"
                  aria-label="Run smart screener"
                  className="absolute h-7 bottom-4 right-4 !rounded-lg gap-2 inline-flex"
                  disabled={draft.trim().length === 0 || isInterpreting}
                >
                  <IconArrowTurnDownRight className="size-2.5 fill-primary/70" />
                  <span className="text-xs">Enter</span>
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

