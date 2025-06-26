"use client";

import { useState, useCallback } from 'react';
import { useWatchlist } from '../app/[locale]/(dashboard)/watchlist/_components/watchlist-context';
import { useUser } from './use-user';
import { toast } from "@v1/ui/use-toast";
import type { CoinSearchResult } from './use-command-search';

export function useAddCoinToWatchlist() {
  const [isAddingCoin, setIsAddingCoin] = useState(false);
  const { addToWatchlist } = useWatchlist();
  const { user } = useUser();

  const handleAddCoin = useCallback(async (coin: CoinSearchResult) => {
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
      await addToWatchlist(Number(coin.id));
      
      toast({
        title: "Success",
        description: `Added ${coin.name} to your watchlist`,
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
  }, [user, addToWatchlist, isAddingCoin]);

  return {
    handleAddCoin,
    isAddingCoin
  };
}