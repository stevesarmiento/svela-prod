'use client'

import { useState, useCallback } from 'react'
import { toast } from "@v1/ui/use-toast"

interface UseWatchlistSelectionProps {
  selectedGroup: unknown;
  removeFromSelectedGroup: (coinId: string) => Promise<void>;
  removeFromWatchlist: (coinId: string) => Promise<void>;
  removeBulkFromSelectedGroup: (coinIds: string[]) => Promise<void>;
  removeBulkFromWatchlist: (coinIds: string[]) => Promise<void>;
}

export function useWatchlistSelection({
  selectedGroup,
  removeFromSelectedGroup,
  removeFromWatchlist,
  removeBulkFromSelectedGroup,
  removeBulkFromWatchlist,
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
      // Use group-specific remove function if a group is selected
      if (selectedGroup) {
        await removeFromSelectedGroup(coinIdStr);
      } else {
        await removeFromWatchlist(coinIdStr);
      }
      
      toast({
        title: "Removed",
        description: "Coin removed from watchlist",
      });
    } finally {
      setRemovingCoins(prev => {
        const newSet = new Set(prev);
        newSet.delete(coinIdStr);
        return newSet;
      });
    }
  }, [selectedGroup, removeFromSelectedGroup, removeFromWatchlist]);

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
      // Use group-specific bulk remove function if a group is selected
      if (selectedGroup) {
        await removeBulkFromSelectedGroup(coinIdsToRemove);
      } else {
        await removeBulkFromWatchlist(coinIdsToRemove);
      }
      setSelectedCoins(new Set());
      toast({
        title: "Success",
        description: `Removed ${selectedCoins.size} coins from watchlist`,
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
  }, [selectedCoins, selectedGroup, removeBulkFromSelectedGroup, removeBulkFromWatchlist]);

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
