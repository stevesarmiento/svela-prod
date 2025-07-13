'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { WatchlistCard } from './watchlist-card'
import { Button } from '@v1/ui/button'
import { Plus, Grid3X3 } from 'lucide-react'
import { toast } from '@v1/ui/use-toast'
import { 
  useWatchlistGroups,
  useUpdateWatchlistGroup,
  useDeleteWatchlistGroup,
  useWatchlistByGroup
} from '@v1/convex/hooks'
import { useCoinGeckoWatchlistCoins } from '@/hooks/use-coingecko-watchlist-coins'
import { IconPicker } from '@/components/icon-picker'
import { COLORS } from '@/components/color-picker'
import { useWatchlist } from './watchlist-context'
import { cn } from '@v1/ui/cn'
import { CreateWatchlist, CreateWatchlistTrigger } from './create-watchlist'
import { Input } from '@v1/ui/input'
import { IconCircleDottedAndCircle, IconStarFill } from 'symbols-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@v1/ui/tabs'
import { WatchlistMultiLineChart } from './watchlist-multi-line-chart'

interface WatchlistGroup {
  _id: string
  name: string
  slug: string
  description?: string
  icon?: string
  color?: string
  isDefault: boolean
  createdAt: number
  updatedAt: number
}

interface WatchlistsGridProps {
  onSelectWatchlist?: (group: WatchlistGroup) => void
}

// Component to fetch coins for a specific group
function WatchlistGroupWithCoins({ 
  group, 
  onEdit, 
  onDelete, 
  onSelect,
  selected,
  isEditing,
  editCardRef,
  editingName,
  editingIcon,
  editingColor
}: {
  group: WatchlistGroup
  onEdit: (group: WatchlistGroup) => void
  onDelete: (group: WatchlistGroup) => void
  onSelect?: (group: WatchlistGroup) => void
  selected?: boolean
  isEditing?: boolean
  editCardRef?: React.RefObject<HTMLDivElement | null>
  editingName?: string
  editingIcon?: string
  editingColor?: string
}) {
  const groupWatchlist = useWatchlistByGroup(group._id)
  
  // For watchlist cards only: Convert to CoinGecko IDs for display
  const coingeckoIds = useMemo(() => {
    // Watchlist stores CoinGecko string IDs, use them directly for card display
    return groupWatchlist?.map(item => item.coinId) || []
  }, [groupWatchlist])
  
  // Use CoinGecko data only for watchlist card display
  const { data: coins = [] } = useCoinGeckoWatchlistCoins(coingeckoIds)
  
  return (
    <div ref={isEditing ? editCardRef : undefined}>
      <WatchlistCard
        group={group}
        coins={coins}
        onEdit={onEdit}
        onDelete={onDelete}
        onSelect={onSelect}
        selected={selected}
        nameOverride={isEditing ? editingName : undefined}
        iconOverride={isEditing ? editingIcon : undefined}
        colorOverride={isEditing ? editingColor : undefined}
      />
    </div>
  )
}

