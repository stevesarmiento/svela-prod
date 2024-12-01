'use client'

import { useSupabase } from './use-supabase'
import { User } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'

export function useUser() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const supabase = useSupabase()

  useEffect(() => {
    let mounted = true

    // Immediately invoke async function
    ;(async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) throw sessionError

        if (session?.user && mounted) {
          console.log('Initial session found:', session.user.id)
          setUser(session.user)
        } else {
          console.log('No initial session found')
          if (mounted) setUser(null)
        }
      } catch (error) {
        console.error('Initial auth error:', error)
        if (mounted) setUser(null)
      } finally {
        if (mounted) setIsLoading(false)
      }
    })()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.id)
        
        if (mounted) {
          if (session?.user) {
            setUser(session.user)
          } else {
            setUser(null)
          }
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [supabase.auth])

  return { user, isLoading }
}