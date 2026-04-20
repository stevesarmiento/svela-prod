"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { SvelaLogo } from "@v1/ui/svela-logo";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@v1/ui/button";
import { TopNavShell } from "./top-nav-shell";

function loadTopNavProfileClient() {
  return import("./top-nav-profile-client");
}

function loadTopNavChartHeader() {
  return import("./top-nav-chart-header");
}

function loadTopNavChartActions() {
  return import("./top-nav-chart-actions");
}

const LazyTopNavProfileClient = dynamic(
  () =>
    loadTopNavProfileClient().then((module) => module.TopNavProfileClient),
  {
    ssr: false,
    loading: () => <ProfileLauncherButton />,
  },
);

const LazyTopNavChartHeader = dynamic(
  () => loadTopNavChartHeader().then((module) => module.TopNavChartHeader),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-4">
        <div className="h-8 w-8 rounded-xl bg-zinc-950/10 dark:bg-white/10" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-zinc-950/10 dark:bg-white/10" />
          <div className="space-y-2">
            <div className="h-4 w-16 rounded bg-zinc-950/10 dark:bg-white/10" />
            <div className="h-3 w-28 rounded bg-zinc-950/10 dark:bg-white/10" />
          </div>
        </div>
      </div>
    ),
  },
);

const LazyTopNavChartActions = dynamic(
  () =>
    loadTopNavChartActions().then((module) => module.TopNavChartActions),
  {
    ssr: false,
    loading: () => (
      <>
        <div className="h-7 w-20 rounded-lg bg-zinc-950/10 dark:bg-white/10" />
        <div className="h-7 w-7 rounded-lg bg-zinc-950/10 dark:bg-white/10" />
      </>
    ),
  },
);

function getChartCoinId(pathname: string): string | null {
  const pathSegments = pathname.split("/").filter((segment) => segment.length > 0);
  if (!pathSegments.includes("charts")) return null;

  const chartsIndex = pathSegments.indexOf("charts");
  return pathSegments[chartsIndex + 1] ?? null;
}

function getRouteGreeting(pathname: string): string {
  const cleanPath = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/";

  if (
    cleanPath === "/watchlists" ||
    cleanPath.startsWith("/watchlists/") ||
    cleanPath === "/watchlist" ||
    cleanPath.startsWith("/watchlist/") ||
    cleanPath === "/" ||
    cleanPath === "/overview" ||
    cleanPath.startsWith("/overview/")
  ) {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    if (hour < 21) return "Good evening";
    return "Welcome";
  }

  const routeGreetings: Record<string, string> = {
    "/screener": "Market Screener",
  };

  if (routeGreetings[cleanPath]) return routeGreetings[cleanPath];

  for (const [route, greeting] of Object.entries(routeGreetings)) {
    if (cleanPath.startsWith(`${route}/`)) return greeting;
  }

  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Welcome";
}

function getStaticRouteGreeting(pathname: string): string | null {
  const cleanPath = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/";

  if (
    cleanPath === "/watchlists" ||
    cleanPath.startsWith("/watchlists/") ||
    cleanPath === "/watchlist" ||
    cleanPath.startsWith("/watchlist/") ||
    cleanPath === "/" ||
    cleanPath === "/overview" ||
    cleanPath.startsWith("/overview/")
  ) {
    return null;
  }

  const routeGreetings: Record<string, string> = {
    "/screener": "Market Screener",
  };

  if (routeGreetings[cleanPath]) return routeGreetings[cleanPath];
  for (const [route, greeting] of Object.entries(routeGreetings)) {
    if (cleanPath.startsWith(`${route}/`)) return greeting;
  }
  return null;
}

function ProfileLauncherButton(props: {
  onIntent?: () => void;
  onClick?: () => void;
}) {
  return (
    <Button
      variant="ghost"
      className="relative h-8 w-8"
      onPointerEnter={props.onIntent}
      onFocus={props.onIntent}
      onTouchStart={props.onIntent}
      onClick={props.onClick}
      aria-label="Open profile"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-md shadow-sm shadow-black/30 ring-1 ring-black/10 dark:ring-white/10 transition-all ease-in-out duration-150 bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
        U
      </div>
    </Button>
  );
}

export function TopNav() {
  const pathname = usePathname();
  const [hasHydrated, setHasHydrated] = useState(false);
  const [overviewGreeting, setOverviewGreeting] = useState<string | null>(null);
  const [shouldLoadProfile, setShouldLoadProfile] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const cleanPath = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/";
  const coinId = useMemo(() => getChartCoinId(pathname), [pathname]);
  const isChartDetailPage = coinId !== null;
  const isOverviewRoute =
    cleanPath === "/watchlists" ||
    cleanPath.startsWith("/watchlists/") ||
    cleanPath === "/watchlist" ||
    cleanPath.startsWith("/watchlist/") ||
    cleanPath === "/" ||
    cleanPath === "/overview" ||
    cleanPath.startsWith("/overview/");
  const staticGreeting = getStaticRouteGreeting(pathname);

  useEffect(() => {
    setHasHydrated(true);

    if (!isOverviewRoute) {
      setOverviewGreeting(null);
    } else {
      setOverviewGreeting(getRouteGreeting(pathname));
    }
  }, [isOverviewRoute, pathname]);

  const preloadProfile = useCallback(() => {
    if (shouldLoadProfile) return;
    setShouldLoadProfile(true);
    void loadTopNavProfileClient();
  }, [shouldLoadProfile]);

  const handleOpenProfile = useCallback(() => {
    preloadProfile();
    setIsProfileOpen(true);
  }, [preloadProfile]);

  const leftSlot = useMemo(() => {
    if (isChartDetailPage) {
      return <LazyTopNavChartHeader />;
    }

    return (
      <>
        <Link
          href="/overview"
          className="opacity-50 hover:opacity-100 transition-opacity duration-150 hover:scale-105"
        >
          <SvelaLogo width={25} height={25} adaptive={true} />
        </Link>
        <span className="text-xl font-diatype-bold text-zinc-950 dark:text-white">
          {isOverviewRoute
            ? hasHydrated
              ? overviewGreeting ?? "Good morning"
              : overviewGreeting ?? "Good morning"
            : staticGreeting ?? "Watchlist"}
        </span>
      </>
    );
  }, [
    hasHydrated,
    isChartDetailPage,
    isOverviewRoute,
    overviewGreeting,
    staticGreeting,
  ]);

  const rightSlot = isChartDetailPage && coinId ? (
    <LazyTopNavChartActions coinId={coinId} />
  ) : shouldLoadProfile ? (
    <LazyTopNavProfileClient
      open={isProfileOpen}
      onOpenChange={setIsProfileOpen}
    />
  ) : (
    <ProfileLauncherButton
      onIntent={preloadProfile}
      onClick={handleOpenProfile}
    />
  );

  return <TopNavShell leftSlot={leftSlot} rightSlot={rightSlot} />;
}
