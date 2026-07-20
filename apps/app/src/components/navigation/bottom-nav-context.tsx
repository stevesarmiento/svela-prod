'use client'

import { createContext, use, useState, useCallback, useMemo, type ReactNode, type Dispatch, type SetStateAction } from 'react'

export type BottomNavMode = 'navigation' | 'selection'
export type CommandContext = 'overview' | 'watchlist' | 'charts'

export interface SelectionState {
  selectedCoins: Set<string>
  totalCoins: number
  onSelectAll: (checked: boolean) => void
  /** Absent when the hosting table is read-only (e.g. the screener) — the dock hides Remove. */
  onRemoveSelected?: () => void
  isRemoving: boolean
  /** Present when the hosting table supports multi-token analysis. */
  onAnalyzeSelected?: () => void
  /** Distinct selected coin count (comparison-table keys are groupId:coinId). */
  analyzeSelectedCount?: number
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

interface BottomNavActionsType {
  setNavigationMode: () => void
  setSelectionMode: (state: SelectionState) => void
  setIsCommandOpen: Dispatch<SetStateAction<boolean>>
  setCommandContext: Dispatch<SetStateAction<CommandContext | null>>
  openCommandSearch: () => void
  openContextualCommandSearch: (context: CommandContext) => void
}

const BottomNavContext = createContext<BottomNavContextType | undefined>(undefined)

// Actions only — the value is referentially stable for the provider's lifetime,
// so consumers of this context NEVER re-render when nav state changes. Prefer
// this in components that only trigger nav behavior (e.g. heavy chart views).
const BottomNavActionsContext = createContext<BottomNavActionsType | undefined>(undefined)

// Mode only — flips just on navigation/selection transitions. Tables watching
// for selection-mode exit subscribe here instead of BottomNavContext, whose
// value also changes on every selectionState update (which those same tables
// trigger per row click — subscribing there re-renders the whole table twice
// per click).
const BottomNavModeContext = createContext<BottomNavMode | undefined>(undefined)

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

  // Every member is a stable useCallback/useState setter, so this value never
  // changes identity — actions-only consumers never re-render from nav state.
  const actionsValue = useMemo(() => ({
    setNavigationMode,
    setSelectionMode,
    setIsCommandOpen,
    setCommandContext,
    openCommandSearch,
    openContextualCommandSearch,
  }), [setNavigationMode, setSelectionMode, openCommandSearch, openContextualCommandSearch])

  const contextValue = useMemo(() => ({
    mode,
    selectionState,
    isCommandOpen,
    commandContext,
    ...actionsValue,
  }), [mode, selectionState, isCommandOpen, commandContext, actionsValue])

  return (
    <BottomNavActionsContext.Provider value={actionsValue}>
      <BottomNavModeContext.Provider value={mode}>
        <BottomNavContext.Provider value={contextValue}>
          {children}
        </BottomNavContext.Provider>
      </BottomNavModeContext.Provider>
    </BottomNavActionsContext.Provider>
  )
}

/**
 * Current nav mode with render isolation: consumers re-render only when the
 * mode itself flips, not on selectionState/command-palette updates.
 */
export function useBottomNavMode(): BottomNavMode {
  const mode = use(BottomNavModeContext)
  if (mode === undefined) {
    throw new Error('useBottomNavMode must be used within a BottomNavProvider')
  }
  return mode
}

/**
 * Nav actions without state subscription: never triggers a re-render.
 * Use this from components that only need to open/close nav surfaces.
 */
export function useBottomNavActions() {
  const context = use(BottomNavActionsContext)
  if (context === undefined) {
    throw new Error('useBottomNavActions must be used within a BottomNavProvider')
  }
  return context
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
