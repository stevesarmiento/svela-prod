'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { WatchlistCard } from './watchlist-card'
import { WatchlistGroupEditorPanel } from './watchlist-group-editor-panel'
import { Button } from '@v1/ui/button'
import { cn } from '@v1/ui/cn'
import { useMediaQuery } from '@v1/ui/hooks'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { EASE_OUT_CUBIC, motionDuration } from '@/lib/motion-tokens'
import { Grid3X3 } from 'lucide-react'
import { toast } from '@v1/ui/use-toast'
import { env } from '@/env.mjs'
import { useCoinGeckoWatchlistCoins } from '@/hooks/use-coingecko-watchlist-coins'
import { useWatchlist, type WatchlistGroup } from './watchlist-context'
import { Dialog, DialogContent } from '@v1/ui/dialog'
import { Tabs, TabsContent } from '@v1/ui/tabs'
import { WatchlistMultiLineChart } from './watchlist-multi-line-chart'
import { useDeletePortfolioWallet } from "@/hooks/use-portfolio-wallets"
import { useUpdateWatchlistGroup, useDeleteWatchlistGroup } from "@/lib/convex-hooks"
import { WatchlistGridEmptyState } from './watchlist-grid-empty-state'
import { WatchlistComparisonEmptyState } from './watchlist-comparison-empty-state'
import {
  useWatchlistsOverviewData,
  useWatchlistsPageBootstrap,
} from './watchlists-page-bootstrap-context'

const isDebug = env.NODE_ENV === "development"

// Above this count, desktop switches from one big grid to a paged carousel.
const WATCHLISTS_PAGE_SIZE = 12

const PAGE_TRANSITION_S = 0.15

// Vertical page-slide: new page enters from the direction you're heading.
const pageVariants = {
  enter: (direction: number) => ({ opacity: 0, y: direction * 24 }),
  center: { opacity: 1, y: 0 },
  exit: (direction: number) => ({ opacity: 0, y: direction * -24 }),
}

interface WatchlistsGridProps {
  onSelectWatchlist?: (group: WatchlistGroup) => void
  viewMode?: 'grid' | 'chart'
  activeTimeScale?: string
  onTimeScaleChange?: (scale: string) => void
  onViewModeChange?: (mode: 'grid' | 'chart') => void
  /** Layout for the comparison chart in 'chart' view mode. */
  chartLayout?: 'horizontal' | 'vertical'
  /** Hide the chart card's built-in selector when the page renders its own. */
  showChartTimeScaleSelector?: boolean
}

