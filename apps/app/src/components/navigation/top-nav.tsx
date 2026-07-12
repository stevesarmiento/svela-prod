"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { SvelaLogo } from "@v1/ui/svela-logo";
import { Avatar, AvatarFallback, AvatarImage } from "@v1/ui/avatar";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Button } from "@v1/ui/button";
import { getUserDisplayName } from "@/lib/user-display";
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

function getRouteGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Welcome";
}

function getStaticRouteTitle(pathname: string): string | null {
  const cleanPath = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/";

  if (
    cleanPath === "/watchlists" ||
    cleanPath.startsWith("/watchlists/") ||
    cleanPath === "/watchlist" ||
    cleanPath.startsWith("/watchlist/")
  ) {
    return "Watchlists";
  }

  const routeTitles: Record<string, string> = {
    "/screener": "Market Screener",
  };

  if (routeTitles[cleanPath]) return routeTitles[cleanPath];
  for (const [route, title] of Object.entries(routeTitles)) {
    if (cleanPath.startsWith(`${route}/`)) return title;
  }
  return null;
}

function ProfileLauncherButton(props: {
  onIntent?: () => void;
  onClick?: () => void;
}) {
  const { user } = useUser();
  const displayName = getUserDisplayName({
    fullName: user?.fullName ?? undefined,
    email: user?.primaryEmailAddress?.emailAddress ?? undefined,
    walletAddress: user?.primaryWeb3Wallet?.web3Wallet ?? undefined,
    fallback: "User",
  });
  const avatarUrl = user?.imageUrl;

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
      <Avatar className="h-8 w-8 rounded-md shadow-sm shadow-black/30 hover:ring-4 ring-1 ring-black/10 dark:ring-white/10 transition-all ease-in-out duration-150">
        {avatarUrl ? (
          <AvatarImage src={avatarUrl} alt={displayName} />
        ) : null}
        <AvatarFallback>
          {displayName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
    </Button>
  );
}

export function TopNav() {
  const pathname = usePathname();
  const { user, isLoaded } = useUser();
  const [hasHydrated, setHasHydrated] = useState(false);
  const [overviewGreeting, setOverviewGreeting] = useState<string | null>(null);
  const [shouldLoadProfile, setShouldLoadProfile] = useState(false);
  const [isProfileReady, setIsProfileReady] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const cleanPath = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/";
  const coinId = useMemo(() => getChartCoinId(pathname), [pathname]);
  const isChartDetailPage = coinId !== null;
  const isOverviewGreetingRoute =
    cleanPath === "/overview" ||
    cleanPath.startsWith("/overview/");
  const staticRouteTitle = getStaticRouteTitle(pathname);
  const displayName = getUserDisplayName({
    fullName: user?.fullName ?? undefined,
    email: user?.primaryEmailAddress?.emailAddress ?? undefined,
    walletAddress: user?.primaryWeb3Wallet?.web3Wallet ?? undefined,
    fallback: "User",
  });
  const firstName = displayName.split(" ")[0] || displayName;
  const showPersonalizedGreeting = hasHydrated && isLoaded && firstName;

  useEffect(() => {
    setHasHydrated(true);

    if (!isOverviewGreetingRoute) {
      setOverviewGreeting(null);
    } else {
      setOverviewGreeting(getRouteGreeting());
    }
  }, [isOverviewGreetingRoute, pathname]);

  const preloadProfile = useCallback(() => {
    if (shouldLoadProfile) return;
    setShouldLoadProfile(true);
    void loadTopNavProfileClient().then(() => {
      setIsProfileReady(true);
    });
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
          {isOverviewGreetingRoute
            ? showPersonalizedGreeting
              ? `${overviewGreeting ?? "Good morning"}, ${firstName}`
              : overviewGreeting ?? "Good morning"
            : staticRouteTitle ?? "Watchlist"}
        </span>
      </>
    );
  }, [
    firstName,
    hasHydrated,
    isChartDetailPage,
    isOverviewGreetingRoute,
    overviewGreeting,
    showPersonalizedGreeting,
    staticRouteTitle,
  ]);

  const rightSlot = isChartDetailPage && coinId ? (
    <LazyTopNavChartActions coinId={coinId} />
  ) : isProfileReady ? (
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
