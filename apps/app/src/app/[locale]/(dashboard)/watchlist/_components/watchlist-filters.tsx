"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { Input } from "@v1/ui/input";
import { Button } from "@v1/ui/button";
import { Badge } from "@v1/ui/badge";
import { Label } from "@v1/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@v1/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@v1/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";
import { ListFilter, X } from "lucide-react";
import { Kbd } from "@v1/ui/kbd";
import { IconCommand, IconReturn } from "symbols-react";
import { useBottomNav } from "@/components/navigation/bottom-nav-context"
import { useReducedMotion } from "motion/react"
import { cn } from "@v1/ui/cn"

interface FilterChip {
  key: string;
  label: string;
  value: string;
}

interface AutoRefreshStatus {
  /** Milliseconds since epoch; typically from TanStack Query `dataUpdatedAt`. */
  lastUpdatedAtMs: number | null;
  /** Expected poll interval for the underlying data source. */
  refreshIntervalMs: number;
  /** Optional: whether a refresh is currently in-flight. */
  isRefreshing?: boolean;
}

interface WatchlistFiltersProps {
  // Filter state
  searchText: string;
  priceRange: [number, number];
  marketCapRange: [number, number];
  volumeRange: [number, number];
  changeFilter: "all" | "positive" | "negative";
  sortBy: "name" | "price" | "change" | "marketCap" | "volume";
  sortOrder: "asc" | "desc";
  watchlistGroupId: string | null;
  watchlistGroupOptions: Array<{ id: string; name: string }>;
  
  // Selection state
  selectedCoins: Set<string>;
  totalCoins: number;
  
  // Filter handlers
  onSearchTextChange: (value: string) => void;
  onPriceRangeChange: (range: [number, number]) => void;
  onMarketCapRangeChange: (range: [number, number]) => void;
  onVolumeRangeChange: (range: [number, number]) => void;
  onChangeFilterChange: (value: "all" | "positive" | "negative") => void;
  onSortByChange: (value: "name" | "price" | "change" | "marketCap" | "volume") => void;
  onSortOrderChange: (value: "asc" | "desc") => void;
  onWatchlistGroupIdChange: (value: string | null) => void;
  onClearAllFilters: () => void;
  
  // Selection handlers
  onSelectAll: (checked: boolean) => void;
  onRemoveSelected: () => void;
  
  // Loading states
  isRemoving?: boolean;

  // Layout
  align?: "left" | "right";

  // Optional: auto-refresh indicator (top-right).
  autoRefreshStatus?: AutoRefreshStatus;
}

const lastUpdatedFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
})

function clamp01(n: number): number {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function formatCountdownMmSs(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
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

      // Example: watchlist name "the majors" should match query "majors"
      if (clauseNoThe.length >= 3) {
        const contains = args.watchlistGroupIndex.filter(
          (g) => g.normalizedName.includes(clause) || g.normalizedNameNoThe.includes(clauseNoThe),
        )
        if (contains.length === 1) {
          actions.push({ kind: "watchlist", watchlistGroupId: contains[0]!.id })
          continue
        }
      }

      // Helpful for small typos (e.g. "ownerhip" -> "ownership")
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

    // 3) Sort phrases. Support:
    // - "sort marketcap desc"
    // - "marketcap descending"
    // - "market cap decending" (common misspelling)
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
  }

  return actions
}

interface RefreshDualRingProps {
  /** Progress through the full poll interval (green, top layer). */
  intervalProgress: number
  /** Progress through the current wall-clock minute 0–1 (yellow, under green). */
  minuteProgress: number
  sizePx?: number
  strokeWidthPx?: number
  className?: string
  /** When true, yellow minute arc is omitted (motion safety). */
  hideMinuteArc?: boolean
}

