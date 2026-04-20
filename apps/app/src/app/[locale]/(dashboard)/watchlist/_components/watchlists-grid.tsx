'use client'

import { useState, useCallback, useMemo } from 'react'
import { WatchlistCard } from './watchlist-card'
import { WatchlistGroupEditorPanel } from './watchlist-group-editor-panel'
import { Button } from '@v1/ui/button'
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

interface WatchlistsGridProps {
  onSelectWatchlist?: (group: WatchlistGroup) => void
  viewMode?: 'grid' | 'chart'
  activeTimeScale?: string
  onTimeScaleChange?: (scale: string) => void
  onViewModeChange?: (mode: 'grid' | 'chart') => void
}

export function WatchlistsGrid({ 
  onSelectWatchlist,
  viewMode = 'grid',
  activeTimeScale = '7d',
  onTimeScaleChange,
  onViewModeChange
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 relative">
                {gridGroups.map((group) => {
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
                })}
              </div>

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
