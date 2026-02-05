'use client'

import { useSyncExternalStore } from 'react'
import { ChatStateManager } from '../chat-state-manager'

/**
 * Optimized hook using useSyncExternalStore for ChatStateManager
 * Replaces manual useEffect subscription patterns with React's optimized external store sync
 * Following React best practices for external state management
 */
export function useChatStateSync() {
  const chatManager = ChatStateManager.getInstance()
  
  return useSyncExternalStore(
    // Subscribe function - how React subscribes to changes
    (callback) => chatManager.subscribe(callback),
    // Snapshot function - how React gets current state
    () => chatManager.getChatState(),
    // Server snapshot - SSR fallback
    () => null
  )
}

/**
 * Optimized hook for just checking if chat is open
 * More efficient than syncing entire state when you only need boolean
 */
export function useChatIsOpen(): boolean {
  const chatState = useChatStateSync()
  return chatState !== null
}
