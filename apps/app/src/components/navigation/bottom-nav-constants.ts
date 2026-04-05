import type { ComponentType } from "react";
import {
  // IconCompassDrawing,
  IconBookmarkFill,
  IconWalletBifoldFill,
  IconSafariFill,
  IconHouseFill,
} from "symbols-react";
import { isAlphaFeaturesEnabled } from "@/lib/feature-flags";
import { getShortcutForRoute } from "@/lib/keyboard-shortcuts";

// Base routes (will be enhanced with watchlist params by components)
export const BASE_ROUTES = {
  overview: "/overview",
  watchlist: "/watchlists",
  screener: "/screener",
} as const;
  
export const MENU_ITEMS = [
  {
    title: "Overview",
    href: "/overview",
    icon: IconHouseFill,
  },
  {
    title: "Watchlists",
    href: "/watchlists",
    icon: IconBookmarkFill,
  },
  {
    title: "Screener",
    href: "/screener",
    icon: IconSafariFill,
  },
] as const;
  
const watchlistCommandItem = {
  title: "Watchlists",
  subtitle: "Your cryptocurrency watchlist",
  href: "/watchlists",
  icon: IconBookmarkFill,
  shortcut: getShortcutForRoute("/watchlists"),
} as const;

const screenerCommandItem = {
  title: "Screener",
  subtitle: "Filter and browse all watchlist coins",
  href: "/screener",
  icon: IconSafariFill,
  shortcut: getShortcutForRoute("/screener"),
} as const;

const overviewCommandItem = {
  title: "Overview",
  subtitle: "View dashboard and watchlist",
  href: "/overview",
  icon: IconHouseFill,
  shortcut: getShortcutForRoute("/overview"),
} as const;

const quickActionItems = [
  {
    title: "Bitcoin Price",
    subtitle: "Get current BTC price",
    action: "bitcoin-price",
    icon: IconSafariFill,
  },
  {
    title: "Ethereum Price",
    subtitle: "Get current ETH price",
    action: "ethereum-price",
    icon: IconSafariFill,
  },
  {
    title: "Market Overview",
    subtitle: "Top 10 cryptocurrencies",
    action: "market-overview",
    icon: IconWalletBifoldFill,
  },
] as const;

export const COMMAND_ITEMS = isAlphaFeaturesEnabled()
  ? ([
      {
        group: "Navigation",
        items: [watchlistCommandItem, screenerCommandItem],
      },
    ] as const)
  : ([
      {
        group: "Navigation",
        items: [overviewCommandItem, watchlistCommandItem, screenerCommandItem],
      },
      {
        group: "Quick Actions",
        items: quickActionItems,
      },
    ] as const);
  
  export type NavigationItem = {
    title: string;
    subtitle: string;
    href: string;
    icon: ComponentType<{ className?: string }>;
    shortcut?: string;
  };
  
  export type ActionItem = {
    title: string;
    subtitle: string;
    action: string;
    icon: ComponentType<{ className?: string }>;
  };
  
  export type CommandItem = NavigationItem | ActionItem;