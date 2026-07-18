'use client'

import { useState, useCallback } from 'react'

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

interface UseWatchlistSelectionProps {
  /** Truthy → bulk removal is scoped to the selected group. */
  selectedGroup: unknown;
  removeBulkFromSelectedGroup: (coinIds: string[]) => Promise<void>;
  removeBulkFromWatchlist: (coinIds: string[]) => Promise<void>;
}

/**
 * Row multi-selection + bulk removal for token tables. Pairs with the bottom
 * nav's selection mode (`SelectionState` in bottom-nav-context.tsx): the
 * consumer mirrors `selectedCoins`/`isRemoving` into `setSelectionMode` and
 * passes `handleRemoveSelected` as `onRemoveSelected`.
 */
export function useWatchlistSelection({
  selectedGroup,
  removeBulkFromSelectedGroup,
  removeBulkFromWatchlist,
}: UseWatchlistSelectionProps) {
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
    const coinIdsToRemove = Array.from(selectedCoins)
    if (coinIdsToRemove.length === 0) return
    setRemovingCoins(new Set(coinIdsToRemove))

    try {
      // Group-scoped bulk remove when a group is selected (mirrors the single
      // remove in multi-line-lightweight.tsx).
      if (selectedGroup) {
        await removeBulkFromSelectedGroup(coinIdsToRemove)
      } else {
        await removeBulkFromWatchlist(coinIdsToRemove)
      }
      setSelectedCoins(new Set())
      notifySuccess(
        `Removed ${coinIdsToRemove.length} ${coinIdsToRemove.length === 1 ? "coin" : "coins"} from watchlist`,
      )
    } catch {
      notifyError("Error", "Failed to remove selected coins")
    } finally {
      setRemovingCoins(new Set())
    }
  }, [
    selectedCoins,
    selectedGroup,
    removeBulkFromSelectedGroup,
    removeBulkFromWatchlist,
  ])

  return {
    selectedCoins,
    setSelectedCoins,
    handleCoinSelect,
    handleSelectAll,
    handleRemoveSelected,
    isRemoving: removingCoins.size > 0,
    hasSelectedCoins: selectedCoins.size > 0,
  }
}
