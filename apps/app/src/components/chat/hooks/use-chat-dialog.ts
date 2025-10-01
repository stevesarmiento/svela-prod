'use client'

import { useRef, useCallback } from 'react'
import { useAuth } from '@v1/convex/hooks'
import { autoCleanupSessionMemories, bulkCleanupMemories } from '@/lib/client-memory-utils'

export function useChatDialog() {
  const { user } = useAuth()
  const isOpenRef = useRef<boolean>(false)

  // Cleanup function for when dialog closes
  const bulkDeleteChatMemories = useCallback(async () => {
    if (!user?.id) return

    try {
      console.log('🧹 Starting bulk cleanup of chat memories...')
      await bulkCleanupMemories(user.id, {})
      console.log('✅ Chat memories cleaned up successfully')
    } catch (error) {
      console.error('❌ Failed to bulk cleanup chat memories:', error)
    }
  }, [user?.id])

  const openChatDialog = useCallback(() => {
    if (isOpenRef.current) {
      return
    }
    isOpenRef.current = true
  }, [])

  const closeChatDialog = useCallback(async () => {
    if (!isOpenRef.current) {
      return
    }

    isOpenRef.current = false
    
    // Heavy cleanup operations in background
    if (user?.id) {
      // Use Promise.resolve to ensure these run after the current render cycle
      Promise.resolve().then(async () => {
        try {
          await bulkDeleteChatMemories()
          await autoCleanupSessionMemories(user.id)
        } catch (error) {
          console.error('Failed to cleanup on dialog close:', error)
        }
      })
    }
  }, [user?.id, bulkDeleteChatMemories])

  const handleDialogOpenChange = useCallback(async (open: boolean) => {
    if (!open) {
      await closeChatDialog()
    } else {
      openChatDialog()
    }
  }, [openChatDialog, closeChatDialog])

  return { 
    openChatDialog, 
    closeChatDialog, 
    handleDialogOpenChange,
    isOpen: isOpenRef.current
  }
}
