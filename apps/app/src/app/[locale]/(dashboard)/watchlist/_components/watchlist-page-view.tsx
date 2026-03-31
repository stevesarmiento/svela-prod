'use client'

import { useEffect, useRef, useState } from "react"
import { Spinner } from "@v1/ui/spinner"
import { Button } from "@v1/ui/button"
import { Tabs, TabsContent } from "@v1/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip"
import { Kbd } from "@v1/ui/kbd"
import { Separator } from "@v1/ui/separator"
import { toast } from "@v1/ui/use-toast"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@v1/ui/popover"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@v1/ui/breadcrumb"

import {
  IconEllipsis,
  IconWidgetSmallBadgePlus,
  IconBookmark,
  IconWalletBifold,
  IconBookmarkFill,
  IconBinoculars,
  IconBinocularsFill,
} from "symbols-react"
import { RefreshCw } from "lucide-react"
import { useMutation } from "convex/react"
import { useQueryClient } from "@tanstack/react-query"

import { useWatchlist } from "./watchlist-context"
import { WatchlistsGrid } from "./watchlists-grid"
import { ChartsClient } from "../../charts/_components/chart-client"
import { ComparisonChartsClient } from "../../charts/_components/chart-client"
import { CreateWatchlist } from "./create-watchlist"
import { CoinSearch, type CoinSearchRef } from "./coin-search"
import { AddWalletDialog } from "@/app/[locale]/(dashboard)/portfolio/_components/add-wallet-dialog"
import { WatchlistGroupIcon } from "@/components/watchlist-group-icon"
import { matchesShortcut, GLOBAL_SHORTCUTS } from "@/lib/keyboard-shortcuts"
import { useLatest } from "@/hooks/use-latest"
import { api } from "../../../../../../convex/_generated/api"

export interface WatchlistPageViewProps {
  activeTimeScale: string
  onTimeScaleChange: (scale: string) => void
  gridViewMode: "grid" | "chart"
  onGridViewModeChange: (mode: "grid" | "chart") => void
  contentMode: "cards" | "aggregate"
  onContentModeChange: (mode: "cards" | "aggregate") => void
}