export function WatchlistsGrid({ onSelectWatchlist }: WatchlistsGridProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [editingGroup, setEditingGroup] = useState<WatchlistGroup | null>(null)
  const editCardRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<'grid' | 'chart'>('grid')
  const [activeTimeScale, setActiveTimeScale] = useState<string>("7d")

  
  // Current editing values for real-time preview
  const [editingName, setEditingName] = useState('')
  const [editingIcon, setEditingIcon] = useState('')
  const [editingColor, setEditingColor] = useState('')

  // Hooks
  const watchlistGroups = useWatchlistGroups()
  const updateWatchlistGroup = useUpdateWatchlistGroup()
  const deleteWatchlistGroup = useDeleteWatchlistGroup()
  const { selectedGroup } = useWatchlist()

  const handleEditSave = useCallback(async (name: string, icon: string, color: string) => {
    if (!editingGroup) return

    try {
      await updateWatchlistGroup(
        editingGroup._id,
        name,
        undefined, // No description
        icon,
        color
      )
      toast({
        title: "Success",
        description: "Watchlist updated successfully",
      })
      setEditingGroup(null)
      setEditingName('')
      setEditingIcon('')
      setEditingColor('')
    } catch (error) {
      console.error('Failed to update watchlist:', error)
      toast({
        title: "Error",
        description: "Failed to update watchlist",
        variant: "destructive",
      })
    }
  }, [editingGroup, updateWatchlistGroup])

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

    try {
      await deleteWatchlistGroup(group._id)
      toast({
        title: "Success",
        description: "Watchlist deleted successfully",
      })
    } catch (error) {
      console.error('Failed to delete watchlist:', error)
      toast({
        title: "Error",
        description: "Failed to delete watchlist",
        variant: "destructive",
      })
    }
  }, [deleteWatchlistGroup])

  const openEditDialog = useCallback((group: WatchlistGroup) => {
    setEditingGroup(group)
    setEditingName(group.name)
    setEditingIcon(group.icon || 'list')
    setEditingColor(group.color || 'default')
  }, [])

  // Convert all watchlist groups to Set for chart component
  const allWatchlistIds = useMemo(() => {
    return new Set(watchlistGroups?.map(group => group._id) || [])
  }, [watchlistGroups])

  // Add keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.shiftKey && e.key === 'W') {
        e.preventDefault()
        setIsCreating(true)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  if (!watchlistGroups) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted-foreground">Loading watchlists...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 mb-24">

      {/* Header with tabs and create button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">          
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'grid' | 'chart')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="grid" className="flex items-center gap-2">
                <IconStarFill className="h-4 w-4 fill-muted-foreground" />
                Watchlists
              </TabsTrigger>
              <TabsTrigger value="chart" className="flex items-center gap-2">
                <IconCircleDottedAndCircle className="h-4 w-4 fill-muted-foreground" />
                Comparison
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <CreateWatchlistTrigger onClick={() => setIsCreating(true)} />
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'grid' | 'chart')}>
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
              <Button onClick={() => setIsCreating(true)} variant="outline">
                Create Watchlist
              </Button>
            </div>
          ) : (
            <>
              {/* Watchlists Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 relative">
                <CreateWatchlist 
                  isOpen={isCreating} 
                  onClose={() => setIsCreating(false)} 
                />

                {/* Existing Watchlists */}
                {watchlistGroups
                  .slice()
                  .reverse()
                  .map((group) => (
                  <div 
                    key={group._id}
                    className={cn(
                      "transition-all duration-200",
                      (editingGroup && editingGroup._id === group._id || isCreating) && "relative z-50",
                      (editingGroup && editingGroup._id !== group._id || isCreating) && "opacity-20"
                    )}
                  >
                    <WatchlistGroupWithCoins
                      group={group}
                      onEdit={openEditDialog}
                      onDelete={handleDeleteWatchlist}
                      onSelect={onSelectWatchlist}
                      selected={selectedGroup?._id === group._id}
                      isEditing={editingGroup?._id === group._id}
                      editCardRef={editCardRef}
                      editingName={editingGroup?._id === group._id ? editingName : undefined}
                      editingIcon={editingGroup?._id === group._id ? editingIcon : undefined}
                      editingColor={editingGroup?._id === group._id ? editingColor : undefined}
                    />
                  </div>
                ))}
              </div>

              {/* Edit Overlay */}
              {editingGroup && editCardRef.current && (
                <>
                  {/* Backdrop */}
                  <div 
                    className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[20px] pointer-events-auto"
                    onClick={handleEditCancel}
                  />
                  
                  {/* Edit Panel */}
                  <div 
                    className="fixed z-50"
                    style={{
                      left: editCardRef.current.getBoundingClientRect().left,
                      top: editCardRef.current.getBoundingClientRect().bottom + window.scrollY + 12,
                      width: Math.max(editCardRef.current.getBoundingClientRect().width, 320),
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl pt-2 w-[280px] space-y-6 p-4">
                      {/* Name and Icon Row */}
                      <div className="flex gap-2 items-start">
                        <div className="flex-shrink-0">
                          <IconPicker 
                            value={editingIcon} 
                            onSelect={setEditingIcon}
                          />
                        </div>
                        <div className="flex-1">
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            placeholder="Watchlist name"
                            className="rounded-xl h-12"
                            autoFocus
                          />
                        </div>
                      </div>

                      {/* Color Grid */}
                      <div className="grid grid-cols-6 gap-3">
                        {COLORS.map((color: { value: string; bg: string; border: string }) => (
                          <button
                            key={color.value}
                            className={cn(
                              "h-8 w-8 rounded-md transition-all",
                              color.bg,
                              color.border,
                              editingColor === color.value && "ring-2 ring-white/20 ring-offset-2 ring-offset-zinc-900 scale-110"
                            )}
                            onClick={() => setEditingColor(color.value)}
                          />
                        ))}
                      </div>

                      {/* Action Buttons */}
                      <div className="space-y-2">
                        <Button 
                          onClick={() => handleEditSave(editingName, editingIcon, editingColor)} 
                          size="sm" 
                          className="w-full h-8"
                        >
                          Save Changes
                        </Button>
                        <Button 
                          onClick={handleEditCancel} 
                          variant="outline" 
                          size="sm" 
                          className="w-full h-8 border-zinc-700 hover:bg-zinc-800"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="chart" className="mt-0">
          <div className="space-y-6">
            {/* Watchlist comparison chart */}
            {allWatchlistIds.size > 0 ? (
              <WatchlistMultiLineChart
                activeTimeScale={activeTimeScale}
                setActiveTimeScale={setActiveTimeScale}
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
                    onClick={() => setActiveTab('grid')} 
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