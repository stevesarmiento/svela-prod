'use client'

import { useState, useCallback } from 'react'
import { toast } from "@v1/ui/use-toast"
import type { CoinMarketData } from '@/types/coins'

interface UseWatchlistSelectionProps {
  selectedGroup: any;
  removeFromSelectedGroup: (coinId: string) => Promise<void>;
  removeFromWatchlist: (coinId: string) => Promise<void>;
  removeBulkFromSelectedGroup: (coinIds: string[]) => Promise<void>;
  removeBulkFromWatchlist: (coinIds: string[]) => Promise<void>;
  filteredCoins: CoinMarketData[];
}

export function useWatchlistSelection({
  selectedGroup,
  removeFromSelectedGroup,
  removeFromWatchlist,
  removeBulkFromSelectedGroup,
  removeBulkFromWatchlist,
  filteredCoins,
}: UseWatchlistSelectionProps) {
  const [selectedCoins, setSelectedCoins] = useState<Set<string>>(new Set())
  const [removingCoins, setRemovingCoins] = useState<Set<string>>(new Set())
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)

  // Create stable remove handler with optimistic updates
  const handleRemove = useCallback(async (coinId: number | string) => {
    const coinIdStr = coinId.toString();
    setRemovingCoins(prev => new Set([...prev, coinIdStr]));
    
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

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedCoins(new Set(filteredCoins.map(coin => coin.id.toString())));
    } else {
      setSelectedCoins(new Set());
    }
  }, [filteredCoins]);

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
    hoveredRowId,
    setHoveredRowId,
    handleRemove,
    handleCoinSelect,
    handleSelectAll,
    handleRemoveSelected,
    hasSelectedCoins,
  };
}
