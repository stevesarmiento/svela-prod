'use client'

import { useState, useCallback, useMemo } from 'react'
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
import { Textarea } from '@v1/ui/textarea'
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

interface WatchlistGroup {
  _id: string
  name: string
  slug: string
  description?: string
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
  onSelect 
}: {
  group: WatchlistGroup
  onEdit: (group: WatchlistGroup) => void
  onDelete: (group: WatchlistGroup) => void
  onSelect?: (group: WatchlistGroup) => void
}) {
  const groupWatchlist = useWatchlistByGroup(group._id)
  const coinIds = useMemo(() => {
    return groupWatchlist?.map(item => Number(item.coinId)) || []
  }, [groupWatchlist])
  
  const { data: coins = [] } = useWatchlistCoins(coinIds)
  
  return (
    <WatchlistCard
      group={group}
      coins={coins}
      onEdit={onEdit}
      onDelete={onDelete}
      onSelect={onSelect}
    />
  )
}

export function WatchlistsGrid({ onSelectWatchlist }: WatchlistsGridProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<WatchlistGroup | null>(null)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')

  // Hooks
  const watchlistGroups = useWatchlistGroups()
  const createWatchlistGroup = useCreateWatchlistGroup()
  const updateWatchlistGroup = useUpdateWatchlistGroup()
  const deleteWatchlistGroup = useDeleteWatchlistGroup()

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
      await createWatchlistGroup(newName.trim(), newDescription.trim() || undefined)
      toast({
        title: "Success",
        description: "Watchlist created successfully",
      })
      setIsCreateDialogOpen(false)
      setNewName('')
      setNewDescription('')
    } catch (error) {
      console.error('Failed to create watchlist:', error)
      toast({
        title: "Error",
        description: "Failed to create watchlist",
        variant: "destructive",
      })
    }
  }, [newName, newDescription, createWatchlistGroup])

  const handleEditWatchlist = useCallback(async () => {
    if (!editingGroup || !newName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a watchlist name",
        variant: "destructive",
      })
      return
    }

    try {
      await updateWatchlistGroup(
        editingGroup._id, 
        newName.trim(), 
        newDescription.trim() || undefined
      )
      toast({
        title: "Success",
        description: "Watchlist updated successfully",
      })
      setIsEditDialogOpen(false)
      setEditingGroup(null)
      setNewName('')
      setNewDescription('')
    } catch (error) {
      console.error('Failed to update watchlist:', error)
      toast({
        title: "Error",
        description: "Failed to update watchlist",
        variant: "destructive",
      })
    }
  }, [editingGroup, newName, newDescription, updateWatchlistGroup])

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
    setNewDescription('')
    setIsCreateDialogOpen(true)
  }, [])

  const openEditDialog = useCallback((group: WatchlistGroup) => {
    setEditingGroup(group)
    setNewName(group.name)
    setNewDescription(group.description || '')
    setIsEditDialogOpen(true)
  }, [])

  if (!watchlistGroups) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted-foreground">Loading watchlists...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with create button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Watchlists</h2>
          <p className="text-sm text-muted-foreground">
            Manage your cryptocurrency watchlists
          </p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="w-4 h-4" />
          Create Watchlist
        </Button>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {watchlistGroups.map((group) => (
            <WatchlistGroupWithCoins
              key={group._id}
              group={group}
              onEdit={openEditDialog}
              onDelete={handleDeleteWatchlist}
              onSelect={onSelectWatchlist}
            />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Watchlist</DialogTitle>
            <DialogDescription>
              Create a new watchlist to organize your cryptocurrency investments.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Brief description of this watchlist"
                maxLength={200}
                rows={3}
              />
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

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Watchlist</DialogTitle>
            <DialogDescription>
              Update your watchlist name and description.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Watchlist name"
                maxLength={50}
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Description (optional)</Label>
              <Textarea
                id="edit-description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Brief description of this watchlist"
                maxLength={200}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditWatchlist}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 