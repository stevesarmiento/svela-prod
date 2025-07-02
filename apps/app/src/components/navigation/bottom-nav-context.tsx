'use client'

import { createContext, useContext, useState, useCallback, useMemo, ReactNode, Dispatch, SetStateAction } from 'react'

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
}

const BottomNavContext = createContext<BottomNavContextType | undefined>(undefined)

export function BottomNavProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<BottomNavMode>('navigation')
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null)
  const [isCommandOpen, setIsCommandOpen] = useState(false)
  const [commandContext, setCommandContext] = useState<CommandContext | null>(null)

  const setNavigationMode = useCallback(() => {
    setMode('navigation')
    setSelectionState(null)
  }, [])

  const setSelectionMode = useCallback((state: SelectionState) => {
    setMode('selection')
    setSelectionState(state)
  }, [])

  const openCommandSearch = useCallback(() => {
    setCommandContext(null)
    setIsCommandOpen(true)
  }, [])

  const openContextualCommandSearch = useCallback((context: CommandContext) => {
    setCommandContext(context)
    setIsCommandOpen(true)
  }, [])

  const contextValue = useMemo(() => ({
    mode,
    selectionState,
    setNavigationMode,
    setSelectionMode,
    isCommandOpen,
    setIsCommandOpen,
    commandContext,
    setCommandContext,
    openCommandSearch,
    openContextualCommandSearch,
  }), [mode, selectionState, setNavigationMode, setSelectionMode, isCommandOpen, commandContext, openCommandSearch, openContextualCommandSearch])

  return (
    <BottomNavContext.Provider value={contextValue}>
      {children}
    </BottomNavContext.Provider>
  )
}

export function useBottomNav() {
  const context = useContext(BottomNavContext)
  if (context === undefined) {
    throw new Error('useBottomNav must be used within a BottomNavProvider')
  }
  return context
}