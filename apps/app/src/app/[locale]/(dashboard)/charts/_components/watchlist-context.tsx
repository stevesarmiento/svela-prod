'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useSupabase } from '@/hooks/use-supabase'
import { useUser } from '@/hooks/use-user'

interface WatchlistContextType {
  watchlist: number[]
  isLoading: boolean
  isInitialized: boolean
  addToWatchlist: (coinId: number) => Promise<void>
  removeFromWatchlist: (coinId: number) => Promise<void>
}

const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined)

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const [watchlist, setWatchlist] = useState<number[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isInitialized, setIsInitialized] = useState(false)
  const supabase = useSupabase()
  const { user, isLoading: isUserLoading } = useUser()

  useEffect(() => {
    let isMounted = true

    // Add the auth check here
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      console.log('Current session:', {
        hasSession: !!session,
        userId: session?.user?.id,
        expiresAt: session?.expires_at
      })
    }
    checkAuth()

    async function loadWatchlist() {
      console.log('loadWatchlist called', {
        isUserLoading,
        user: user?.id,
        isInitialized,
        watchlistLength: watchlist.length
      })

      if (isUserLoading) return

      try {
        if (!user) {
          console.log('No user found in WatchlistProvider')
          if (isMounted) {
            setWatchlist([])
            setIsLoading(false)
            setIsInitialized(true)
          }
          return
        }

        console.log('Fetching watchlist for user:', user.id)
        const { data, error } = await supabase
          .from('watchlists')
          .select('coin_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })

        if (error) {
          console.error('Supabase query error:', error)
          throw error
        }

        console.log('Watchlist data:', data)
        
        if (isMounted) {
          const coinIds = data.map(item => Number(item.coin_id))
          console.log('Parsed coin IDs:', coinIds)
          setWatchlist(coinIds)
          setIsLoading(false)
          setIsInitialized(true)
        }
      } catch (error) {
        console.error('Error loading watchlist:', error)
        if (isMounted) {
          setIsLoading(false)
          setIsInitialized(true)
        }
      }
    }

    loadWatchlist()

    // Set up real-time subscription for watchlist changes
    const channel = supabase
      .channel('watchlist_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'watchlists',
          filter: user ? `user_id=eq.${user.id}` : undefined,
        },
        () => {
          loadWatchlist()
        }
      )
      .subscribe()

    return () => {
      isMounted = false
      channel.unsubscribe()
    }
  }, [user, isUserLoading, supabase, isInitialized, watchlist.length])
  
      const addToWatchlist = async (coinId: number) => {
        if (!user) throw new Error('Not authenticated')
    
        try {
          const { error } = await supabase
            .from('watchlists')
            .insert([{
              coin_id: coinId.toString(),
              user_id: user.id
            }])
    
          if (error) throw error
          setWatchlist(prev => [...prev, coinId])
        } catch (error) {
          console.error('Error adding to watchlist:', error)
          throw error
        }
      }

      async function removeFromWatchlist(coinId: number) {
        if (!user) return
    
        try {
          const { error } = await supabase
            .from('watchlists')
            .delete()
            .eq('user_id', user.id)
            .eq('coin_id', coinId.toString())
    
          if (error) throw error
    
          setWatchlist(prev => prev.filter(id => id !== coinId))
        } catch (error) {
          console.error('Error removing from watchlist:', error)
        }
      }

      return (
        <WatchlistContext.Provider value={{ 
          watchlist, 
          isLoading, 
          isInitialized,
          addToWatchlist, 
          removeFromWatchlist 
        }}>
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