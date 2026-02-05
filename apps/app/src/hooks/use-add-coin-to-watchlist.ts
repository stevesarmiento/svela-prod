"use client";

import { useState, useCallback } from 'react';
import { useWatchlist } from '../app/[locale]/(dashboard)/watchlist/_components/watchlist-context';
import { useUser } from './use-user';
import { toast } from "@v1/ui/use-toast";
import type { HybridCoinSearchResult } from './use-hybrid-coin-search';

export function useAddCoinToWatchlist() {
  const [isAddingCoin, setIsAddingCoin] = useState(false);
  const { addToWatchlist, addToSelectedGroup, selectedGroup } = useWatchlist();
  const { user } = useUser();

  const handleAddCoin = useCallback(async (coin: HybridCoinSearchResult) => {
    if (!user) {
      toast({
        title: "Error",
        description: "Please sign in to add coins to your watchlist",
        variant: "destructive",
      });
      return false;
    }

    if (isAddingCoin) {
      return false;
    }

    try {
      setIsAddingCoin(true);
      // If a watchlist group is selected, add to that group (charts comparison UX).
      // Otherwise, fall back to the legacy/default watchlist behavior.
      if (selectedGroup) {
        await addToSelectedGroup(coin.id);
      } else {
        await addToWatchlist(coin.id); // Use CoinGecko string ID directly
      }
      
      const targetName = selectedGroup ? selectedGroup.name : "your watchlist"
      toast({
        title: "Success",
        description: `Added ${coin.name} to ${targetName}`,
      });
      
      return true;
    } catch (error) {
      console.error('Error adding coin:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add coin",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsAddingCoin(false);
    }
  }, [user, selectedGroup, addToSelectedGroup, addToWatchlist, isAddingCoin]);

  return {
    handleAddCoin,
    isAddingCoin
  };
}