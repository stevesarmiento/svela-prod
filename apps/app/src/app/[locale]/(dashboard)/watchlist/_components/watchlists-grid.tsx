'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { WatchlistCard } from './watchlist-card'
import { Button } from '@v1/ui/button'
import { Plus } from 'lucide-react'
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@v1/ui/dialog'
import { Input } from '@v1/ui/input'
import { Label } from '@v1/ui/label'
import { toast } from '@v1/ui/use-toast'
import { 
  useWatchlistGroups,
  useCreateWatchlistGroup,
  useUpdateWatchlistGroup,
  useDeleteWatchlistGroup,
  useWatchlistByGroup
} from '@v1/convex/hooks'
import { useWatchlistCoins } from '@/hooks/use-watchlist-coins'
import { IconPicker } from '@/components/icon-picker'
import { ColorPicker, COLORS } from '@/components/color-picker'
import { useWatchlist } from './watchlist-context'
import { cn } from '@v1/ui/cn'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@v1/ui/tooltip"
import { Kbd } from "@v1/ui/kbd"
import { IconWidgetSmallBadgePlus } from 'symbols-react'

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
  const coinIds = useMemo(() => {
    return groupWatchlist?.map(item => Number(item.coinId)) || []
  }, [groupWatchlist])
  
  const { data: coins = [] } = useWatchlistCoins(coinIds)
  
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
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<WatchlistGroup | null>(null)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState<string>('list')
  const [newColor, setNewColor] = useState<string>('default')
  const editCardRef = useRef<HTMLDivElement>(null)
  
  // Current editing values for real-time preview
  const [editingName, setEditingName] = useState('')
  const [editingIcon, setEditingIcon] = useState('')
  const [editingColor, setEditingColor] = useState('')

  // Hooks
  const watchlistGroups = useWatchlistGroups()
  const createWatchlistGroup = useCreateWatchlistGroup()
  const updateWatchlistGroup = useUpdateWatchlistGroup()
  const deleteWatchlistGroup = useDeleteWatchlistGroup()
  const { selectedGroup } = useWatchlist()

  // Mock coin data for preview
  const mockCoins = useMemo(() => [
    {
      id: 1,
      name: "Bitcoin",
      symbol: "BTC",
      quote: {
        USD: {
          price: 43250.32,
          percent_change_24h: 2.47,
          market_cap: 850000000000,
          volume_24h: 25000000000
        }
      }
    },
    {
      id: 1027,
      name: "Ethereum", 
      symbol: "ETH",
      quote: {
        USD: {
          price: 2650.85,
          percent_change_24h: -1.23,
          market_cap: 320000000000,
          volume_24h: 15000000000
        }
      }
    },
    {
      id: 5426,
      name: "Solana",
      symbol: "SOL", 
      quote: {
        USD: {
          price: 98.45,
          percent_change_24h: 4.82,
          market_cap: 45000000000,
          volume_24h: 2500000000
        }
      }
    }
  ], [])

  // Create preview group for the dialogs
  const previewGroup = useMemo(() => ({
    _id: 'preview',
    name: newName || 'Preview Watchlist',
    slug: 'preview',
    icon: newIcon,
    color: newColor,
    isDefault: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }), [newName, newIcon, newColor])

  const handleCreateWatchlist = useCallback(async () => {
    if (!newName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a watchlist name",
        variant: "destructive",
      })
      return
    }

    try {
      await createWatchlistGroup(
        newName.trim(), 
        undefined, // No description
        newIcon,
        newColor
      )
      toast({
        title: "Success",
        description: "Watchlist created successfully",
      })
      setIsCreateDialogOpen(false)
      setNewName('')
      setNewIcon('list')
      setNewColor('default')
    } catch (error) {
      console.error('Failed to create watchlist:', error)
      toast({
        title: "Error",
        description: "Failed to create watchlist",
        variant: "destructive",
      })
    }
  }, [newName, newIcon, newColor, createWatchlistGroup])

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

  const openCreateDialog = useCallback(() => {
    setNewName('')
    setNewIcon('list')
    setNewColor('default')
    setIsCreateDialogOpen(true)
  }, [])

  const openEditDialog = useCallback((group: WatchlistGroup) => {
    setEditingGroup(group)
    setEditingName(group.name)
    setEditingIcon(group.icon || 'list')
    setEditingColor(group.color || 'default')
  }, [])

  // Add keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'W') {
        e.preventDefault()
        openCreateDialog()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [openCreateDialog])

  if (!watchlistGroups) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted-foreground">Loading watchlists...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 mb-24">
      {/* Header with create button */}
      <div className="flex items-center justify-between">

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={openCreateDialog}
                className="h-7 pl-2 w-auto gap-2 group rounded-md"
              >
                <IconWidgetSmallBadgePlus className="h-4 w-4 fill-muted-foreground group-hover:fill-foreground" />
                <span className="text-sm">Create Watchlist</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="flex items-center gap-2 p-1 pl-2 rounded-md">
              <span>Create Watchlist</span>
              <Kbd>Shift</Kbd>
              <span>+</span>
              <Kbd>W</Kbd>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Watchlists grid */}
      {!watchlistGroups || watchlistGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
            <Plus className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium mb-2">No watchlists yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create your first watchlist to start tracking coins
          </p>
          <Button onClick={openCreateDialog} variant="outline">
            Create Watchlist
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 relative">
          {watchlistGroups.map((group) => (
            <div 
              key={group._id}
              className={cn(
                "transition-all duration-200",
                editingGroup && editingGroup._id === group._id && "relative z-50",
                editingGroup && editingGroup._id !== group._id && "opacity-20"
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
                <div className="pt-2 w-[280px] space-y-6">
                  {/* Name and Icon Row */}
                  <div className="flex gap-2 items-start mb-3">
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
                          "h-10 w-10 rounded-md transition-all",
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
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Watchlist</DialogTitle>
            <DialogDescription>
              Create a new watchlist to organize your cryptocurrency investments.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {/* Preview Card */}
            <div>
              <Label className="text-sm font-medium mb-3 block">Preview</Label>
              <div className="max-w-sm">
                <WatchlistCard
                  group={previewGroup}
                  coins={mockCoins}
                  selected={false}
                />
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div>
                    <Label htmlFor="icon">Icon</Label>
                    <div className="mt-2">
                      <IconPicker 
                        value={newIcon} 
                        onSelect={setNewIcon}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="color">Color</Label>
                    <div className="mt-2">
                      <ColorPicker 
                        value={newColor} 
                        onSelect={setNewColor}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., DeFi Tokens, Gaming Coins"
                    maxLength={50}
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateWatchlist}>
              Create Watchlist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 