export function WatchlistsGrid({
  onSelectWatchlist,
  viewMode = 'grid',
  activeTimeScale = '7d',
  onTimeScaleChange,
  onViewModeChange,
  chartLayout = 'horizontal',
  showChartTimeScaleSelector = true
}: WatchlistsGridProps) {
  const [editingGroup, setEditingGroup] = useState<WatchlistGroup | null>(null)
  
  // Current editing values for real-time preview
  const [editingName, setEditingName] = useState('')
  const [editingIcon, setEditingIcon] = useState('')
  const [editingColor, setEditingColor] = useState('')
  const pageBootstrap = useWatchlistsPageBootstrap()
  const { overviewByGroupId, isLoading: isOverviewLoading } = useWatchlistsOverviewData()

  // Hooks
  const updateGroup = useUpdateWatchlistGroup()
  const deleteGroup = useDeleteWatchlistGroup()
  const deleteWallet = useDeletePortfolioWallet()
  const { selectedGroup, watchlistGroups } = useWatchlist()

  const gridGroups = useMemo(() => {
    // Keep the existing "newest first" behavior, but render all groups in one grid.
    return watchlistGroups.slice().reverse()
  }, [watchlistGroups])

  // Paged carousel (desktop only, when there are more than PAGE_SIZE watchlists).
  // 12 divides evenly into the md (2), lg (3), and xl (4) column counts, so every
  // full page renders as complete rows at any desktop breakpoint.
  // useMediaQuery returns false pre-mount, so defaulting to the plain grid avoids
  // a carousel flash on mobile's first paint.
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const usePagedCarousel = isDesktop && gridGroups.length > WATCHLISTS_PAGE_SIZE
  const shouldReduceMotion = useReducedMotion()
  const [pageState, setPageState] = useState<{ index: number; direction: 1 | -1 }>({
    index: 0,
    direction: 1,
  })

  const gridPages = useMemo(() => {
    const pages: WatchlistGroup[][] = []
    for (let i = 0; i < gridGroups.length; i += WATCHLISTS_PAGE_SIZE) {
      pages.push(gridGroups.slice(i, i + WATCHLISTS_PAGE_SIZE))
    }
    return pages
  }, [gridGroups])

  const goToPage = useCallback((index: number) => {
    setPageState((prev) =>
      index === prev.index ? prev : { index, direction: index > prev.index ? 1 : -1 },
    )
  }, [])

  // Keep the current page in range when watchlists are removed.
  useEffect(() => {
    setPageState((prev) =>
      prev.index < gridPages.length
        ? prev
        : { index: Math.max(0, gridPages.length - 1), direction: -1 },
    )
  }, [gridPages.length])

  // Lock the carousel viewport to the height of a full page so a shorter last
  // page doesn't shrink the layout (which would shift the centered dot rail).
  const pageAreaRef = useRef<HTMLDivElement | null>(null)
  const [fullPageHeight, setFullPageHeight] = useState<number>()

  useEffect(() => {
    if (!usePagedCarousel) {
      setFullPageHeight(undefined)
      return
    }
    const node = pageAreaRef.current
    if (!node) return
    // Only full pages define the locked height; short pages just sit inside it.
    if ((gridPages[pageState.index]?.length ?? 0) < WATCHLISTS_PAGE_SIZE) return

    const observer = new ResizeObserver(([entry]) => {
      const height = entry?.contentRect.height
      if (height) setFullPageHeight(height)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [usePagedCarousel, gridPages, pageState.index])

  const editingCoinIds = useMemo(() => {
    if (!editingGroup) return []
    return (pageBootstrap.itemsByGroupId[editingGroup._id] ?? []).map((item) => item.coinId)
  }, [pageBootstrap.itemsByGroupId, editingGroup])
  const { data: editingCoins = [] } = useCoinGeckoWatchlistCoins(editingCoinIds)

  const handleEditSave = useCallback(async (name: string, icon: string, color: string) => {
    if (!editingGroup) return
    const trimmedName = name.trim()

    if (!trimmedName) {
      toast({
        title: "Error",
        description: "Please enter a watchlist name",
        variant: "destructive",
      })
      return
    }

    try {
      await updateGroup(editingGroup._id, trimmedName, undefined, icon, color)
      toast({
        title: "Success",
        description: "Watchlist updated successfully",
      })
      setEditingGroup(null)
      setEditingName('')
      setEditingIcon('')
      setEditingColor('')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast({
        title: "Request Error",
        description: message,
        variant: "destructive",
      })
      if (isDebug) console.error("Failed to update watchlist:", error)
    }
  }, [editingGroup, updateGroup])

  const handleEditCancel = useCallback(() => {
    setEditingGroup(null)
    setEditingName('')
    setEditingIcon('')
    setEditingColor('')
  }, [])

  const handleDeleteWatchlist = useCallback(async (group: WatchlistGroup) => {
    if (group.isDefault) {
      toast({
        title: "Error",
        description: "Cannot delete default watchlist",
        variant: "destructive",
      })
      return
    }

    if (group.portfolioWalletId) {
      try {
        await deleteWallet.deleteWallet(group.portfolioWalletId)

        toast({
          title: "Success",
          description: "Wallet deleted successfully",
        })
      } catch (error) {
        toast({
          title: "Request Error",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        })
      }
      return
    }

    try {
      await deleteGroup(group._id)
      toast({
        title: "Success",
        description: "Watchlist deleted successfully",
      })
    } catch (error) {
      toast({
        title: "Request Error",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      })
      if (isDebug) console.error("Failed to delete watchlist:", error)
    }
  }, [deleteGroup])

  const openEditDialog = useCallback((group: WatchlistGroup) => {
    setEditingGroup(group)
    setEditingName(group.name)
    setEditingIcon(group.icon || 'sparkles')
    setEditingColor(group.color || 'default')
  }, [])

  // Convert all watchlist groups to Set for chart component
  const allWatchlistIds = useMemo(
    () => new Set(watchlistGroups.map((group) => group._id)),
    [watchlistGroups],
  )

  const renderWatchlistCard = (group: WatchlistGroup) => {
    const overviewEntry = overviewByGroupId.get(group._id)

    return (
      <div key={group._id}>
        <WatchlistCard
          group={group}
          coins={overviewEntry?.coins ?? []}
          itemCount={overviewEntry?.items.length ?? 0}
          isLoading={isOverviewLoading}
          onEdit={openEditDialog}
          onDelete={handleDeleteWatchlist}
          onSelect={onSelectWatchlist}
          selected={selectedGroup?._id === group._id}
        />
      </div>
    )
  }


  if (!watchlistGroups.length && isOverviewLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted-foreground">Loading watchlists...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Tabs value={viewMode}>
        <TabsContent value="grid" className="mt-0">
          {/* Empty State */}
          {watchlistGroups.length === 0 ? (
            <WatchlistGridEmptyState />
          ) : (
            <>
              {/* Watchlists Grid */}
              {usePagedCarousel ? (
                <div className="relative overflow-visible">
                  {/* Vertical page indicator — floats in the left gutter so the
                      grid keeps its original alignment with the page header. */}
                  <button
                    type="button"
                    className="absolute -left-12 top-1/2 -translate-y-1/2 flex cursor-pointer flex-col items-center gap-2 rounded-full border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-1.5 py-2 hover:bg-zinc-50 dark:hover:bg-white/10 transition-colors"
                    aria-label={`Watchlist pages — page ${pageState.index + 1} of ${gridPages.length}, click to go to next page`}
                    onClick={() =>
                      goToPage((pageState.index + 1) % gridPages.length)
                    }
                  >
                    {gridPages.map((page, idx) => {
                      const isActive = idx === pageState.index
                      return (
                        <span
                          key={page[0]?._id ?? idx}
                          className={cn(
                            "w-2 rounded-full transition-[height] duration-[var(--duration-micro)]",
                            isActive
                              ? "h-6 bg-zinc-900 dark:bg-white"
                              : "h-2 bg-zinc-400 dark:bg-white/10",
                          )}
                        />
                      )
                    })}
                  </button>

                  {/* Active page (vertical slide between pages) */}
                  <div
                    className="relative"
                    style={{ minHeight: fullPageHeight }}
                  >
                    <div ref={pageAreaRef}>
                      <AnimatePresence mode="popLayout" initial={false} custom={pageState.direction}>
                        <motion.div
                          key={pageState.index}
                          custom={pageState.direction}
                          variants={pageVariants}
                          initial="enter"
                          animate="center"
                          exit="exit"
                          transition={{
                            duration: motionDuration(shouldReduceMotion, PAGE_TRANSITION_S),
                            ease: EASE_OUT_CUBIC,
                          }}
                          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                        >
                          {(gridPages[pageState.index] ?? []).map(renderWatchlistCard)}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 relative">
                  {gridGroups.map(renderWatchlistCard)}
                </div>
              )}

              {/* Edit Watchlist Modal (centered) */}
              <Dialog
                open={Boolean(editingGroup)}
                onOpenChange={(open) => {
                  if (!open) handleEditCancel()
                }}
              >
                <DialogContent className="p-0 border-none bg-transparent shadow-none max-w-[320px] h-[600px]">
                {/* Preview Card */}
                  <div className="relative">
                    {editingGroup ? (
                      <WatchlistCard
                        group={editingGroup}
                        coins={editingCoins}
                        selected={false}
                        nameOverride={editingName}
                        iconOverride={editingIcon}
                        colorOverride={editingColor}
                      />
                    ) : null}
                  </div>

                  {/* Edit Panel */}
                  {editingGroup ? (
                    <WatchlistGroupEditorPanel
                      name={editingName}
                      icon={editingIcon}
                      color={editingColor}
                      onNameChange={setEditingName}
                      onIconChange={setEditingIcon}
                      onColorChange={setEditingColor}
                      submitLabel="Save Changes"
                      onSubmit={() => handleEditSave(editingName, editingIcon, editingColor)}
                      onCancel={handleEditCancel}
                    />
                  ) : null}
                </DialogContent>
              </Dialog>
            </>
          )}
        </TabsContent>

        <TabsContent value="chart" className="mt-0">
          <div className="space-y-6">
            {/* Watchlist comparison chart */}
            {allWatchlistIds.size > 0 ? (
              <WatchlistMultiLineChart
                activeTimeScale={activeTimeScale}
                setActiveTimeScale={onTimeScaleChange || (() => {})}
                selectedWatchlists={allWatchlistIds}
                layout={chartLayout}
                showTimeScaleSelector={showChartTimeScaleSelector}
                onSelectWatchlist={(watchlistId) => {
                  const group = watchlistGroups.find(g => g._id === watchlistId)
                  if (group) onSelectWatchlist?.(group)
                }}
              />
            ) : (
              <WatchlistComparisonEmptyState />
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
} 