export function WatchlistPageView({
  activeTimeScale,
  onTimeScaleChange,
  gridViewMode,
  onGridViewModeChange,
  contentMode,
  onContentModeChange,
}: WatchlistPageViewProps) {
  const {
    isInitialized,
    selectedGroup,
    selectWatchlistGroup,
  } = useWatchlist()

  const [isCreatingWatchlist, setIsCreatingWatchlist] = useState(false)
  const [isAddWalletOpen, setIsAddWalletOpen] = useState(false)
  const [isRefreshingData, setIsRefreshingData] = useState(false)
  const coinSearchRef = useRef<CoinSearchRef>(null)
  const queryClient = useQueryClient()
  const refreshMyDataNow = useMutation(api.refresh.refreshMyDataNow)

  const contentModeRef = useLatest(contentMode)
  const isCreatingWatchlistRef = useLatest(isCreatingWatchlist)
  const onGridViewModeChangeRef = useLatest(onGridViewModeChange)
  const onContentModeChangeRef = useLatest(onContentModeChange)

  useEffect(() => {
    const addTokenShortcut = GLOBAL_SHORTCUTS.find(s => s.handler === 'focusAddToken')
    const addWalletShortcut = GLOBAL_SHORTCUTS.find(s => s.handler === 'openAddWallet')
    const createWatchlistShortcut = GLOBAL_SHORTCUTS.find(s => s.handler === 'openCreateWatchlist')

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return

      if (createWatchlistShortcut && matchesShortcut(event, createWatchlistShortcut)) {
        if (isCreatingWatchlistRef.current) return
        event.preventDefault()
        setIsCreatingWatchlist(true)
        return
      }

      if (addTokenShortcut && matchesShortcut(event, addTokenShortcut)) {
        event.preventDefault()
        coinSearchRef.current?.open()
        return
      }

      if (addWalletShortcut && matchesShortcut(event, addWalletShortcut)) {
        event.preventDefault()
        setIsAddWalletOpen(true)
        return
      }

      if (event.key === '[' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        onContentModeChangeRef.current?.("cards")
        return
      }

      if (event.key === ']' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        onContentModeChangeRef.current?.("aggregate")
        return
      }

      if (contentModeRef.current === "cards") {
        if (event.key.toLowerCase() === "w" && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault()
          onGridViewModeChangeRef.current?.("grid")
          return
        }

        if (event.key.toLowerCase() === "e" && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault()
          onGridViewModeChangeRef.current?.("chart")
          return
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [contentModeRef, isCreatingWatchlistRef, onContentModeChangeRef, onGridViewModeChangeRef])

  // If watchlist context isn’t ready yet, keep the existing spinner behavior.
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size={24} />
      </div>
    )
  }

  const headerLeft = contentMode === "cards" ? (
    <div className="flex items-center gap-4">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  {gridViewMode === "chart" ? (
                    <BreadcrumbLink asChild>
                      <button
                        type="button"
                        onClick={() => onGridViewModeChange("grid")}
                        className="inline-flex items-center gap-2 rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <IconBookmarkFill className="size-4 fill-muted-foreground" />
                        <span>Watchlists</span>
                      </button>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage className="inline-flex items-center gap-2">
                      <IconBookmarkFill className="size-4 fill-muted-foreground" />
                      <span>Watchlists</span>
                    </BreadcrumbPage>
                  )}
                </BreadcrumbItem>

                {gridViewMode === "chart" && selectedGroup ? (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage className="inline-flex items-center gap-2">
                        <WatchlistGroupIcon
                          icon={selectedGroup.icon}
                          className="text-muted-foreground"
                          size={17}
                        />
                        <span className="max-w-[220px] truncate">{selectedGroup.name}</span>
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                ) : null}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" align="center" className="flex items-center gap-2 p-1 pl-2 ml-2 rounded-md text-xs">
          <span>Switch between Watchlists and Comparison</span>
          <Kbd>W</Kbd>
          <span>or</span>
          <Kbd>E</Kbd>
        </TooltipContent>
      </Tooltip>
    </div>
  ) : (
    <div className="flex items-center gap-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <button
                type="button"
                onClick={() => onContentModeChange("cards")}
                className="inline-flex items-center gap-2 rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <IconBookmarkFill className="size-4 fill-muted-foreground" />
                <span>Watchlists</span>
              </button>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="inline-flex items-center gap-2">
              <span>Sector comparison</span>
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  )

  return (
    <div className="space-y-6 px-4 w-full">
      <div className="flex items-center justify-between py-1">
        {headerLeft}

        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onContentModeChange(contentMode === "cards" ? "aggregate" : "cards")}
                className="group h-7 w-7 p-0 rounded-md bg-accent hover:bg-accent/90 hover:ring-1 ring-primary/10"
              >
                {contentMode === "cards" ? (
                  <IconBinoculars className="h-4 w-4 fill-muted-foreground group-hover:fill-primary" />
                ) : (
                  <IconBinocularsFill className="h-4 w-4 fill-primary" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" align="center" className="flex items-center gap-2 p-1 pl-2 rounded-md text-xs">
              <span>Switch between Watchlists and Aggregate</span>
              <Kbd>[</Kbd>
              <span>/</span>
              <Kbd>]</Kbd>
            </TooltipContent>
          </Tooltip>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="group h-7 w-7 p-0 rounded-md bg-accent hover:bg-accent/90 hover:ring-1 ring-primary/10"
              >
                <IconEllipsis className="size-3.5 fill-muted-foreground group-hover:fill-primary rotate-90" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-1 rounded-xl bg-white dark:bg-zinc-900 overflow-hidden" align="end" side="bottom">
              <div className="space-y-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCreatingWatchlist(true)}
                  className="w-full justify-start gap-2 rounded-md"
                >
                  <IconWidgetSmallBadgePlus className="h-3.5 w-3.5 fill-muted-foreground" />
                  <span>Create Watchlist</span>
                  <div className="ml-auto flex items-center gap-1">
                    <Kbd className="text-[10px]">Shift</Kbd>
                    <Kbd className="text-[10px] font-diatype-bold">N</Kbd>
                  </div>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => coinSearchRef.current?.open()}
                  className="w-full justify-start gap-2 rounded-md"
                >
                  <IconBookmark className="h-3.5 w-3.5 fill-muted-foreground" />
                  <span>Add Token</span>
                  <div className="ml-auto flex items-center gap-1">
                    <Kbd className="text-[10px]">Shift</Kbd>
                    <Kbd className="text-[10px] font-diatype-bold">A</Kbd>
                  </div>
                </Button>

                <Separator className="my-1 scale-x-110" />

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddWalletOpen(true)}
                  className="w-full justify-start gap-2 rounded-md"
                >
                  <IconWalletBifold className="h-3.5 w-3.5 fill-muted-foreground" />
                  <span>Import from Wallet</span>
                  <div className="ml-auto flex items-center gap-1">
                    <Kbd className="text-[10px]">Shift</Kbd>
                    <Kbd className="text-[10px] font-diatype-bold">M</Kbd>
                  </div>
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                aria-label="Refresh data"
                variant="ghost"
                size="sm"
                disabled={isRefreshingData}
                onClick={async () => {
                  if (isRefreshingData) return
                  setIsRefreshingData(true)
                  try {
                    const result = await refreshMyDataNow({ force: true })
                    if (!result.scheduled) {
                      toast({
                        title: "Refresh skipped",
                        description:
                          result.reason === "cooldown"
                            ? "You refreshed recently. Try again in a moment."
                            : "Refresh could not be scheduled.",
                      })
                      return
                    }

                    toast({
                      title: "Refresh scheduled",
                      description: `Refreshing ${result.coinsCount} tokens and ${result.walletsCount} wallets.`,
                    })

                    await Promise.all([
                      queryClient.invalidateQueries({ queryKey: ["coingecko-quotes"] }),
                      queryClient.invalidateQueries({ queryKey: ["watchlist-aggregate-historical"] }),
                      queryClient.invalidateQueries({ queryKey: ["hybrid-top-coins-api-first"] }),
                      queryClient.invalidateQueries({ queryKey: ["coingecko-ohlc"] }),
                      queryClient.invalidateQueries({ queryKey: ["coingecko-market-data"] }),
                    ])
                  } catch (error) {
                    toast({
                      title: "Refresh failed",
                      description: error instanceof Error ? error.message : "Failed to refresh data.",
                      variant: "destructive",
                    })
                  } finally {
                    setIsRefreshingData(false)
                  }
                }}
                className="group h-7 w-7 p-0 rounded-md bg-accent hover:bg-accent/90 hover:ring-1 ring-primary/10 disabled:opacity-60"
              >
                {isRefreshingData ? (
                  <Spinner size={14} />
                ) : (
                  <RefreshCw className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" align="center" className="flex items-center gap-2 p-1 pl-2 rounded-md text-xs">
              <span>Refresh data</span>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {contentMode === "cards" ? (
        <Tabs value={gridViewMode}>
          <TabsContent value="grid" className="mt-0">
            <WatchlistsGrid
              onSelectWatchlist={(group) => {
                selectWatchlistGroup(group)
                onGridViewModeChange("chart")
              }}
              viewMode="grid"
              activeTimeScale={activeTimeScale}
              onTimeScaleChange={onTimeScaleChange}
              onViewModeChange={onGridViewModeChange}
            />
          </TabsContent>

          <TabsContent value="chart" className="mt-0">
            <ChartsClient />
          </TabsContent>
        </Tabs>
      ) : (
        <ComparisonChartsClient inset={false} />
      )}

      <CreateWatchlist
        isOpen={isCreatingWatchlist}
        onClose={() => setIsCreatingWatchlist(false)}
      />

      <AddWalletDialog open={isAddWalletOpen} onOpenChange={setIsAddWalletOpen} />

      <div className="sr-only">
        <CoinSearch ref={coinSearchRef} />
      </div>
    </div>
  )
}