/** Single ring: grey track, bright yellow arc, bright green arc on top (same path, z-stacked). */
function RefreshDualRing({
  intervalProgress,
  minuteProgress,
  sizePx = 28,
  strokeWidthPx = 3.5,
  className,
  hideMinuteArc = false,
}: RefreshDualRingProps) {
  const cx = sizePx / 2
  const cy = sizePx / 2
  const r = (sizePx - strokeWidthPx) / 2
  const c = 2 * Math.PI * r
  const dashOffsetGreen = c * (1 - clamp01(intervalProgress))
  const dashOffsetYellow = c * (1 - clamp01(minuteProgress))

  const ringRotate = { transform: "rotate(-90deg)", transformOrigin: "50% 50%" } as const

  return (
    <svg
      width={sizePx}
      height={sizePx}
      viewBox={`0 0 ${sizePx} ${sizePx}`}
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      {/* 1. Track (back) */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidthPx}
        className="text-primary/20"
      />
      {/* 2. Minute sweep (middle) */}
      {!hideMinuteArc ? (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidthPx}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={dashOffsetYellow}
          className="text-amber-400 shadow-sm"
          style={ringRotate}
        />
      ) : null}
      {/* 3. Poll interval (front) */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidthPx}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={dashOffsetGreen}
        className="text-emerald-500/70 shadow-sm"
        style={ringRotate}
      />
    </svg>
  )
}

