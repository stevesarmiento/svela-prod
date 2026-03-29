'use client'

import type React from 'react'
import { createContext, useContext, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { useUser } from '@clerk/nextjs'
import { useQueryState } from 'nuqs'
import type { WatchlistGroup as WatchlistGroupModel } from '@/lib/effect/watchlist-models'
import { env } from '@/env.mjs'
import type { Preloaded } from "convex/react"
import { usePreloadedQuery, useQuery } from "convex/react"
import { api } from "../../../../../../convex/_generated/api"
import {
  useWatchlist as useConvexWatchlist, 
  useWatchlistGroups,
  useWatchlistByGroup,
  useWatchlistBySlug,
  useAddToWatchlistGroup, 
  useRemoveFromWatchlistGroup, 
  useRemoveBulkFromWatchlist 
} from '@/lib/convex-hooks'

export type WatchlistGroup = WatchlistGroupModel

interface WatchlistContextType {
  // MIGRATED TO COINGECKO: Now uses string IDs instead of numeric IDs
  watchlist: string[] // CoinGecko string IDs (e.g., ["bitcoin", "ethereum"])
  isLoading: boolean
  isInitialized: boolean
  addToWatchlist: (coinId: string) => Promise<void> // CoinGecko string ID
  removeFromWatchlist: (coinId: string) => Promise<void> // CoinGecko string ID
  removeBulkFromWatchlist: (coinIds: string[]) => Promise<void> // CoinGecko string IDs
  
  // Multiple watchlist groups
  watchlistGroups: WatchlistGroup[]
  selectedGroup: WatchlistGroup | null
  selectedGroupCoins: string[] // CoinGecko string IDs
  isGroupsLoading: boolean
  selectWatchlistGroup: (group: WatchlistGroup | null) => void
  addToSelectedGroup: (coinId: string) => Promise<void> // CoinGecko string ID
  removeFromSelectedGroup: (coinId: string) => Promise<void> // CoinGecko string ID
  removeBulkFromSelectedGroup: (coinIds: string[]) => Promise<void> // CoinGecko string IDs
}

const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined)

const isDebug = env.NODE_ENV === "development"

export function WatchlistProvider(props: {
  children: React.ReactNode
  preloadedBootstrap?: Preloaded<typeof api.watchlists.getMyWatchlistBootstrap>
}) {
  if (props.preloadedBootstrap) {
    return (
      <WatchlistProviderPreloaded preloadedBootstrap={props.preloadedBootstrap}>
        {props.children}
      </WatchlistProviderPreloaded>
    )
  }
  return <WatchlistProviderLive>{props.children}</WatchlistProviderLive>
}

