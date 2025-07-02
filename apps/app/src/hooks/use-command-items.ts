"use client";

import { useMemo } from 'react';
import { COMMAND_ITEMS } from '../components/navigation/bottom-nav-constants';

export function useCommandItems(searchQuery: string) {
  return useMemo(() => {
    if (!searchQuery.trim()) {
      return COMMAND_ITEMS;
    }
    
    const lowerQuery = searchQuery.toLowerCase();
    
    return COMMAND_ITEMS.map(group => ({
      ...group,
      items: group.items.filter(item => 
        item.title.toLowerCase().includes(lowerQuery) ||
        item.subtitle?.toLowerCase().includes(lowerQuery)
      )
    })).filter(group => group.items.length > 0);
  }, [searchQuery]);
}