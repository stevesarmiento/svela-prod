'use client'

import type { ForwardRefExoticComponent, RefAttributes } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { Spinner } from "@v1/ui/spinner"
import { Button } from "@v1/ui/button"
import { Tabs, TabsContent } from "@v1/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip"
import { Kbd } from "@v1/ui/kbd"
import { Separator } from "@v1/ui/separator"
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
} from "symbols-react"

import { useWatchlist } from "./watchlist-context"
import { WatchlistsGrid } from "./watchlists-grid"
import type { CoinSearchRef } from "./coin-search"
import { WatchlistGroupIcon } from "@/components/watchlist-group-icon"
import { matchesShortcut, GLOBAL_SHORTCUTS } from "@/lib/keyboard-shortcuts"
import { useLatest } from "@/hooks/use-latest"

function loadChartsModule() {
  return import("../../charts/_components/chart-client")
}

function loadCreateWatchlist() {
  return import("./create-watchlist")
}

function loadCoinSearch() {
  return import("./coin-search")
}

function loadAddWalletDialog() {
  return import("@/app/[locale]/(dashboard)/portfolio/_components/add-wallet-dialog")
}

const LazyChartsClient = dynamic(
  () => loadChartsModule().then((module) => module.ChartsClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <Spinner size={24} />
      </div>
    ),
  },
)

const LazyCreateWatchlist = dynamic(
  () => loadCreateWatchlist().then((module) => module.CreateWatchlist),
  { ssr: false },
)

const LazyAddWalletDialog = dynamic(
  () => loadAddWalletDialog().then((module) => module.AddWalletDialog),
  { ssr: false },
)

type LazyCoinSearchComponent = ForwardRefExoticComponent<
  RefAttributes<CoinSearchRef>
>

export interface WatchlistPageViewProps {
  activeTimeScale: string
  onTimeScaleChange: (scale: string) => void
  gridViewMode: "grid" | "chart"
  onGridViewModeChange: (mode: "grid" | "chart") => void
}

export function WatchlistPageView({
  activeTimeScale,
  onTimeScaleChange,
  gridViewMode,
  onGridViewModeChange,
}: WatchlistPageViewProps) {
  const {
    isInitialized,
    selectedGroup,
    selectWatchlistGroup,
  } = useWatchlist()

  const [isCreatingWatchlist, setIsCreatingWatchlist] = useState(false)
  const [isAddWalletOpen, setIsAddWalletOpen] = useState(false)
  const [CoinSearchComponent, setCoinSearchComponent] = useState<LazyCoinSearchComponent | null>(null)
  const [shouldOpenCoinSearch, setShouldOpenCoinSearch] = useState(false)
  const coinSearchRef = useRef<CoinSearchRef>(null)

  const isCreatingWatchlistRef = useLatest(isCreatingWatchlist)
  const onGridViewModeChangeRef = useLatest(onGridViewModeChange)

  const preloadChartsClient = useCallback(() => {
    void loadChartsModule()
  }, [])

  const preloadCreateWatchlist = useCallback(() => {
    void loadCreateWatchlist()
  }, [])

  const preloadAddWalletDialog = useCallback(() => {
    void loadAddWalletDialog()
  }, [])

  const preloadCoinSearch = useCallback(async () => {
    if (CoinSearchComponent) return
    const module = await loadCoinSearch()
    setCoinSearchComponent(() => module.CoinSearch as LazyCoinSearchComponent)
  }, [CoinSearchComponent])

  const openCoinSearch = useCallback(async () => {
    await preloadCoinSearch()
    setShouldOpenCoinSearch(true)
  }, [preloadCoinSearch])

  useEffect(() => {
    if (!shouldOpenCoinSearch) return
    if (!CoinSearchComponent) return
    coinSearchRef.current?.open()
    setShouldOpenCoinSearch(false)
  }, [CoinSearchComponent, shouldOpenCoinSearch])

  useEffect(() => {
    const addTokenShortcut = GLOBAL_SHORTCUTS.find(s => s.handler === 'focusAddToken')
    const addWalletShortcut = GLOBAL_SHORTCUTS.find(s => s.handler === 'openAddWallet')
    const createWatchlistShortcut = GLOBAL_SHORTCUTS.find(s => s.handler === 'openCreateWatchlist')

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return

      if (createWatchlistShortcut && matchesShortcut(event, createWatchlistShortcut)) {
        if (isCreatingWatchlistRef.current) return
        event.preventDefault()
        preloadCreateWatchlist()
        setIsCreatingWatchlist(true)
        return
      }

      if (addTokenShortcut && matchesShortcut(event, addTokenShortcut)) {
        event.preventDefault()
        void openCoinSearch()
        return
      }

      if (addWalletShortcut && matchesShortcut(event, addWalletShortcut)) {
        event.preventDefault()
        preloadAddWalletDialog()
        setIsAddWalletOpen(true)
        return
      }

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

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [
    isCreatingWatchlistRef,
    onGridViewModeChangeRef,
    openCoinSearch,
    preloadAddWalletDialog,
    preloadCreateWatchlist,
  ])

  // If watchlist context isn’t ready yet, keep the existing spinner behavior.
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size={24} />
      </div>
    )
  }

  const headerLeft = (
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
  )

  return (
    <div className="space-y-6 px-4 w-full">
      <div className="flex items-center justify-between py-1">
        {headerLeft}

        <div className="flex items-center gap-2">
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
                  onClick={() => {
                    preloadCreateWatchlist()
                    setIsCreatingWatchlist(true)
                  }}
                  onMouseEnter={preloadCreateWatchlist}
                  onFocus={preloadCreateWatchlist}
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
                  onClick={() => {
                    void openCoinSearch()
                  }}
                  onMouseEnter={() => {
                    void preloadCoinSearch()
                  }}
                  onFocus={() => {
                    void preloadCoinSearch()
                  }}
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
                  onClick={() => {
                    preloadAddWalletDialog()
                    setIsAddWalletOpen(true)
                  }}
                  onMouseEnter={preloadAddWalletDialog}
                  onFocus={preloadAddWalletDialog}
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
        </div>
      </div>

      <Tabs value={gridViewMode}>
        <TabsContent value="grid" className="mt-0">
          <WatchlistsGrid
            onSelectWatchlist={(group) => {
              selectWatchlistGroup(group)
              preloadChartsClient()
              onGridViewModeChange("chart")
            }}
            viewMode="grid"
            activeTimeScale={activeTimeScale}
            onTimeScaleChange={onTimeScaleChange}
            onViewModeChange={onGridViewModeChange}
          />
        </TabsContent>

        <TabsContent value="chart" className="mt-0">
          <LazyChartsClient />
        </TabsContent>
      </Tabs>

      <LazyCreateWatchlist
        isOpen={isCreatingWatchlist}
        onClose={() => setIsCreatingWatchlist(false)}
      />

      <LazyAddWalletDialog open={isAddWalletOpen} onOpenChange={setIsAddWalletOpen} />

      {CoinSearchComponent ? (
        <div className="sr-only">
          <CoinSearchComponent ref={coinSearchRef} />
        </div>
      ) : null}
    </div>
  )
}
