'use client'

import { useUser as useClerkUser } from '@clerk/nextjs'

export function useUser() {
  const { user, isLoaded } = useClerkUser()
  
  return { 
    user, 
    isLoading: !isLoaded 
  }
}