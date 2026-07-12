import type { ComponentType } from "react";
import { BookmarkIcon } from "./bookmark-icon";
import { ExploreIcon } from "./explore-icon";
import { HomeIcon } from "./home-icon";
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
    icon: HomeIcon,
  },
  {
    title: "Watchlists",
    href: "/watchlists",
    icon: BookmarkIcon,
  },
  {
    title: "Screener",
    href: "/screener",
    icon: ExploreIcon,
  },
] as const;
  
const watchlistCommandItem = {
  title: "Watchlists",
  subtitle: "Your cryptocurrency watchlist",
  href: "/watchlists",
  icon: BookmarkIcon,
  shortcut: getShortcutForRoute("/watchlists"),
} as const;

const screenerCommandItem = {
  title: "Screener",
  subtitle: "Filter and browse all watchlist coins",
  href: "/screener",
  icon: ExploreIcon,
  shortcut: getShortcutForRoute("/screener"),
} as const;

const overviewCommandItem = {
  title: "Overview",
  subtitle: "View dashboard and watchlist",
  href: "/overview",
  icon: HomeIcon,
  shortcut: getShortcutForRoute("/overview"),
} as const;

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
    ] as const);

export type NavigationItem = {
  title: string;
  subtitle: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  shortcut?: string;
};
