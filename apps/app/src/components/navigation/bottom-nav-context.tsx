'use client'

import { createContext, use, useState, useCallback, useMemo, type ReactNode, type Dispatch, type SetStateAction } from 'react'

export type BottomNavMode = 'navigation' | 'selection'
export type CommandContext = 'overview' | 'watchlist' | 'charts'

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
  }), [
    mode,
    selectionState,
    setNavigationMode,
    setSelectionMode,
    isCommandOpen,
    commandContext,
    openCommandSearch,
    openContextualCommandSearch,
  ])

  return (
    <BottomNavContext.Provider value={contextValue}>
      {children}
    </BottomNavContext.Provider>
  )
}

export function useBottomNav() {
  const context = use(BottomNavContext)
  if (context === undefined) {
    throw new Error('useBottomNav must be used within a BottomNavProvider')
  }
  return context
}

// Convenience selectors. Note: these all subscribe to the same context, so any
// context change re-renders every consumer — they exist for ergonomics, not
// render isolation. If a consumer ever becomes render-heavy, split the context.
export function useNavigationMode() {
  const { mode, setNavigationMode } = useBottomNav()
  return { mode, setNavigationMode }
}

export function useSelectionMode() {
  const { selectionState, setSelectionMode } = useBottomNav()
  return { selectionState, setSelectionMode }
}

export function useOverlayState() {
  const { isCommandOpen, setIsCommandOpen } = useBottomNav()
  return { isCommandOpen, setIsCommandOpen }
}

export function useCommandContext() {
  const { commandContext, setCommandContext, openCommandSearch, openContextualCommandSearch } = useBottomNav()
  return { commandContext, setCommandContext, openCommandSearch, openContextualCommandSearch }
}
