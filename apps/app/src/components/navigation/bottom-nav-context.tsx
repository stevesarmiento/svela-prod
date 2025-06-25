'use client'

import { createContext, useContext, useState, useCallback, useMemo, ReactNode, Dispatch, SetStateAction } from 'react'

export type BottomNavMode = 'navigation' | 'selection'

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
  openCommandSearch: () => void
}

const BottomNavContext = createContext<BottomNavContextType | undefined>(undefined)

export function BottomNavProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<BottomNavMode>('navigation')
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null)
  const [isCommandOpen, setIsCommandOpen] = useState(false)

  const setNavigationMode = useCallback(() => {
    setMode('navigation')
    setSelectionState(null)
  }, [])

  const setSelectionMode = useCallback((state: SelectionState) => {
    setMode('selection')
    setSelectionState(state)
  }, [])

  const openCommandSearch = useCallback(() => {
    setIsCommandOpen(true)
  }, [])

  const contextValue = useMemo(() => ({
    mode,
    selectionState,
    setNavigationMode,
    setSelectionMode,
    isCommandOpen,
    setIsCommandOpen,
    openCommandSearch,
  }), [mode, selectionState, setNavigationMode, setSelectionMode, isCommandOpen, setIsCommandOpen, openCommandSearch])

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