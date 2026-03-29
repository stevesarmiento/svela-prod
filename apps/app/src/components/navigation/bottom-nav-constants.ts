import { 
  // IconCompassDrawing, 
  IconBinocularsFill, 
  IconDistributeHorizontalCenterFill, 
  IconWalletBifoldFill, 
  IconChartLineUptrendXyaxis, 
  IconCaptionsBubbleFill } from "symbols-react";
import { isAlphaFeaturesEnabled } from "@/lib/feature-flags";
import { getShortcutForRoute } from "@/lib/keyboard-shortcuts";

// Base routes (will be enhanced with watchlist params by components)
export const BASE_ROUTES = {
  overview: "/watchlist",
  watchlist: "/watchlist", 
  charts: "/charts",
  portfolio: "/portfolio"
} as const;
  
export const MENU_ITEMS = isAlphaFeaturesEnabled()
  ? ([
      {
        title: "Watchlist",
        href: "/watchlist",
        icon: IconBinocularsFill,
      },
      {
        title: "Charts",
        href: "/charts",
        icon: IconDistributeHorizontalCenterFill,
      },
      {
        title: "Portfolio",
        href: "/portfolio",
        icon: IconWalletBifoldFill,
      },
    ] as const)
  : ([
      {
        title: "Watchlist",
        href: "/watchlist",
        icon: IconBinocularsFill,
      },
      {
        title: "Charts",
        href: "/charts",
        icon: IconDistributeHorizontalCenterFill,
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
            icon: IconBinocularsFill,
            shortcut: getShortcutForRoute("/watchlist"),
          },
          {
            title: "Charts",
            subtitle: "Price charts and market data",
            href: "/charts",
            icon: IconDistributeHorizontalCenterFill,
            shortcut: getShortcutForRoute("/charts"),
          },
          {
            title: "Portfolio",
            subtitle: "Your cryptocurrency portfolio",
            href: "/portfolio",
            icon: IconWalletBifoldFill,
            shortcut: getShortcutForRoute("/portfolio"),
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
            icon: IconBinocularsFill,
            shortcut: getShortcutForRoute("/watchlist"),
          },
          {
            title: "Charts",
            subtitle: "Price charts and market data",
            href: "/charts",
            icon: IconDistributeHorizontalCenterFill,
            shortcut: getShortcutForRoute("/charts"),
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
            icon: IconChartLineUptrendXyaxis,
          },
          {
            title: "Ethereum Price",
            subtitle: "Get current ETH price",
            action: "ethereum-price",
            icon: IconChartLineUptrendXyaxis,
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