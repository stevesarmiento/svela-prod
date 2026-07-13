"use client";

import { useMemo } from 'react';
import { COMMAND_ITEMS } from '../components/navigation/bottom-nav-constants';
import {
  IconChartBar,
  IconChartLineUptrendXyaxis,
  IconEye,
} from 'symbols-react';
import type React from 'react';

interface ContextualCommand {
  title: string;
  subtitle: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  action?: string;
  href?: string;
  shortcut?: string;
}

interface ContextualCommandGroup {
  group: string;
  items: ContextualCommand[];
}

type CommandContext = 'overview' | 'watchlist' | 'charts' | null;

export function useContextualCommands(searchQuery: string, context: CommandContext = null) {
  const contextualCommands = useMemo((): ContextualCommandGroup[] => {
    if (!context) {
      return [];
    }

    switch (context) {
      case 'overview':
        return [
          {
            group: "Market Insights",
            items: [
              {
                title: "Top Gainers",
                subtitle: "View biggest gainers today",
                icon: IconChartLineUptrendXyaxis,
                action: "top-gainers"
              },
              {
                title: "Market Overview",
                subtitle: "See market summary",
                icon: IconChartBar,
                action: "market-overview"
              },
              {
                title: "Trending Tokens",
                subtitle: "Most searched tokens",
                icon: IconEye,
                action: "trending-tokens"
              }
            ]
          }
        ];

      // The watchlist context has no extra commands today: its palette is the
      // coin search in "add to watchlist" mode. (Former entries here — add
      // token, sort, export, clear — were unimplemented placeholders.)
      case 'watchlist':
        return [];

      case 'charts':
        return [
          {
            group: "Charts",
            items: [
              {
                title: "Bitcoin Chart",
                subtitle: "View BTC price chart",
                icon: IconChartBar,
                href: "/watchlists/1"
              },
              {
                title: "Ethereum Chart",
                subtitle: "View ETH price chart",
                icon: IconChartBar,
                href: "/watchlists/1027"
              }
            ]
          }
        ];

      default:
        return [];
    }
  }, [context]);

  // Filter contextual commands based on search query
  const filteredContextualCommands = useMemo(() => {
    if (!searchQuery.trim()) {
      return contextualCommands;
    }
    
    const lowerQuery = searchQuery.toLowerCase();
    
    return contextualCommands.map(group => ({
      ...group,
      items: group.items.filter(item => 
        item.title.toLowerCase().includes(lowerQuery) ||
        item.subtitle?.toLowerCase().includes(lowerQuery)
      )
    })).filter(group => group.items.length > 0);
  }, [contextualCommands, searchQuery]);

  // Also get global commands (filtered)
  const globalCommands = useMemo(() => {
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

  return {
    contextualCommands: filteredContextualCommands,
    globalCommands,
    hasContextualCommands: contextualCommands.length > 0,
    context
  };
}