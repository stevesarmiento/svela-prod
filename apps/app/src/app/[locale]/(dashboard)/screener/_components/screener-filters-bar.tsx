"use client"

import dynamic from "next/dynamic"
import * as React from "react"
import { X } from "lucide-react"
import { IconCommand, IconSparkles } from "symbols-react"
import { Badge } from "@v1/ui/badge"
import { Button } from "@v1/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip"
import { cn } from "@v1/ui/cn"
import { Kbd } from "@v1/ui/kbd"
import { formatLargeNumber } from "@v1/ui/format-numbers"
import type { TakerFilterState } from "@/hooks/use-watchlist-data"
import type { SmartScreenerScreenResponse } from "@/lib/smart-screener/screen-api"
import { SCREENER_RANGE_DEFAULTS } from "./screener-filter-constants"
import type { ScreenerTableStatus } from "./screener-table-types"

interface ScreenerFilterChip {
  key: string
  label: string
  value: string
}

function loadScreenerSmartPromptDialog() {
  return import("./screener-smart-prompt-dialog")
}

const LazyScreenerSmartPromptDialog = dynamic(
  () =>
    loadScreenerSmartPromptDialog().then(
      (module) => module.ScreenerSmartPromptDialog,
    ),
  { ssr: false, loading: () => null },
)

interface ScreenerFiltersBarProps {
  searchText: string
  priceRange: [number, number]
  marketCapRange: [number, number]
  volumeRange: [number, number]
  changeFilter: "all" | "positive" | "negative"
  sortBy: "name" | "price" | "change" | "marketCap" | "volume"
  sortOrder: "asc" | "desc"
  takerFilter: TakerFilterState | null
  onSearchTextChange: (value: string) => void
  onPriceRangeChange: (range: [number, number]) => void
  onMarketCapRangeChange: (range: [number, number]) => void
  onVolumeRangeChange: (range: [number, number]) => void
  onChangeFilterChange: (value: "all" | "positive" | "negative") => void
  onSortByChange: (value: "name" | "price" | "change" | "marketCap" | "volume") => void
  onSortOrderChange: (value: "asc" | "desc") => void
  onTakerFilterChange: (value: TakerFilterState | null) => void
  onClearAllFilters: () => void
  onSmartScreenerStatusChange?: (status: ScreenerTableStatus | null) => void
  smartScreenerSummary?: string | null
  onSmartScreenerScreenResultChange?: (result: SmartScreenerScreenResponse | null) => void
}

function getActiveScreenerFilters(args: {
  searchText: string
  takerFilter: TakerFilterState | null
  smartScreenerSummary: string | null
  priceRange: [number, number]
  marketCapRange: [number, number]
  volumeRange: [number, number]
  changeFilter: "all" | "positive" | "negative"
  sortBy: "name" | "price" | "change" | "marketCap" | "volume"
  sortOrder: "asc" | "desc"
}): Array<ScreenerFilterChip> {
  const filters: ScreenerFilterChip[] = []

  if (args.smartScreenerSummary) {
    filters.push({ key: "smartScreener", label: "Screener", value: args.smartScreenerSummary })
  }
  if (args.searchText) {
    filters.push({ key: "searchText", label: "Search", value: args.searchText })
  }

  if (args.takerFilter) {
    const parts: string[] = []
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

    filters.push({
      key: "takerFilter",
      label: "Taker",
      value: parts.length > 0 ? parts.join(" • ") : args.takerFilter.range,
    })
  }

  if (args.priceRange[0] > 0 || args.priceRange[1] < SCREENER_RANGE_DEFAULTS.priceMax) {
    filters.push({
      key: "priceRange",
      label: "Price",
      value: `$${args.priceRange[0]} - $${args.priceRange[1]}`,
    })
  }

  if (args.marketCapRange[0] > 0 || args.marketCapRange[1] < SCREENER_RANGE_DEFAULTS.marketCapMax) {
    filters.push({
      key: "marketCapRange",
      label: "Market Cap",
      value: `$${formatLargeNumber(args.marketCapRange[0])} - $${formatLargeNumber(args.marketCapRange[1])}`,
    })
  }

  if (args.volumeRange[0] > 0 || args.volumeRange[1] < SCREENER_RANGE_DEFAULTS.volumeMax) {
    filters.push({
      key: "volumeRange",
      label: "Volume",
      value: `$${formatLargeNumber(args.volumeRange[0])} - $${formatLargeNumber(args.volumeRange[1])}`,
    })
  }

  if (args.changeFilter !== "all") {
    filters.push({
      key: "changeFilter",
      label: "24h Change",
      value: args.changeFilter === "positive" ? "Positive" : "Negative",
    })
  }

  if (args.sortBy !== "marketCap" || args.sortOrder !== "desc") {
    filters.push({
      key: "sort",
      label: "Sort",
      value: `${args.sortBy} ${args.sortOrder}`,
    })
  }

  return filters
}

