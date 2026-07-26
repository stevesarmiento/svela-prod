'use client'

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { useReducedMotion } from "motion/react"
import {
  useBottomNavActions,
  useBottomNavMode,
} from "@/components/navigation/bottom-nav-context"
import {
  DURATION_UI_S,
  EASE_IN_OUT_CUBIC,
  motionDuration,
} from "@/lib/motion-tokens"

// Sonner is the toast system actually mounted in the app (NotifToaster in
// providers.tsx) — the legacy @v1/ui/use-toast calls render nowhere. Lazy
// import matches the screener's pattern.
function notifySuccess(message: string) {
  void import("sonner").then(({ toast }) => {
    toast.message(message)
  })
}

function notifyError(message: string, description: string) {
  void import("sonner").then(({ toast }) => {
    toast.error(message, { description })
  })
}

/**
 * Hover-revealed row-selection motion (same implementation as the old
 * watchlist table): the checkbox sits absolutely at the cell's left edge and
 * slides in while the cell content shifts right. When any row is selected the
 * reveal state is locked open for all rows (selection mode).
 */
export const SELECT_CELL_VARIANTS = {
  rest: {},
  revealed: {},
} as const

export const SELECT_CHECKBOX_VARIANTS = {
  rest: { opacity: 0, x: -20, pointerEvents: "none" as const },
  revealed: { opacity: 1, x: 0, pointerEvents: "auto" as const },
} as const

export const SELECT_CONTENT_VARIANTS = {
  rest: { x: 0, opacity: 1 },
  revealed: { x: 40, opacity: 0.9 },
} as const

/** Tween used by the hover-reveal checkbox/content slide. */
export function useSelectRevealTransition() {
  const shouldReduceMotion = useReducedMotion()
  return useMemo(
    () => ({
      type: "tween" as const,
      duration: motionDuration(shouldReduceMotion, DURATION_UI_S),
      ease: EASE_IN_OUT_CUBIC,
    }),
    [shouldReduceMotion],
  )
}

interface UseWatchlistSelectionProps {
  /**
   * Perform the actual bulk removal for the selected ids; throw on failure.
   * Omit for read-only tables (e.g. the screener) — the dock then hides its
   * Remove button.
   */
  removeSelected?: (ids: string[]) => Promise<void>;
}

export interface WatchlistSelection {
  selectedCoins: Set<string>
  setSelectedCoins: Dispatch<SetStateAction<Set<string>>>
  handleCoinSelect: (coinId: string, selected: boolean) => void
  handleSelectAll: (checked: boolean, coinIds?: string[]) => void
  handleRemoveSelected: () => Promise<void>
  isRemoving: boolean
  hasSelectedCoins: boolean
  /** False when the hosting table can't remove rows (no removeSelected given). */
  canRemove: boolean
}

/**
 * Row multi-selection + bulk removal for token tables. Pairs with the bottom
 * nav's selection mode via `useBottomNavSelectionBridge`.
 */
export function useWatchlistSelection({
  removeSelected,
}: UseWatchlistSelectionProps): WatchlistSelection {
  const [selectedCoins, setSelectedCoins] = useState<Set<string>>(new Set())
  const [removingCoins, setRemovingCoins] = useState<Set<string>>(new Set())

  const handleCoinSelect = useCallback((coinId: string, selected: boolean) => {
    setSelectedCoins(prev => {
      const newSet = new Set(prev)
      if (selected) {
        newSet.add(coinId)
      } else {
        newSet.delete(coinId)
      }
      return newSet
    })
  }, [])

  const handleSelectAll = useCallback((checked: boolean, coinIds?: string[]) => {
    if (checked && coinIds) {
      setSelectedCoins(new Set(coinIds))
    } else {
      setSelectedCoins(new Set())
    }
  }, [])

  const handleRemoveSelected = useCallback(async () => {
    if (!removeSelected) return
    const idsToRemove = Array.from(selectedCoins)
    if (idsToRemove.length === 0) return
    setRemovingCoins(new Set(idsToRemove))

    try {
      await removeSelected(idsToRemove)
      setSelectedCoins(new Set())
      notifySuccess(
        `Removed ${idsToRemove.length} ${idsToRemove.length === 1 ? "coin" : "coins"} from watchlist`,
      )
    } catch {
      notifyError("Error", "Failed to remove selected coins")
    } finally {
      setRemovingCoins(new Set())
    }
  }, [selectedCoins, removeSelected])

  return {
    selectedCoins,
    setSelectedCoins,
    handleCoinSelect,
    handleSelectAll,
    handleRemoveSelected,
    isRemoving: removingCoins.size > 0,
    hasSelectedCoins: selectedCoins.size > 0,
    canRemove: Boolean(removeSelected),
  }
}

export interface SelectionBridgeOptions {
  /**
   * Opens the analysis dialog for the current selection. Routed through a ref
   * — the caller's identity may be unstable.
   */
  onAnalyzeSelected?: () => void
  /** Distinct coin count for the Analyze cap (primitive; safe effect dep). */
  analyzeSelectedCount?: number
}

/**
 * Mirrors a table's row selection into the bottom nav's selection mode
 * (`SelectionState` in bottom-nav-context.tsx) and keeps the two in sync:
 *
 * - any selection flips the dock into its red selection UI; empty exits it
 * - releases the nav if the table unmounts mid-selection
 * - prunes selected ids that no longer exist in `selectableIds`
 * - clears local selection when the nav exits without us (Escape shortcut)
 */
