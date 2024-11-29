'use client'

import { useSupabase } from './use-supabase'
import { User } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'

export function useUser() {
  const [user, setUser] = useState<User | null>(null)
  const supabase = useSupabase()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  return { user }
}