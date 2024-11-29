'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useSupabase } from '@/hooks/use-supabase'
import { useUser } from '@/hooks/use-user'

interface WatchlistContextType {
  watchlist: number[]
  isLoading: boolean
  addToWatchlist: (coinId: number) => Promise<void>
  removeFromWatchlist: (coinId: number) => Promise<void>
}

const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined)

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const [watchlist, setWatchlist] = useState<number[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const supabase = useSupabase()
  const { user } = useUser()

  useEffect(() => {
    let isMounted = true

    async function loadWatchlist() {
      if (!user) {
        if (isMounted) {
          setWatchlist([])
          setIsLoading(false)
        }
        return
      }

      try {
        const { data, error } = await supabase
          .from('watchlists')
          .select('coin_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })

        if (error) throw error
        
        if (isMounted) {
          setWatchlist(data.map(item => Number(item.coin_id)))
          setIsLoading(false)
        }
      } catch (error) {
        console.error('Error loading watchlist:', error)
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadWatchlist()
    return () => { isMounted = false }
  }, [user, supabase])

  
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
    <WatchlistContext.Provider value={{ watchlist, isLoading, addToWatchlist, removeFromWatchlist }}>
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