export function useBottomNavSelectionBridge(
  selection: WatchlistSelection,
  selectableIds: string[],
  options?: SelectionBridgeOptions,
) {
  const {
    selectedCoins,
    setSelectedCoins,
    isRemoving,
    hasSelectedCoins,
    canRemove,
  } = selection
  // Actions are render-isolated (stable identity) and mode only flips on
  // enter/exit. Subscribing to the full BottomNavContext here would re-render
  // the consuming table on every selectionState update — i.e. a second full
  // table render per row click (the table's own setState + the context echo).
  const { setSelectionMode, setNavigationMode } = useBottomNavActions()
  const mode = useBottomNavMode()

  const selectableIdSet = useMemo(
    () => new Set(selectableIds),
    [selectableIds],
  )

  // The bridge effect below feeds these into the nav context. Route them
  // through refs so the effect deps are state values only — an unstable
  // callback identity from a caller must not re-fire setSelectionMode every
  // render (nav context update -> caller re-render -> infinite loop). Synced
  // in an effect so render stays pure; the refs are only read from the dock's
  // event handlers, which fire after commit.
  const selectionRef = useRef(selection)
  const selectableIdsRef = useRef(selectableIds)
  useEffect(() => {
    selectionRef.current = selection
    selectableIdsRef.current = selectableIds
  }, [selection, selectableIds])

  // Adapt to SelectionState.onSelectAll(checked) — the bottom nav doesn't know
  // the row ids.
  const onSelectAll = useCallback((checked: boolean) => {
    selectionRef.current.handleSelectAll(checked, selectableIdsRef.current)
  }, [])

  const onRemoveSelected = useCallback(() => {
    void selectionRef.current.handleRemoveSelected()
  }, [])

  // Same ref treatment for the optional analyze callback: only the boolean
  // presence and the count (primitives) enter the effect deps below.
  const onAnalyzeSelectedRef = useRef(options?.onAnalyzeSelected)
  const analyzeCallback = options?.onAnalyzeSelected
  useEffect(() => {
    onAnalyzeSelectedRef.current = analyzeCallback
  }, [analyzeCallback])
  const hasAnalyze = Boolean(options?.onAnalyzeSelected)
  const analyzeSelectedCount = options?.analyzeSelectedCount

  const onAnalyzeSelected = useCallback(() => {
    onAnalyzeSelectedRef.current?.()
  }, [])

  // Sync selection state into the bottom navigation (external system).
  useEffect(() => {
    if (selectedCoins.size > 0) {
      setSelectionMode({
        selectedCoins,
        totalCoins: selectableIds.length,
        onSelectAll,
        onRemoveSelected: canRemove ? onRemoveSelected : undefined,
        isRemoving,
        onAnalyzeSelected: hasAnalyze ? onAnalyzeSelected : undefined,
        analyzeSelectedCount: hasAnalyze
          ? (analyzeSelectedCount ?? selectedCoins.size)
          : undefined,
      })
    } else {
      setNavigationMode()
    }
  }, [
    selectedCoins,
    selectableIds.length,
    onSelectAll,
    onRemoveSelected,
    canRemove,
    isRemoving,
    hasAnalyze,
    onAnalyzeSelected,
    analyzeSelectedCount,
    setSelectionMode,
    setNavigationMode,
  ])

  // Release the nav if the table unmounts mid-selection (navigating away).
  const hasSelectedRef = useRef(false)
  useEffect(() => {
    hasSelectedRef.current = hasSelectedCoins
  }, [hasSelectedCoins])
  useEffect(
    () => () => {
      if (hasSelectedRef.current) setNavigationMode()
    },
    [setNavigationMode],
  )

  // Prune selected ids that no longer exist (row removed elsewhere, another
  // tab, the bulk delete itself, or its section collapsed). Skip while the set
  // is empty: data queries re-key during refetch, so `selectableIds` is
  // transiently [] and pruning then would wipe a live selection.
  useEffect(() => {
    if (selectableIdSet.size === 0) return
    // react-doctor-disable-next-line react-doctor/no-pass-data-to-parent -- guarded functional reconcile of caller-owned selection; deriving in render would wipe live selection during transient empty refetch
    setSelectedCoins((prev) => {
      if (prev.size === 0) return prev
      const next = new Set([...prev].filter((id) => selectableIdSet.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [selectableIdSet, setSelectedCoins])

  // The nav's Escape shortcut only calls setNavigationMode() — it never clears
  // our local selection. Mirror a selection → navigation transition into a
  // local clear so rows don't stay checked/dimmed.
  const prevModeRef = useRef(mode)
  useEffect(() => {
    const prevMode = prevModeRef.current
    prevModeRef.current = mode
    if (prevMode === 'selection' && mode === 'navigation') {
      // react-doctor-disable-next-line react-doctor/no-pass-data-to-parent -- mirrors external nav-context exit event into caller-owned state; hook owns the subscription so tables do not re-render per nav update
      setSelectedCoins((prev) => (prev.size > 0 ? new Set<string>() : prev))
    }
  }, [mode, setSelectedCoins])
}
