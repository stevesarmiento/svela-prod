import { 
  // IconCompassDrawing, 
  IconBookmarkFill, 
  IconWalletBifoldFill, 
  IconSafariFill, 
  IconCaptionsBubbleFill } from "symbols-react";
import { isAlphaFeaturesEnabled } from "@/lib/feature-flags";
import { getShortcutForRoute } from "@/lib/keyboard-shortcuts";

// Base routes (will be enhanced with watchlist params by components)
export const BASE_ROUTES = {
  overview: "/watchlist",
  watchlist: "/watchlist", 
  screener: "/screener",
} as const;
  
export const MENU_ITEMS = isAlphaFeaturesEnabled()
  ? ([
      {
        title: "Watchlist",
        href: "/watchlist",
        icon: IconBookmarkFill,
      },
      {
        title: "Screener",
        href: "/screener",
        icon: IconSafariFill,
      },
    ] as const)
  : ([
      {
        title: "Watchlist",
        href: "/watchlist",
        icon: IconBookmarkFill,
      },
      {
        title: "Screener",
        href: "/screener",
        icon: IconSafariFill,
      },
    ] as const);
  
export const COMMAND_ITEMS = isAlphaFeaturesEnabled()
  ? ([
      {
        group: "Navigation",
        items: [
          {
            title: "Watchlist",
            subtitle: "Your cryptocurrency watchlist",
            href: "/watchlist",
            icon: IconBookmarkFill,
            shortcut: getShortcutForRoute("/watchlist"),
          },
          {
            title: "Screener",
            subtitle: "Filter and browse all watchlist coins",
            href: "/screener",
            icon: IconSafariFill,
            shortcut: getShortcutForRoute("/screener"),
          },
        ],
      },
    ] as const)
  : ([
      {
        group: "Navigation",
        items: [
          {
            title: "Overview",
            subtitle: "View dashboard and watchlist",
            href: "/watchlist",
            icon: IconCaptionsBubbleFill,
            shortcut: getShortcutForRoute("/watchlist"),
          },
          {
            title: "Watchlist",
            subtitle: "Your cryptocurrency watchlist",
            href: "/watchlist",
            icon: IconBookmarkFill,
            shortcut: getShortcutForRoute("/watchlist"),
          },
          {
            title: "Screener",
            subtitle: "Filter and browse all watchlist coins",
            href: "/screener",
            icon: IconSafariFill,
            shortcut: getShortcutForRoute("/screener"),
          },
        ],
      },
      {
        group: "Quick Actions",
        items: [
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
        ],
      },
    ] as const);
  
  export type NavigationItem = {
    title: string;
    subtitle: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    shortcut?: string;
  };
  
  export type ActionItem = {
    title: string;
    subtitle: string;
    action: string;
    icon: React.ComponentType<{ className?: string }>;
  };
  
  export type CommandItem = NavigationItem | ActionItem;