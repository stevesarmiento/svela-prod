'use client'

import { useState, useCallback } from 'react'
import { toast } from "@v1/ui/use-toast"

interface UseWatchlistSelectionProps {
  removalScope?: "selectedGroupOrDefault" | "everywhere";
  selectedGroup: unknown;
  removeFromSelectedGroup: (coinId: string) => Promise<void>;
  removeFromWatchlist: (coinId: string) => Promise<void>;
  removeBulkFromSelectedGroup: (coinIds: string[]) => Promise<void>;
  removeBulkFromWatchlist: (coinIds: string[]) => Promise<void>;
  removeFromAllWatchlists?: (coinId: string) => Promise<unknown>;
  removeBulkFromAllWatchlists?: (coinIds: string[]) => Promise<unknown>;
}

export function useWatchlistSelection({
  removalScope = "selectedGroupOrDefault",
  selectedGroup,
  removeFromSelectedGroup,
  removeFromWatchlist,
  removeBulkFromSelectedGroup,
  removeBulkFromWatchlist,
  removeFromAllWatchlists,
  removeBulkFromAllWatchlists,
}: UseWatchlistSelectionProps) {
  const [selectedCoins, setSelectedCoins] = useState<Set<string>>(new Set())
  const [removingCoins, setRemovingCoins] = useState<Set<string>>(new Set())

  // Create stable remove handler with optimistic updates
  const handleRemove = useCallback(async (coinId: number | string) => {
    const coinIdStr = coinId.toString();
    setRemovingCoins(prev => {
      const newSet = new Set(prev);
      newSet.add(coinIdStr);
      return newSet;
    });
    
    try {
      if (removalScope === "everywhere") {
        if (!removeFromAllWatchlists) throw new Error("removeFromAllWatchlists is required");
        await removeFromAllWatchlists(coinIdStr);
      } else {
        // Use group-specific remove function if a group is selected
        if (selectedGroup) {
          await removeFromSelectedGroup(coinIdStr);
        } else {
          await removeFromWatchlist(coinIdStr);
        }
      }
      
      toast({
        title: "Removed",
        description:
          removalScope === "everywhere"
            ? "Coin removed from all watchlists"
            : "Coin removed from watchlist",
      });
    } finally {
      setRemovingCoins(prev => {
        const newSet = new Set(prev);
        newSet.delete(coinIdStr);
        return newSet;
      });
    }
  }, [
    selectedGroup,
    removeFromSelectedGroup,
    removeFromWatchlist,
    removalScope,
    removeFromAllWatchlists,
  ]);

  // Selection handlers
  const handleCoinSelect = useCallback((coinId: string, selected: boolean) => {
    setSelectedCoins(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(coinId);
      } else {
        newSet.delete(coinId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback((checked: boolean, coinIds?: string[]) => {
    if (checked && coinIds) {
      setSelectedCoins(new Set(coinIds));
    } else {
      setSelectedCoins(new Set());
    }
  }, []);

  const handleRemoveSelected = useCallback(async () => {
    const coinIdsToRemove = Array.from(selectedCoins);
    setRemovingCoins(new Set(coinIdsToRemove));
    
    try {
      if (removalScope === "everywhere") {
        if (!removeBulkFromAllWatchlists) throw new Error("removeBulkFromAllWatchlists is required");
        await removeBulkFromAllWatchlists(coinIdsToRemove);
      } else {
        // Use group-specific bulk remove function if a group is selected
        if (selectedGroup) {
          await removeBulkFromSelectedGroup(coinIdsToRemove);
        } else {
          await removeBulkFromWatchlist(coinIdsToRemove);
        }
      }
      setSelectedCoins(new Set());
      toast({
        title: "Success",
        description:
          removalScope === "everywhere"
            ? `Removed ${selectedCoins.size} coins from all watchlists`
            : `Removed ${selectedCoins.size} coins from watchlist`,
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to remove selected coins",
        variant: "destructive",
      });
    } finally {
      setRemovingCoins(new Set());
    }
  }, [
    selectedCoins,
    selectedGroup,
    removeBulkFromSelectedGroup,
    removeBulkFromWatchlist,
    removalScope,
    removeBulkFromAllWatchlists,
  ]);

  const hasSelectedCoins = selectedCoins.size > 0;

  return {
    selectedCoins,
    setSelectedCoins,
    removingCoins,
    setRemovingCoins,
    handleRemove,
    handleCoinSelect,
    handleSelectAll,
    handleRemoveSelected,
    hasSelectedCoins,
  };
}