export function WatchlistFilters({
  searchText,
  priceRange,
  marketCapRange,
  volumeRange,
  changeFilter,
  sortBy,
  sortOrder,
  watchlistGroupId,
  watchlistGroupOptions,
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
  onClearAllFilters,
  onSelectAll,
  onRemoveSelected,
  isRemoving,
  align = "left",
  autoRefreshStatus,
}: WatchlistFiltersProps) {
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const [inputValue, setInputValue] = useState(searchText);
  const [isInterpreting, setIsInterpreting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const { setNavigationMode, setSelectionMode } = useBottomNav()
  const shouldReduceMotion = useReducedMotion() ?? false
  const [nowMs, setNowMs] = useState(() => Date.now())

  const intentConfidenceThreshold = 0.6

  const watchlistGroupIndex = useMemo(() => {
    return watchlistGroupOptions.map((g) => ({
      id: g.id,
      name: g.name,
      normalizedName: normalizeFilterQuery(g.name),
      normalizedNameNoThe: stripLeadingThe(normalizeFilterQuery(g.name)),
    }))
  }, [watchlistGroupOptions])

  const selectedWatchlistGroupName = useMemo(() => {
    if (!watchlistGroupId) return null
    return watchlistGroupOptions.find((o) => o.id === watchlistGroupId)?.name ?? null
  }, [watchlistGroupId, watchlistGroupOptions])

  // Keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+F (Mac) or Ctrl+F (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setIsFilterPopoverOpen(true);
        return;
      }

      // Calculate hasActiveFilters inside the effect to avoid dependency issues
      const currentHasActiveFilters = !!(
        searchText ||
        watchlistGroupId ||
        priceRange[0] > 0 || priceRange[1] < 1000000 ||
        marketCapRange[0] > 0 || marketCapRange[1] < 10000000000000 ||
        volumeRange[0] > 0 || volumeRange[1] < 1000000000000 ||
        changeFilter !== "all" ||
        // Default sort is volume desc (highest volume first)
        sortBy !== "volume" || sortOrder !== "desc"
      );

      // Check for Escape to clear filters (only if popover is not open and there are active filters)
      if (e.key === 'Escape' && !isFilterPopoverOpen && currentHasActiveFilters) {
        e.preventDefault();
        onClearAllFilters();
        setInputValue("");
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    isFilterPopoverOpen,
    searchText,
    watchlistGroupId,
    priceRange,
    marketCapRange,
    volumeRange,
    changeFilter,
    sortBy,
    sortOrder,
    onClearAllFilters,
  ]);

  // Focus input when popover opens
  useEffect(() => {
    if (isFilterPopoverOpen && inputRef.current) {
      // Small delay to ensure the popover is fully rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isFilterPopoverOpen]);

  // ✅ LEGITIMATE: Synchronize with external system (bottom navigation context)
  // This useEffect is correct because it syncs React state with external navigation system
  useEffect(() => {
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
  }, [selectedCoins, totalCoins, onSelectAll, onRemoveSelected, isRemoving, setSelectionMode, setNavigationMode])

  const getActiveFilters = (): FilterChip[] => {
    const chips: FilterChip[] = [];

    if (searchText) {
      chips.push({ key: "searchText", label: "Search", value: searchText });
    }

    if (watchlistGroupId) {
      chips.push({
        key: "watchlistGroup",
        label: "Watchlist",
        value: selectedWatchlistGroupName ?? "Selected",
      })
    }

    if (priceRange[0] > 0 || priceRange[1] < 1000000) {
      chips.push({
        key: "priceRange",
        label: "Price",
        value: `$${priceRange[0]} - $${priceRange[1]}`,
      });
    }

    if (marketCapRange[0] > 0 || marketCapRange[1] < 10000000000000) {
      chips.push({
        key: "marketCapRange",
        label: "Market Cap",
        value: `$${marketCapRange[0]}B - $${marketCapRange[1]}B`,
      });
    }

    if (volumeRange[0] > 0 || volumeRange[1] < 1000000000000) {
      chips.push({
        key: "volumeRange",
        label: "Volume",
        value: `$${volumeRange[0]}M - $${volumeRange[1]}M`,
      });
    }

    if (changeFilter !== "all") {
      chips.push({
        key: "changeFilter",
        label: "24h Change",
        value: changeFilter === "positive" ? "Positive" : "Negative",
      });
    }

    if (sortBy !== "volume" || sortOrder !== "desc") {
      chips.push({
        key: "sort",
        label: "Sort",
        value: `${sortBy} ${sortOrder}`,
      });
    }

    return chips;
  };

  const removeFilter = (key: string) => {
    switch (key) {
      case "searchText":
        onSearchTextChange("");
        setInputValue("");
        break;
      case "watchlistGroup":
        onWatchlistGroupIdChange(null)
        break
      case "priceRange":
        onPriceRangeChange([0, 1000000]);
        break;
      case "marketCapRange":
        onMarketCapRangeChange([0, 10000000000000]);
        break;
      case "volumeRange":
        onVolumeRangeChange([0, 1000000000000]);
        break;
      case "changeFilter":
        onChangeFilterChange("all");
        break;
      case "sort":
        // Reset to default sort (highest volume first)
        onSortByChange("volume");
        onSortOrderChange("desc");
        break;
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const raw = inputValue.trim()
      if (!raw) {
        setIsFilterPopoverOpen(false)
        return
      }

      if (isInterpreting) return

      const actions = parseNaturalLanguageActions({
        rawInput: raw,
        watchlistGroupIndex,
      })

      let didApplyNonSearchAction = false
      for (const action of actions) {
        if (action.kind === "watchlist") {
          onWatchlistGroupIdChange(action.watchlistGroupId)
          didApplyNonSearchAction = true
          continue
        }
        if (action.kind === "change") {
          onChangeFilterChange(action.value)
          didApplyNonSearchAction = true
          continue
        }
        if (action.kind === "sortBy") {
          onSortByChange(action.value)
          didApplyNonSearchAction = true
          continue
        }
        if (action.kind === "sortOrder") {
          onSortOrderChange(action.value)
          didApplyNonSearchAction = true
        }
      }

      if (didApplyNonSearchAction) {
        setInputValue("")
        setIsFilterPopoverOpen(false)
        return
      }

      // If the local fast-path can’t map intent, ask the server interpreter.
      setIsInterpreting(true)
      void (async () => {
        try {
          const res = await fetch("/api/watchlist-filters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: raw,
              watchlistGroups: watchlistGroupOptions,
              current: {
                watchlistGroupId,
                changeFilter,
                sortBy,
                sortOrder,
              },
            }),
          })

          if (!res.ok) {
            onSearchTextChange(raw)
            setIsFilterPopoverOpen(false)
            return
          }

          const data = (await res.json()) as unknown
          const obj = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null
          const confidence = typeof obj?.confidence === "number" ? obj.confidence : 0
          const serverActions = Array.isArray(obj?.actions) ? (obj?.actions as Array<unknown>) : []
          const fallbackSearchText =
            typeof obj?.fallbackSearchText === "string" ? obj.fallbackSearchText : null

          if (serverActions.length === 0 || confidence < intentConfidenceThreshold) {
            onSearchTextChange(fallbackSearchText ?? raw)
            setIsFilterPopoverOpen(false)
            return
          }

          let didApply = false
          for (const a of serverActions) {
            if (typeof a !== "object" || a === null) continue
            const kind = (a as Record<string, unknown>).kind
            const value = (a as Record<string, unknown>).value

            if (kind === "watchlistGroupId") {
              if (value === null || typeof value === "string") {
                onWatchlistGroupIdChange(value)
                didApply = true
              }
              continue
            }
            if (kind === "changeFilter") {
              if (value === "all" || value === "positive" || value === "negative") {
                onChangeFilterChange(value)
                didApply = true
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
                didApply = true
              }
              continue
            }
            if (kind === "sortOrder") {
              if (value === "asc" || value === "desc") {
                onSortOrderChange(value)
                didApply = true
              }
            }
          }

          if (didApply) setInputValue("")
          else onSearchTextChange(raw)
          setIsFilterPopoverOpen(false)
        } catch {
          onSearchTextChange(raw)
          setIsFilterPopoverOpen(false)
        } finally {
          setIsInterpreting(false)
        }
      })()
    } else if (e.key === 'Escape') {
      setIsFilterPopoverOpen(false);
    }
  };

  const activeFilters = getActiveFilters();
  const hasActiveFilters = activeFilters.length > 0;
  const hasSelectedCoins = selectedCoins.size > 0;

  const refreshUi = useMemo(() => {
    if (!autoRefreshStatus) return null

    const lastUpdatedAtMs = autoRefreshStatus.lastUpdatedAtMs
    if (!lastUpdatedAtMs) {
      return {
        lastUpdatedValue: "—",
        countdownLabel: "0:00",
        progress: 0,
        minuteProgress: 0,
      }
    }

    const intervalMs = Math.max(5_000, autoRefreshStatus.refreshIntervalMs)
    const nextAtMs = lastUpdatedAtMs + intervalMs
    const remainingMs = nextAtMs - nowMs

    const lastUpdatedValue = lastUpdatedFormatter.format(new Date(lastUpdatedAtMs))
    const progress = clamp01(1 - remainingMs / intervalMs)
    // Inner ring: one full sweep per wall-clock minute (vs slow outer poll interval).
    const minuteProgress = clamp01((nowMs % 60_000) / 60_000)
    const countdownLabel = formatCountdownMmSs(remainingMs)

    return { lastUpdatedValue, countdownLabel, progress, minuteProgress }
  }, [autoRefreshStatus, nowMs])

  useEffect(() => {
    if (!autoRefreshStatus?.lastUpdatedAtMs) return
    const tickMs = shouldReduceMotion ? 1000 : 250
    setNowMs(Date.now())
    const id = window.setInterval(() => setNowMs(Date.now()), tickMs)
    return () => window.clearInterval(id)
  }, [autoRefreshStatus?.lastUpdatedAtMs, autoRefreshStatus?.refreshIntervalMs, shouldReduceMotion])

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Regular Filter UI */}
      <div className="flex items-center justify-between w-full">
        {/* Filter Button and Active Filters Row */}
        <div
          className={`flex items-center gap-2 flex-1 min-w-0 ${align === "right" ? "flex-row-reverse justify-start" : ""}`}
        >
          <Popover open={isFilterPopoverOpen} onOpenChange={setIsFilterPopoverOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      ref={filterButtonRef}
                      variant="ghost"
                      size="icon"
                      className={`group h-7 w-7 p-0 rounded-md bg-accent hover:bg-accent/90 hover:ring-1 ring-primary/10 ${
                        hasActiveFilters ? "text-blue-600 dark:text-blue-400" : ""
                      } ${hasSelectedCoins ? "ring-2 ring-red-500/50" : ""}`}
                    >
                      <ListFilter className="h-4 w-4" />
                      {hasActiveFilters && (
                        <div className="absolute -top-1 -right-1 h-2 w-2 bg-blue-500 rounded-full" />
                      )}
                      {hasSelectedCoins && (
                        <div className="absolute -top-1 -left-1 h-2 w-2 bg-red-500 rounded-full" />
                      )}
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent
                  side={align === "right" ? "left" : "right"}
                  className="flex items-center gap-2 p-1 pl-2 rounded-md text-xs"
                >
                  <span>Filters</span>
                  <Kbd><IconCommand className="h-2.5 w-2.5 fill-primary/70" /></Kbd>
                  <span>+</span>
                  <Kbd>F</Kbd>
                </TooltipContent>
              </Tooltip>
            <PopoverContent
              className="rounded-xl bg-white dark:bg-zinc-900 p-2 ml-2"
              align={align === "right" ? "end" : "start"}
              side={align === "right" ? "left" : "right"}
            >
              {/* Search Input - Top Level */}
              <div className="">
                <div className="relative">
                  <Input
                    ref={inputRef}
                    placeholder='Search coins, or type “majors”, “ownership”, “marketcap descending”…'
                    value={inputValue}
                    disabled={isInterpreting}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className="h-8"
                  />
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                    {isInterpreting ? (
                      <span className="text-[10px] text-muted-foreground">Interpreting…</span>
                    ) : (
                      <Kbd className="text-xs">
                        <IconReturn className="h-2.5 w-2.5 fill-zinc-900 dark:fill-white/50" />
                      </Kbd>
                    )}
                  </div>
                </div>
              </div>

              {/* Filter Options */}
              <div className="p-2.5 space-y-3">
                <div className="flex items-center gap-1">
                  <ListFilter className="h-2.5 w-2.5 text-primary/30" />
                  <h4 className="font-medium text-xs text-primary/50 uppercase">Filters</h4>
                </div>

                {/* Watchlist Filter */}
                <div className="space-y-2">
                  <Label className="text-[11px] text-primary/80 uppercase flex items-center gap-1">
                    Watchlist
                  </Label>
                  <Select
                    value={watchlistGroupId ?? "__all__"}
                    onValueChange={(value) =>
                      onWatchlistGroupIdChange(value === "__all__" ? null : value)
                    }
                  >
                    <SelectTrigger className="h-8 rounded-lg">
                      <SelectValue placeholder="All watchlists" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover rounded-lg" side="right">
                      <SelectItem value="__all__">All watchlists</SelectItem>
                      {watchlistGroupOptions.length === 0 ? (
                        <SelectItem value="__none__" disabled>
                          No watchlists
                        </SelectItem>
                      ) : (
                        watchlistGroupOptions.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* 24h Change Filter */}
                <div className="space-y-2">
                  <Label className="text-[11px] text-primary/80 uppercase flex items-center gap-1">
                    24h Change
                  </Label>
                  <Select value={changeFilter} onValueChange={onChangeFilterChange}>
                    <SelectTrigger className="h-8 rounded-lg">
                      <SelectValue placeholder="All changes" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover rounded-lg" side="right">
                      <SelectItem value="all">All changes</SelectItem>
                      <SelectItem value="positive">Positive only</SelectItem>
                      <SelectItem value="negative">Negative only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Sort Options */}
                <div className="space-y-2">
                  <Label className="text-[11px] text-primary/80 uppercase">Sort By</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={sortBy} onValueChange={onSortByChange}>
                      <SelectTrigger className="h-8 rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover rounded-lg" side="right">
                        <SelectItem value="name">Name</SelectItem>
                        <SelectItem value="price">Price</SelectItem>
                        <SelectItem value="change">24h Change</SelectItem>
                        <SelectItem value="marketCap">Market Cap</SelectItem>
                        <SelectItem value="volume">Volume</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={sortOrder} onValueChange={onSortOrderChange}>
                      <SelectTrigger className="h-8 rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover rounded-lg" side="right">
                        <SelectItem value="asc">Ascending</SelectItem>
                        <SelectItem value="desc">Descending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Active Filters - Inline */}
          {hasActiveFilters && (
            <div className="flex flex-wrap gap-2 min-w-0 items-center">
              {activeFilters.map((filter) => (
                <Badge
                  key={filter.key}
                  variant="secondary"
                  className="h-6 gap-1 pr-1 py-0 bg-primary/5 text-primary/50 hover:text-primary cursor-crosshair border-border border-dashed flex-shrink-0"
                >
                  <span className="text-xs font-medium opacity-50">{filter.label}</span>
                  <div className="h-[24px] w-[1px] bg-border mx-1" />
                  <span className="text-xs">{filter.value}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
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
          )}
        </div>

        {refreshUi ? (
          <div className="ml-3 flex shrink-0 items-center gap-2">
            <div
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1",
                autoRefreshStatus?.isRefreshing && "bg-primary/5",
              )}
              aria-label={`Refreshes in ${refreshUi.countdownLabel}. Last updated ${refreshUi.lastUpdatedValue}.`}
            >
              <div className="flex flex-col items-end leading-tight">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-primary/40">Refreshes in:</span>
                  <span className="text-[11px] tabular-nums text-primary/80">
                    {refreshUi.countdownLabel}
                  </span>
                </div>
                <div className="hidden md:flex items-center gap-1">
                  <span className="text-[10px] text-primary/40">Last updated:</span>
                  <span className="text-[11px] tabular-nums text-primary/80">
                    {refreshUi.lastUpdatedValue}
                  </span>
                </div>
              </div>

              <RefreshDualRing
                intervalProgress={refreshUi.progress}
                minuteProgress={refreshUi.minuteProgress}
                hideMinuteArc={shouldReduceMotion}
                className="text-primary/80"
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}