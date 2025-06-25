'use client'

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { useUser } from '@clerk/nextjs'
import { useWatchlist as useConvexWatchlist, useAddToWatchlist, useRemoveFromWatchlist, useRemoveBulkFromWatchlist } from '@v1/convex/hooks'

interface WatchlistContextType {
  watchlist: number[]
  isLoading: boolean
  isInitialized: boolean
  addToWatchlist: (coinId: number) => Promise<void>
  removeFromWatchlist: (coinId: number) => Promise<void>
  removeBulkFromWatchlist: (coinIds: number[]) => Promise<void>
}

const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined)

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser()
  const convexWatchlist = useConvexWatchlist()
  const addToConvexWatchlist = useAddToWatchlist()
  const removeFromConvexWatchlist = useRemoveFromWatchlist()
  const removeBulkFromConvexWatchlist = useRemoveBulkFromWatchlist()
  
  const [watchlist, setWatchlist] = useState<number[]>([])
  const [isInitialized, setIsInitialized] = useState(false)

  // Convert Convex watchlist data to number array
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

  // Memoize the add function
  const addToWatchlist = useCallback(async (coinId: number) => {
    if (!user) throw new Error('Not authenticated')

    try {
      console.log('Adding coin to watchlist:', coinId)
      await addToConvexWatchlist(coinId.toString())
      // Optimistically update local state
      setWatchlist(prev => [...prev, coinId])
    } catch (error) {
      console.error('Error adding to watchlist:', error)
      throw error
    }
  }, [user, addToConvexWatchlist])

  // Memoize the remove function
  const removeFromWatchlist = useCallback(async (coinId: number) => {
    if (!user) return

    // Optimistic update
    setWatchlist(prev => prev.filter(id => id !== coinId));
    
    try {
      await removeFromConvexWatchlist(coinId.toString())
    } catch (error) {
      // Revert on error
      setWatchlist(prev => [...prev, coinId]);
      throw error;
    }
  }, [user, removeFromConvexWatchlist])

  // Memoize the bulk remove function
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

  const isLoading = !isLoaded || (user && convexWatchlist === undefined && !isInitialized)

  // Make sure the context value is memoized
  const contextValue = useMemo(() => ({
    watchlist, 
    isLoading: isLoading || false, 
    isInitialized,
    addToWatchlist, 
    removeFromWatchlist,
    removeBulkFromWatchlist
  }), [watchlist, isLoading, isInitialized, addToWatchlist, removeFromWatchlist, removeBulkFromWatchlist])

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