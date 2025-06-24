'use client'

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react'

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
}

const BottomNavContext = createContext<BottomNavContextType | undefined>(undefined)

export function BottomNavProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<BottomNavMode>('navigation')
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null)

  const setNavigationMode = useCallback(() => {
    setMode('navigation')
    setSelectionState(null)
  }, [])

  const setSelectionMode = useCallback((state: SelectionState) => {
    setMode('selection')
    setSelectionState(state)
  }, [])

  const contextValue = useMemo(() => ({
    mode,
    selectionState,
    setNavigationMode,
    setSelectionMode,
  }), [mode, selectionState, setNavigationMode, setSelectionMode])

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