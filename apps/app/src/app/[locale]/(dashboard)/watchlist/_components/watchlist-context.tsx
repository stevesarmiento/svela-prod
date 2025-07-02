'use client'

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { useUser } from '@clerk/nextjs'
import { useQueryState } from 'nuqs'
import { 
  useWatchlist as useConvexWatchlist, 
  useWatchlistGroups,
  useWatchlistByGroup,
  useWatchlistBySlug,
  useAddToWatchlistGroup, 
  useRemoveFromWatchlistGroup, 
  useRemoveBulkFromWatchlist 
} from '@v1/convex/hooks'

interface WatchlistGroup {
  _id: string
  name: string
  slug: string
  description?: string
  isDefault: boolean
  createdAt: number
  updatedAt: number
}

interface WatchlistContextType {
  // Legacy single watchlist (default group)
  watchlist: number[]
  isLoading: boolean
  isInitialized: boolean
  addToWatchlist: (coinId: number) => Promise<void>
  removeFromWatchlist: (coinId: number) => Promise<void>
  removeBulkFromWatchlist: (coinIds: number[]) => Promise<void>
  
  // Multiple watchlist groups
  watchlistGroups: WatchlistGroup[]
  selectedGroup: WatchlistGroup | null
  selectedGroupCoins: number[]
  isGroupsLoading: boolean
  selectWatchlistGroup: (group: WatchlistGroup | null) => void
  addToSelectedGroup: (coinId: number) => Promise<void>
  removeFromSelectedGroup: (coinId: number) => Promise<void>
  removeBulkFromSelectedGroup: (coinIds: number[]) => Promise<void>
}