export function ScreenerFiltersBar(props: ScreenerFiltersBarProps) {
  const [shouldLoadPromptDialog, setShouldLoadPromptDialog] = React.useState(false)
  const [isPromptDialogOpen, setIsPromptDialogOpen] = React.useState(false)

  const activeFilters = React.useMemo(
    () =>
      getActiveScreenerFilters({
        searchText: props.searchText,
        takerFilter: props.takerFilter,
        smartScreenerSummary: props.smartScreenerSummary ?? null,
        priceRange: props.priceRange,
        marketCapRange: props.marketCapRange,
        volumeRange: props.volumeRange,
        changeFilter: props.changeFilter,
        sortBy: props.sortBy,
        sortOrder: props.sortOrder,
      }),
    [
      props.changeFilter,
      props.marketCapRange,
      props.priceRange,
      props.searchText,
      props.smartScreenerSummary,
      props.sortBy,
      props.sortOrder,
      props.takerFilter,
      props.volumeRange,
    ],
  )

  const hasActiveFilters = activeFilters.length > 0

  const preloadPromptDialog = React.useCallback(() => {
    if (shouldLoadPromptDialog) return
    setShouldLoadPromptDialog(true)
    void loadScreenerSmartPromptDialog()
  }, [shouldLoadPromptDialog])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault()
        preloadPromptDialog()
        setIsPromptDialogOpen(true)
        return
      }

      if (event.key === "Escape" && !isPromptDialogOpen && hasActiveFilters) {
        event.preventDefault()
        props.onClearAllFilters()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [hasActiveFilters, isPromptDialogOpen, preloadPromptDialog, props])

  const removeFilter = React.useCallback(
    (filter: ScreenerFilterChip) => {
      switch (filter.key) {
        case "smartScreener":
          props.onSmartScreenerScreenResultChange?.(null)
          return
        case "searchText":
          props.onSearchTextChange("")
          return
        case "takerFilter":
          props.onTakerFilterChange(null)
          return
        case "priceRange":
          props.onPriceRangeChange([0, SCREENER_RANGE_DEFAULTS.priceMax])
          return
        case "marketCapRange":
          props.onMarketCapRangeChange([0, SCREENER_RANGE_DEFAULTS.marketCapMax])
          return
        case "volumeRange":
          props.onVolumeRangeChange([0, SCREENER_RANGE_DEFAULTS.volumeMax])
          return
        case "changeFilter":
          props.onChangeFilterChange("all")
          return
        case "sort":
          props.onSortByChange("marketCap")
          props.onSortOrderChange("desc")
          return
      }
    },
    [props],
  )

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center w-full">
        <div className="flex items-center gap-2 flex-1 min-w-0">
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
                )}
                onPointerEnter={preloadPromptDialog}
                onFocus={preloadPromptDialog}
                onTouchStart={preloadPromptDialog}
                onClick={() => {
                  preloadPromptDialog()
                  setIsPromptDialogOpen(true)
                }}
              >
                <IconSparkles className="size-3 fill-primary/70" />
                <span>Smart Screener</span>
                {hasActiveFilters ? (
                  <span className="absolute -top-1 -right-1 size-2 bg-blue-500 rounded-full" />
                ) : null}
              </Button>
            </TooltipTrigger>
            <TooltipContent
              side="right"
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
                    onClick={() => removeFilter(filter)}
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
        </div>
      </div>

      {shouldLoadPromptDialog ? (
        <LazyScreenerSmartPromptDialog
          open={isPromptDialogOpen}
          onOpenChange={setIsPromptDialogOpen}
          changeFilter={props.changeFilter}
          sortBy={props.sortBy}
          sortOrder={props.sortOrder}
          takerFilter={props.takerFilter}
          onSearchTextChange={props.onSearchTextChange}
          onPriceRangeChange={props.onPriceRangeChange}
          onMarketCapRangeChange={props.onMarketCapRangeChange}
          onVolumeRangeChange={props.onVolumeRangeChange}
          onChangeFilterChange={props.onChangeFilterChange}
          onSortByChange={props.onSortByChange}
          onSortOrderChange={props.onSortOrderChange}
          onTakerFilterChange={props.onTakerFilterChange}
          onSmartScreenerStatusChange={props.onSmartScreenerStatusChange}
          onSmartScreenerScreenResultChange={props.onSmartScreenerScreenResultChange}
        />
      ) : null}
    </div>
  )
}
