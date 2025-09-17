'use client'

import { createContext, use, useState, useCallback, useMemo, ReactNode, Dispatch, SetStateAction, useTransition, useDeferredValue } from 'react'

export type BottomNavMode = 'navigation' | 'selection'
export type CommandContext = 'overview' | 'watchlist' | 'charts' | 'settings'

export interface SelectionState {
  selectedCoins: Set<string>
  totalCoins: number
  onSelectAll: (checked: boolean) => void
  onRemoveSelected: () => void
  isRemoving: boolean
}

interface BottomNavContextType {
  mode: BottomNavMode
  selectionState: SelectionState | null
  setNavigationMode: () => void
  setSelectionMode: (state: SelectionState) => void
  isCommandOpen: boolean
  setIsCommandOpen: Dispatch<SetStateAction<boolean>>
  commandContext: CommandContext | null
  setCommandContext: Dispatch<SetStateAction<CommandContext | null>>
  openCommandSearch: () => void
  openContextualCommandSearch: (context: CommandContext) => void
  isChatOpen: boolean
  setIsChatOpen: Dispatch<SetStateAction<boolean>>
  openChat: () => void
  closeChat: () => void
  isPending: boolean
}

const BottomNavContext = createContext<BottomNavContextType | undefined>(undefined)

export function BottomNavProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<BottomNavMode>('navigation')
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null)
  const [isCommandOpen, setIsCommandOpen] = useState(false)
  const [commandContext, setCommandContext] = useState<CommandContext | null>(null)
  const [isChatOpen, setIsChatOpen] = useState(false)
  
  // React 19: Enhanced concurrent features
  const [isPending, startTransitionHook] = useTransition()
  
  // React 19: Defer expensive state updates for better performance
  const deferredMode = useDeferredValue(mode)
  const deferredSelectionState = useDeferredValue(selectionState)

  const setNavigationMode = useCallback(() => {
    startTransitionHook(() => {
      setMode('navigation')
      setSelectionState(null)
    })
  }, [startTransitionHook])

  const setSelectionMode = useCallback((state: SelectionState) => {
    startTransitionHook(() => {
      setMode('selection')
      setSelectionState(state)
    })
  }, [startTransitionHook])

  const openCommandSearch = useCallback(() => {
    startTransitionHook(() => {
      setCommandContext(null)
      setIsCommandOpen(true)
      setIsChatOpen(false) // Close chat when opening command search
    })
  }, [startTransitionHook])

  const openContextualCommandSearch = useCallback((context: CommandContext) => {
    startTransitionHook(() => {
      setCommandContext(context)
      setIsCommandOpen(true)
      setIsChatOpen(false) // Close chat when opening contextual search
    })
  }, [startTransitionHook])

  const openChat = useCallback(() => {
    startTransitionHook(() => {
      setIsChatOpen(true)
      setIsCommandOpen(false) // Close command search when opening chat
      setCommandContext(null)
    })
  }, [startTransitionHook])

  const closeChat = useCallback(() => {
    startTransitionHook(() => {
      setIsChatOpen(false)
    })
  }, [startTransitionHook])

  const contextValue = useMemo(() => ({
    mode: deferredMode, // React 19: Use deferred values for better performance
    selectionState: deferredSelectionState,
    setNavigationMode,
    setSelectionMode,
    isCommandOpen,
    setIsCommandOpen,
    commandContext,
    setCommandContext,
    openCommandSearch,
    openContextualCommandSearch,
    isChatOpen,
    setIsChatOpen,
    openChat,
    closeChat,
    isPending, // React 19: Expose pending state for UI feedback
  }), [
    deferredMode, 
    deferredSelectionState, 
    setNavigationMode, 
    setSelectionMode, 
    isCommandOpen, 
    commandContext, 
    openCommandSearch, 
    openContextualCommandSearch, 
    isChatOpen, 
    openChat, 
    closeChat,
    isPending
  ])

  return (
    <BottomNavContext.Provider value={contextValue}>
      {children}
    </BottomNavContext.Provider>
  )
}

// React 19: Enhanced context consumption with use() hook
export function useBottomNav() {
  const context = use(BottomNavContext)
  if (context === undefined) {
    throw new Error('useBottomNav must be used within a BottomNavProvider')
  }
  return context
}

// React 19: Selective context hooks for better performance
export function useNavigationMode() {
  const context = use(BottomNavContext)
  if (context === undefined) {
    throw new Error('useNavigationMode must be used within a BottomNavProvider')
  }
  return { 
    mode: context.mode, 
    setNavigationMode: context.setNavigationMode,
    isPending: context.isPending
  }
}

export function useSelectionMode() {
  const context = use(BottomNavContext)
  if (context === undefined) {
    throw new Error('useSelectionMode must be used within a BottomNavProvider')
  }
  return { 
    selectionState: context.selectionState, 
    setSelectionMode: context.setSelectionMode,
    isPending: context.isPending
  }
}

export function useOverlayState() {
  const context = use(BottomNavContext)
  if (context === undefined) {
    throw new Error('useOverlayState must be used within a BottomNavProvider')
  }
  return { 
    isCommandOpen: context.isCommandOpen, 
    isChatOpen: context.isChatOpen,
    setIsCommandOpen: context.setIsCommandOpen,
    setIsChatOpen: context.setIsChatOpen,
    isPending: context.isPending
  }
}

export function useCommandContext() {
  const context = use(BottomNavContext)
  if (context === undefined) {
    throw new Error('useCommandContext must be used within a BottomNavProvider')
  }
  return {
    commandContext: context.commandContext,
    setCommandContext: context.setCommandContext,
    openCommandSearch: context.openCommandSearch,
    openContextualCommandSearch: context.openContextualCommandSearch,
    isPending: context.isPending
  }
}

export function useChatContext() {
  const context = use(BottomNavContext)
  if (context === undefined) {
    throw new Error('useChatContext must be used within a BottomNavProvider')
  }
  return {
    isChatOpen: context.isChatOpen,
    openChat: context.openChat,
    closeChat: context.closeChat,
    isPending: context.isPending
  }
}