function WatchlistProviderPreloaded(props: {
  children: React.ReactNode
  preloadedBootstrap: Preloaded<typeof api.watchlists.getMyWatchlistBootstrap>
}) {
  const { user, isLoaded } = useUser()
  const bootstrap = usePreloadedQuery(props.preloadedBootstrap)

  const addToConvexWatchlistGroup = useAddToWatchlistGroup()
  const removeFromConvexWatchlistGroup = useRemoveFromWatchlistGroup()
  const removeBulkFromConvexWatchlist = useRemoveBulkFromWatchlist()

  const watchlistGroups = bootstrap.groups
  const defaultGroupSlug = bootstrap.defaultGroup?.slug ?? ""
  const defaultWatchlistItems = bootstrap.defaultItems

  const watchlist = useMemo(() => {
    if (Array.isArray(defaultWatchlistItems) && isLoaded) return defaultWatchlistItems.map((item) => item.coinId)
    if (isLoaded && !user) return []
    return []
  }, [defaultWatchlistItems, isLoaded, user])

  const isInitialized = useMemo(() => isLoaded, [isLoaded])

  const [selectedGroupSlug, setSelectedGroupSlug] = useQueryState('wg', {
    defaultValue: defaultGroupSlug,
    shallow: false,
  })

  const selectedGroup = useMemo(() => {
    if (!selectedGroupSlug || !watchlistGroups) return null
    return watchlistGroups.find(g => g.slug === selectedGroupSlug) || null
  }, [selectedGroupSlug, watchlistGroups])

  const shouldUseBootstrapItems = Boolean(
    selectedGroupSlug &&
      bootstrap.defaultGroup?.slug &&
      selectedGroupSlug === bootstrap.defaultGroup.slug
  )

  const selectedGroupData = useQuery(
    api.watchlists.getMyWatchlistBySlug,
    !shouldUseBootstrapItems && selectedGroupSlug ? { slug: selectedGroupSlug } : "skip",
  ) as { group: WatchlistGroup; items: Array<{ coinId: string }> } | null | undefined

  const effectiveWatchlist = shouldUseBootstrapItems
    ? defaultWatchlistItems
    : selectedGroupData?.items

  const selectedGroupCoins = useMemo(() => {
    if (effectiveWatchlist && Array.isArray(effectiveWatchlist)) return effectiveWatchlist.map(item => item.coinId)
    if (selectedGroup) return []
    return []
  }, [effectiveWatchlist, selectedGroup])

  const addToWatchlist = useCallback(async (coinId: string) => {
    if (!user) throw new Error('Not authenticated')
    await addToConvexWatchlistGroup(coinId)
  }, [user, addToConvexWatchlistGroup])

  const removeFromWatchlist = useCallback(async (coinId: string) => {
    if (!user) return
    await removeFromConvexWatchlistGroup(coinId)
  }, [user, removeFromConvexWatchlistGroup])

  const removeBulkFromWatchlist = useCallback(async (coinIds: string[]) => {
    if (!user) return
    await removeBulkFromConvexWatchlist(coinIds)
  }, [user, removeBulkFromConvexWatchlist])

  const selectWatchlistGroup = useCallback((group: WatchlistGroup | null) => {
    if (isDebug) console.log('Selecting watchlist group:', group?.name)
    setSelectedGroupSlug(group?.slug || '')
  }, [setSelectedGroupSlug])

  const addToSelectedGroup = useCallback(async (coinId: string) => {
    if (!user || !selectedGroup) throw new Error('Not authenticated or no group selected')
    await addToConvexWatchlistGroup(coinId, selectedGroup._id)
  }, [user, selectedGroup, addToConvexWatchlistGroup])

  const removeFromSelectedGroup = useCallback(async (coinId: string) => {
    if (!user || !selectedGroup) return
    await removeFromConvexWatchlistGroup(coinId, selectedGroup._id)
  }, [user, selectedGroup, removeFromConvexWatchlistGroup])

  const removeBulkFromSelectedGroup = useCallback(async (coinIds: string[]) => {
    if (!user || !selectedGroup) return
    await Promise.all(coinIds.map((coinId) => removeFromConvexWatchlistGroup(coinId, selectedGroup._id)))
  }, [user, selectedGroup, removeFromConvexWatchlistGroup])

  const isLoading = !isLoaded
  const isGroupsLoading = watchlistGroups.length === 0 && !isLoaded

  const contextValue = useMemo(() => ({
    watchlist,
    isLoading: isLoading || false,
    isInitialized,
    addToWatchlist,
    removeFromWatchlist,
    removeBulkFromWatchlist,
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

  const Provider = WatchlistContext.Provider as React.FC<{ value: WatchlistContextType; children: ReactNode }>;
  return (
    <Provider value={contextValue}>
      {props.children}
    </Provider>
  )
}

function WatchlistProviderLive({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser()
  
  // Legacy hooks
  const convexWatchlist = useConvexWatchlist() as Array<{ coinId: string }> | undefined
  const addToConvexWatchlistGroup = useAddToWatchlistGroup()
  const removeFromConvexWatchlistGroup = useRemoveFromWatchlistGroup()
  const removeBulkFromConvexWatchlist = useRemoveBulkFromWatchlist()
  
  // New hooks for multiple groups
  const watchlistGroups = useWatchlistGroups() as WatchlistGroup[] | undefined
  
  // ✅ IMPROVED: Derive state instead of using useState + useEffect
  // MIGRATED TO COINGECKO: Convert Convex watchlist data to CoinGecko string array
  const watchlist = useMemo(() => {
    if (Array.isArray(convexWatchlist) && isLoaded) {
      const coinIds = convexWatchlist.map(item => item.coinId) // Keep as CoinGecko string IDs
      return coinIds
    }if (isLoaded && !user) {
      // User not logged in
      return []
    }
    return []
  }, [convexWatchlist, isLoaded, user])
  
  // ✅ IMPROVED: Derive initialization state directly
  const isInitialized = useMemo(() => isLoaded, [isLoaded])
  
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
  
  const selectedGroupData = useWatchlistBySlug(selectedGroupSlug) as
    | { group: WatchlistGroup; items: Array<{ coinId: string }> }
    | null
    | undefined
  const selectedGroupWatchlist = selectedGroupData?.items

  const selectedGroupWatchlistById = useWatchlistByGroup(selectedGroup?._id) as Array<{ coinId: string }> | undefined
  
  const effectiveWatchlist = selectedGroupWatchlist || selectedGroupWatchlistById
  
  const selectedGroupCoins = useMemo(() => {
    
    if (effectiveWatchlist && Array.isArray(effectiveWatchlist)) {
      const coinIds = effectiveWatchlist.map(item => item.coinId) // Keep as CoinGecko string IDs
      return coinIds
    }if (selectedGroup) {
      return []
    }
      return []
  }, [effectiveWatchlist, selectedGroup])


  // Auto-select default group when groups load and no group is selected via URL
  useEffect(() => {
    if (!watchlistGroups || watchlistGroups.length === 0) return
    
    // If no group is selected via URL, auto-select the default group
    if (!selectedGroupSlug) {
      const defaultGroup = watchlistGroups.find(g => g.isDefault) || watchlistGroups[0]
      if (defaultGroup) {
        if (isDebug) console.log('Auto-selecting default/first group:', defaultGroup.name)
        setSelectedGroupSlug(defaultGroup.slug)
      }
    } else {
      // Validate that the selected group still exists
      const groupExists = watchlistGroups.find(g => g.slug === selectedGroupSlug)
      if (!groupExists) {
        if (isDebug) console.log('Selected group no longer exists, falling back to default')
        const defaultGroup = watchlistGroups.find(g => g.isDefault) || watchlistGroups[0]
        if (defaultGroup) {
          setSelectedGroupSlug(defaultGroup.slug)
        }
      }
    }
  }, [watchlistGroups, selectedGroupSlug, setSelectedGroupSlug])


  // MIGRATED TO COINGECKO: Legacy functions (for backward compatibility)
  const addToWatchlist = useCallback(async (coinId: string) => {
    if (!user) throw new Error('Not authenticated')

    try {
      await addToConvexWatchlistGroup(coinId) // Adds to default group - no conversion needed
    } catch (error) {
      console.error('Error adding to watchlist:', error)
      throw error
    }
  }, [user, addToConvexWatchlistGroup])

  const removeFromWatchlist = useCallback(async (coinId: string) => {
    if (!user) return
    
    try {
      await removeFromConvexWatchlistGroup(coinId) // Removes from default group - no conversion needed
    } catch (error) {
      console.error('Error removing from watchlist:', error)
      throw error;
    }
  }, [user, removeFromConvexWatchlistGroup])

  const removeBulkFromWatchlist = useCallback(async (coinIds: string[]) => {
    if (!user) return
    
    try {
      await removeBulkFromConvexWatchlist(coinIds) // No conversion needed for CoinGecko string IDs
      // State will update automatically via derived watchlist from convexWatchlist
    } catch (error) {
      console.error('Error bulk removing from watchlist:', error)
      throw error;
    }
  }, [user, removeBulkFromConvexWatchlist])

  const selectWatchlistGroup = useCallback((group: WatchlistGroup | null) => {
    if (isDebug) console.log('Selecting watchlist group:', group?.name)
    setSelectedGroupSlug(group?.slug || '')
  }, [setSelectedGroupSlug])

  const addToSelectedGroup = useCallback(async (coinId: string) => {
    if (!user || !selectedGroup) throw new Error('Not authenticated or no group selected')

    try {
      await addToConvexWatchlistGroup(coinId, selectedGroup._id) // No conversion needed
    } catch (error) {
      console.error('Error adding to selected group:', error)
      throw error
    }
  }, [user, selectedGroup, addToConvexWatchlistGroup])

  const removeFromSelectedGroup = useCallback(async (coinId: string) => {
    if (!user || !selectedGroup) return
    
    try {
      await removeFromConvexWatchlistGroup(coinId, selectedGroup._id) // No conversion needed
    } catch (error) {
      console.error('Error removing from selected group:', error)
      throw error;
    }
  }, [user, selectedGroup, removeFromConvexWatchlistGroup])

  const removeBulkFromSelectedGroup = useCallback(async (coinIds: string[]) => {
    if (!user || !selectedGroup) return
    
    try {
      // Remove each CoinGecko coin individually from the selected group
      await Promise.all(
        coinIds.map(coinId => 
          removeFromConvexWatchlistGroup(coinId, selectedGroup._id) // No conversion needed
        )
      )
      // State will update automatically via derived selectedGroupCoins from effectiveWatchlist
    } catch (error) {
      console.error('Error bulk removing from selected group:', error)
      throw error;
    }
  }, [user, selectedGroup, removeFromConvexWatchlistGroup])

  const isLoading = !isLoaded || (user && convexWatchlist === undefined && !isInitialized)
  const isGroupsLoading = !watchlistGroups

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

  const Provider = WatchlistContext.Provider as React.FC<{ value: WatchlistContextType; children: ReactNode }>;
  return (
    <Provider value={contextValue}>
      {children}
    </Provider>
  )
}

export function useWatchlist() {
  const context = useContext(WatchlistContext)
  if (context === undefined) {
    throw new Error('useWatchlist must be used within a WatchlistProvider')
  }
  return context
}