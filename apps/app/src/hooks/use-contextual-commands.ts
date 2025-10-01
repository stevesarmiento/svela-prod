"use client";

import { useMemo } from 'react';
import { COMMAND_ITEMS } from '../components/navigation/bottom-nav-constants';
import { 
  IconPlus, 
  IconTrash, 
  IconArrowDownLeftArrowUpRight, 

  IconChartBar,

  IconChartLineUptrendXyaxis,
  IconGear,
  IconBell,
  IconEye,
  IconTrayAndArrowDown
} from 'symbols-react';
import React from 'react';

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

type CommandContext = 'overview' | 'watchlist' | 'charts' | 'portfolio' | null;

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

      case 'watchlist':
        return [
          {
            group: "Watchlist Actions",
            items: [
              {
                title: "Add Token",
                subtitle: "Add a new token to watchlist",
                icon: IconPlus,
                action: "add-token",
                shortcut: "a"
              },
              {
                title: "Sort by Price",
                subtitle: "Sort watchlist by price",
                icon: IconArrowDownLeftArrowUpRight,
                action: "sort-price",
                shortcut: "s"
              },
              {
                title: "Export Watchlist",
                subtitle: "Download as CSV",
                icon: IconTrayAndArrowDown,
                action: "export-watchlist"
              },
              {
                title: "Clear All",
                subtitle: "Remove all from watchlist",
                icon: IconTrash,
                action: "clear-watchlist"
              }
            ]
          }
        ];

      case 'charts':
        return [
          {
            group: "Charts",
            items: [
              {
                title: "Bitcoin Chart",
                subtitle: "View BTC price chart",
                icon: IconChartBar,
                href: "/charts/1"
              },
              {
                title: "Ethereum Chart",
                subtitle: "View ETH price chart",
                icon: IconChartBar,
                href: "/charts/1027"
              },
              {
                title: "Trending Charts",
                subtitle: "Most viewed charts",
                icon: IconChartLineUptrendXyaxis,
                action: "trending-charts"
              }
            ]
          }
        ];

      case 'portfolio':
        return [
          {
            group: "Settings",
            items: [
              {
                title: "Notifications",
                subtitle: "Manage notification settings",
                icon: IconBell,
                action: "notifications-settings"
              },
              {
                title: "Preferences",
                subtitle: "App preferences",
                icon: IconGear,
                action: "app-preferences"
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