const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined)

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser()
  
  // Legacy hooks
  const convexWatchlist = useConvexWatchlist()
  const addToConvexWatchlistGroup = useAddToWatchlistGroup()
  const removeFromConvexWatchlistGroup = useRemoveFromWatchlistGroup()
  const removeBulkFromConvexWatchlist = useRemoveBulkFromWatchlist()
  
  // New hooks for multiple groups
  const watchlistGroups = useWatchlistGroups()
  
  // State
  const [watchlist, setWatchlist] = useState<number[]>([]) // Legacy default watchlist
  const [isInitialized, setIsInitialized] = useState(false)
  const [selectedGroupCoins, setSelectedGroupCoins] = useState<number[]>([])
  
  // URL state for selected group using nuqs (now using slug)
  const [selectedGroupSlug, setSelectedGroupSlug] = useQueryState('wg', {
    defaultValue: '',
    shallow: false, // Ensure updates trigger across components
  })
  
  // Derive selected group from slug and available groups
  const selectedGroup = useMemo(() => {
    if (!selectedGroupSlug || !watchlistGroups) return null
    return watchlistGroups.find(g => g.slug === selectedGroupSlug) || null
  }, [selectedGroupSlug, watchlistGroups])
  
  // Get coins for selected group using slug
  const selectedGroupData = useWatchlistBySlug(selectedGroupSlug)
  const selectedGroupWatchlist = selectedGroupData?.items

  // Fallback: Also get coins by ID as backup in case slug query fails
  const selectedGroupWatchlistById = useWatchlistByGroup(selectedGroup?._id)
  
  // Use slug-based data if available, otherwise fall back to ID-based
  const effectiveWatchlist = selectedGroupWatchlist || selectedGroupWatchlistById

  // Debug logging for slug-based watchlist
  useEffect(() => {
    console.log('WatchlistContext Debug:', {
      selectedGroupSlug,
      selectedGroupData,
      selectedGroupWatchlist,
      selectedGroup: selectedGroup?.name
    })
  }, [selectedGroupSlug, selectedGroupData, selectedGroupWatchlist, selectedGroup])

  // Convert Convex watchlist data to number array (legacy)
  useEffect(() => {
    if (convexWatchlist && isLoaded) {
      console.log('Convex watchlist data:', convexWatchlist)
      const coinIds = convexWatchlist.map(item => Number(item.coinId))
      console.log('Parsed coin IDs:', coinIds)
      setWatchlist(coinIds)
      setIsInitialized(true)
    } else if (isLoaded && !user) {
      // User not logged in
      setWatchlist([])
      setIsInitialized(true)
    }
  }, [convexWatchlist, isLoaded, user])

  // Auto-select default group when groups load and no group is selected via URL
  useEffect(() => {
    if (!watchlistGroups || watchlistGroups.length === 0) return;
    
    // If no group is selected via URL, auto-select the default group
    if (!selectedGroupSlug) {
      const defaultGroup = watchlistGroups.find(g => g.isDefault) || watchlistGroups[0];
      if (defaultGroup) {
        console.log('Auto-selecting default/first group:', defaultGroup.name);
        setSelectedGroupSlug(defaultGroup.slug);
      }
    } else {
      // Validate that the selected group still exists
      const groupExists = watchlistGroups.find(g => g.slug === selectedGroupSlug);
      if (!groupExists) {
        console.log('Selected group no longer exists, falling back to default');
        const defaultGroup = watchlistGroups.find(g => g.isDefault) || watchlistGroups[0];
        if (defaultGroup) {
          setSelectedGroupSlug(defaultGroup.slug);
        }
      }
    }
  }, [watchlistGroups, selectedGroupSlug, setSelectedGroupSlug])

  // Update selected group coins when selection changes
  useEffect(() => {
    console.log('Updating selectedGroupCoins:', {
      hasWatchlist: !!effectiveWatchlist,
      watchlistLength: effectiveWatchlist?.length,
      hasGroup: !!selectedGroup,
      groupName: selectedGroup?.name,
      usingSlugData: !!selectedGroupWatchlist,
      usingIdData: !!selectedGroupWatchlistById
    })
    
    if (effectiveWatchlist && Array.isArray(effectiveWatchlist)) {
      const coinIds = effectiveWatchlist.map(item => Number(item.coinId))
      console.log('Setting selectedGroupCoins to:', coinIds)
      setSelectedGroupCoins(coinIds)
    } else if (selectedGroup) {
      console.log('Setting selectedGroupCoins to empty array for group:', selectedGroup.name)
      setSelectedGroupCoins([])
    } else {
      console.log('No selectedGroup, keeping selectedGroupCoins as is')
    }
  }, [effectiveWatchlist, selectedGroup, selectedGroupWatchlist, selectedGroupWatchlistById])

  // Legacy functions (for backward compatibility)
  const addToWatchlist = useCallback(async (coinId: number) => {
    if (!user) throw new Error('Not authenticated')

    try {
      console.log('Adding coin to default watchlist:', coinId)
      await addToConvexWatchlistGroup(coinId.toString()) // Adds to default group
      // Optimistically update local state
      setWatchlist(prev => [...prev, coinId])
    } catch (error) {
      console.error('Error adding to watchlist:', error)
      throw error
    }
  }, [user, addToConvexWatchlistGroup])

  const removeFromWatchlist = useCallback(async (coinId: number) => {
    if (!user) return

    // Optimistic update
    setWatchlist(prev => prev.filter(id => id !== coinId));
    
    try {
      await removeFromConvexWatchlistGroup(coinId.toString()) // Removes from default group
    } catch (error) {
      // Revert on error
      setWatchlist(prev => [...prev, coinId]);
      throw error;
    }
  }, [user, removeFromConvexWatchlistGroup])

  const removeBulkFromWatchlist = useCallback(async (coinIds: number[]) => {
    if (!user) return

    // Optimistic update
    setWatchlist(prev => prev.filter(id => !coinIds.includes(id)));
    
    try {
      await removeBulkFromConvexWatchlist(coinIds.map(id => id.toString()))
    } catch (error) {
      // Revert on error
      setWatchlist(prev => [...prev, ...coinIds]);
      throw error;
    }
  }, [user, removeBulkFromConvexWatchlist])

  // New group-specific functions
  const selectWatchlistGroup = useCallback((group: WatchlistGroup | null) => {
    console.log('Selecting watchlist group:', group?.name);
    setSelectedGroupSlug(group?.slug || '');
  }, [setSelectedGroupSlug])

  const addToSelectedGroup = useCallback(async (coinId: number) => {
    if (!user || !selectedGroup) throw new Error('Not authenticated or no group selected')

    try {
      console.log('Adding coin to selected group:', coinId, selectedGroup._id)
      await addToConvexWatchlistGroup(coinId.toString(), selectedGroup._id)
      // Optimistically update local state
      setSelectedGroupCoins(prev => [...prev, coinId])
    } catch (error) {
      console.error('Error adding to selected group:', error)
      throw error
    }
  }, [user, selectedGroup, addToConvexWatchlistGroup])

  const removeFromSelectedGroup = useCallback(async (coinId: number) => {
    if (!user || !selectedGroup) return

    // Optimistic update
    setSelectedGroupCoins(prev => prev.filter(id => id !== coinId));
    
    try {
      await removeFromConvexWatchlistGroup(coinId.toString(), selectedGroup._id)
    } catch (error) {
      // Revert on error
      setSelectedGroupCoins(prev => [...prev, coinId]);
      throw error;
    }
  }, [user, selectedGroup, removeFromConvexWatchlistGroup])

  const removeBulkFromSelectedGroup = useCallback(async (coinIds: number[]) => {
    if (!user || !selectedGroup) return

    // Optimistic update
    setSelectedGroupCoins(prev => prev.filter(id => !coinIds.includes(id)));
    
    try {
      // Remove each coin individually from the selected group
      await Promise.all(
        coinIds.map(coinId => 
          removeFromConvexWatchlistGroup(coinId.toString(), selectedGroup._id)
        )
      )
    } catch (error) {
      // Revert on error
      setSelectedGroupCoins(prev => [...prev, ...coinIds]);
      throw error;
    }
  }, [user, selectedGroup, removeFromConvexWatchlistGroup])

  const isLoading = !isLoaded || (user && convexWatchlist === undefined && !isInitialized)
  const isGroupsLoading = !watchlistGroups

  // Debug context values before memoization
  useEffect(() => {
    console.log('Context values before memoization:', {
      watchlist: watchlist.length,
      selectedGroup: selectedGroup?.name,
      selectedGroupCoins: selectedGroupCoins.length,
      isInitialized,
      isGroupsLoading
    })
  }, [watchlist, selectedGroup, selectedGroupCoins, isInitialized, isGroupsLoading])

  // Make sure the context value is memoized
  const contextValue = useMemo(() => ({
    // Legacy
    watchlist, 
    isLoading: isLoading || false, 
    isInitialized,
    addToWatchlist, 
    removeFromWatchlist,
    removeBulkFromWatchlist,
    
    // New group functionality
    watchlistGroups: watchlistGroups || [],
    selectedGroup,
    selectedGroupCoins,
    isGroupsLoading,
    selectWatchlistGroup,
    addToSelectedGroup,
    removeFromSelectedGroup,
    removeBulkFromSelectedGroup
  }), [
    watchlist, isLoading, isInitialized, addToWatchlist, removeFromWatchlist, removeBulkFromWatchlist,
    watchlistGroups, selectedGroup, selectedGroupCoins, isGroupsLoading,
    selectWatchlistGroup, addToSelectedGroup, removeFromSelectedGroup, removeBulkFromSelectedGroup
  ])

  return (
    <WatchlistContext.Provider value={contextValue}>
      {children}
    </WatchlistContext.Provider>
  )
}

export function useWatchlist() {
  const context = useContext(WatchlistContext)
  if (context === undefined) {
    throw new Error('useWatchlist must be used within a WatchlistProvider')
  }
  return context
}