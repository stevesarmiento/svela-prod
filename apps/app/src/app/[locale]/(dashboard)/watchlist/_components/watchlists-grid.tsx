'use client'

import { useState, useCallback, useMemo } from 'react'
import { WatchlistCard } from './watchlist-card'
import { WatchlistGroupEditorPanel } from './watchlist-group-editor-panel'
import { Button } from '@v1/ui/button'
import { Grid3X3, Plus } from 'lucide-react'
import { toast } from '@v1/ui/use-toast'
import { env } from '@/env.mjs'
import { 
  useWatchlistGroups,
  useWatchlistByGroup
} from '@/lib/convex-hooks'
import { useCoinGeckoWatchlistCoins } from '@/hooks/use-coingecko-watchlist-coins'
import { useWatchlist, type WatchlistGroup } from './watchlist-context'
import { Dialog, DialogContent } from '@v1/ui/dialog'
import { Tabs, TabsContent } from '@v1/ui/tabs'
import { WatchlistMultiLineChart } from './watchlist-multi-line-chart'
import { useDeletePortfolioWallet } from "@/hooks/use-portfolio-wallets"
import { useUpdateWatchlistGroup, useDeleteWatchlistGroup } from "@/lib/convex-hooks"

const isDebug = env.NODE_ENV === "development"

interface CoinGeckoWatchlistCoin {
  id: string; // CoinGecko string ID
  name: string;
  symbol: string;
  slug: string;
  image: string; // CoinGecko image URL
  cmc_rank: number;
  circulating_supply: number;
  max_supply: number | null;
  quote: {
    USD: {
      price: number;
      volume_24h: number;
      market_cap: number;
      percent_change_24h: number;
      percent_change_1h?: number;
      percent_change_7d?: number;
      percent_change_30d?: number;
    };
  };
}

interface WatchlistsGridProps {
  onSelectWatchlist?: (group: WatchlistGroup) => void
  viewMode?: 'grid' | 'chart'
  activeTimeScale?: string
  onTimeScaleChange?: (scale: string) => void
  onViewModeChange?: (mode: 'grid' | 'chart') => void
}

// Component to fetch coins for a specific group
function WatchlistGroupWithCoins({ 
  group, 
  onEdit, 
  onDelete, 
  onSelect,
  selected
}: {
  group: WatchlistGroup
  onEdit?: (group: WatchlistGroup) => void
  onDelete?: (group: WatchlistGroup) => void
  onSelect?: (group: WatchlistGroup) => void
  selected?: boolean
}) {
  const groupWatchlist = useWatchlistByGroup(group._id) as Array<{ coinId: string }> | undefined
  const isGroupWatchlistLoading = groupWatchlist === undefined
  
  // For watchlist cards only: Convert to CoinGecko IDs for display
  const coingeckoIds = useMemo(() => {
    // Watchlist stores CoinGecko string IDs, use them directly for card display
    const ids = groupWatchlist?.map(item => item.coinId) || []
    return ids
  }, [groupWatchlist])
  
  // Use CoinGecko data only for watchlist card display
  const { data: coins = [], isLoading: isCoinsLoading } = useCoinGeckoWatchlistCoins(coingeckoIds)
  const isCardLoading = isGroupWatchlistLoading || (coingeckoIds.length > 0 && isCoinsLoading && coins.length === 0)

  return (
    <WatchlistCard
      group={group}
      coins={coins}
      isLoading={isCardLoading}
      onEdit={onEdit}
      onDelete={onDelete}
      onSelect={onSelect}
      selected={selected}
    />
  )
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

  // Hooks
  const watchlistGroups = useWatchlistGroups() as WatchlistGroup[] | undefined
  const updateGroup = useUpdateWatchlistGroup()
  const deleteGroup = useDeleteWatchlistGroup()
  const deleteWallet = useDeletePortfolioWallet()
  const { selectedGroup } = useWatchlist()

  const gridGroups = useMemo(() => {
    // Keep the existing "newest first" behavior, but render all groups in one grid.
    return (watchlistGroups ?? []).slice().reverse()
  }, [watchlistGroups])

  const editingGroupWatchlist = useWatchlistByGroup(editingGroup?._id) as Array<{ coinId: string }> | undefined
  const editingCoinIds = useMemo(() => {
    return editingGroupWatchlist?.map((item) => item.coinId) || []
  }, [editingGroupWatchlist])
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
  const allWatchlistIds = useMemo(() => {
    return new Set(watchlistGroups?.map(group => group._id) || [])
  }, [watchlistGroups])


  if (!watchlistGroups) {
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
          {!watchlistGroups || watchlistGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                <Plus className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium mb-2">No watchlists yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first watchlist to start tracking coins
              </p>
            </div>
          ) : (
            <>
              {/* Watchlists Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 relative">
                {gridGroups.map((group) => (
                  <div key={group._id}>
                    <WatchlistGroupWithCoins
                      group={group}
                      onEdit={openEditDialog}
                      onDelete={handleDeleteWatchlist}
                      onSelect={onSelectWatchlist}
                      selected={selectedGroup?._id === group._id}
                    />
                  </div>
                ))}
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
                  const group = watchlistGroups?.find(g => g._id === watchlistId)
                  if (group) onSelectWatchlist?.(group)
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-[500px] border border-dashed border-border rounded-lg">
                <div className="text-center">
                  <Grid3X3 className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-medium mb-2">No Watchlists</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Create watchlists in the Grid tab to see them compared here
                  </p>
                  <Button 
                    onClick={() => onViewModeChange?.('grid')} 
                    variant="outline"
                  >
                    Go to Grid
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
} 