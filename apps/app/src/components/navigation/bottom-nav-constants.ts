import { 
    IconDistributeHorizontalCenterFill,  
    IconGear,
    IconChartLineUptrendXyaxis,
    IconStarFill,
    IconCaptionsBubbleFill,
    IconBinocularsFill,
  } from "symbols-react";
  
  export const MENU_ITEMS = [
    {
      title: "Overview",
      href: "/overview",
      icon: IconCaptionsBubbleFill,
    },
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
      title: "Settings",
      href: "/settings",
      icon: IconGear,
    },
  ] as const;
  
  export const COMMAND_ITEMS = [
    {
      group: "Navigation",
      items: [
        {
          title: "Overview",
          subtitle: "View dashboard and chat",
          href: "/overview",
          icon: IconCaptionsBubbleFill,
        },
        {
          title: "Watchlist",
          subtitle: "Your cryptocurrency watchlist",
          href: "/watchlist",
          icon: IconBinocularsFill,
        },
        {
          title: "Charts",
          subtitle: "Price charts and market data",
          href: "/charts",
          icon: IconDistributeHorizontalCenterFill,
        },
        {
          title: "Settings",
          subtitle: "App preferences and configuration",
          href: "/settings",
          icon: IconGear,
        },
      ]
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
          icon: IconStarFill,
        },
      ]
    }
  ];
  
  export type NavigationItem = {
    title: string;
    subtitle: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
  };
  
  export type ActionItem = {
    title: string;
    subtitle: string;
    action: string;
    icon: React.ComponentType<{ className?: string }>;
  };
  
  export type CommandItem = NavigationItem | ActionItem;