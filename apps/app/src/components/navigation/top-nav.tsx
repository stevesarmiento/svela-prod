"use client";

//import Link from "next/link";
import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
// import { 
//   IconHouseFill, 
//   IconDistributeHorizontalCenterFill,  
//   IconGearshapeFill,
// } from "symbols-react";
import { Button } from "@v1/ui/button";
import { useAuth } from "@/lib/convex-hooks";
import { useUser } from "@clerk/nextjs";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@v1/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@v1/ui/avatar";
import { SignOutButton, useClerk } from "@clerk/nextjs";
import { Fingerprint, LogOut } from "lucide-react";
import { IconChevronBackward, IconGearshapeFill } from 'symbols-react';
import { SvelaLogo } from "@v1/ui/svela-logo";
import { useTokenHeader } from "@/hooks/use-token-header";
import { WatchlistButton } from "./watchlist-button";
import Image from "next/image";
import { useRouter } from "next/navigation";


// const menuItems = [
//   {
//     title: "Overview",
//     href: "/overview",
//     icon: IconHouseFill,
//   },
//   {
//     title: "Price Charts",
//     href: "/charts",
//     icon: IconDistributeHorizontalCenterFill,
//   },
//   {
//     title: "Settings",
//     href: "/settings",
//     icon: IconGearshapeFill,
//   },
// ];

function getRouteGreeting(pathname: string): string {
  // Remove locale prefix if present (e.g., /en/charts -> /charts)
  const cleanPath = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/';
  
  // Special case: Use time-based greeting for watchlist (now the default overview)
  if (cleanPath === '/watchlist' || cleanPath.startsWith('/watchlist/') || cleanPath === '/' || cleanPath === '/overview' || cleanPath.startsWith('/overview/')) {
    const hour = new Date().getHours();
    
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    if (hour < 21) return "Good evening";
    return "Welcome";
  }
  
  const routeGreetings: Record<string, string> = {
    '/charts': 'Charts & Graphs',
    '/settings': 'Settings',
    '/portfolio': 'Portfolio',
  };

  // Check for exact matches first
  if (routeGreetings[cleanPath]) {
    return routeGreetings[cleanPath];
  }

  // Check for partial matches (e.g., /charts/bitcoin -> Charts & Graphs)
  for (const [route, greeting] of Object.entries(routeGreetings)) {
    if (cleanPath.startsWith(route + '/')) {
      return greeting;
    }
  }

  // Default fallback - use time-based greeting for unknown routes during redirect
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Welcome";
}

function getStaticRouteGreeting(pathname: string): string | null {
  // Remove locale prefix if present (e.g., /en/charts -> /charts)
  const cleanPath = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/';

  // Overview/watchlist uses time-based greeting (handled client-side to avoid hydration mismatch)
  if (
    cleanPath === '/watchlist' ||
    cleanPath.startsWith('/watchlist/') ||
    cleanPath === '/' ||
    cleanPath === '/overview' ||
    cleanPath.startsWith('/overview/')
  ) {
    return null;
  }

  const routeGreetings: Record<string, string> = {
    '/charts': 'Charts & Graphs',
    '/settings': 'Settings',
    '/portfolio': 'Portfolio',
  };

  if (routeGreetings[cleanPath]) {
    return routeGreetings[cleanPath];
  }

  for (const [route, greeting] of Object.entries(routeGreetings)) {
    if (cleanPath.startsWith(route + '/')) {
      return greeting;
    }
  }

  return null;
}

export function TopNav() {
  const router = useRouter();
  const { user } = useAuth();
  const { user: clerkUser, isLoaded } = useUser();
  const { openUserProfile } = useClerk();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [overviewGreeting, setOverviewGreeting] = useState<string | null>(null);
  const { isChartDetailPage, tokenData, isLoading } = useTokenHeader();

  // Extract coin ID from pathname for watchlist button
  const coinId = isChartDetailPage ? pathname.split('/').pop() : null;

  // Get current watchlist group parameter to preserve it in back navigation
  const watchlistGroup = searchParams.get('wg');
  const backToWatchlistComparisonUrl = watchlistGroup
    ? `/watchlist?wt=chart&wg=${watchlistGroup}`
    : "/watchlist?wt=chart";

  const handleBack = () => {
    // Prefer history navigation so we restore scroll + prior view state.
    let didPop = false;

    const onPopState = () => {
      didPop = true;
    };

    window.addEventListener("popstate", onPopState, { once: true });
    router.back();

    // If there's no history entry, `router.back()` is a no-op — fall back.
    window.setTimeout(() => {
      if (didPop) return;
      window.removeEventListener("popstate", onPopState);
      router.push(backToWatchlistComparisonUrl);
    }, 200);
  };

  // Check if current route is overview (now watchlist is the default overview)
  const cleanPath = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/';
  const isOverviewRoute = cleanPath === '/watchlist' || cleanPath.startsWith('/watchlist/') || cleanPath === '/' || cleanPath === '/overview' || cleanPath.startsWith('/overview/');

  // Static route greeting (safe to render during SSR without time-based mismatch)
  const staticGreeting = getStaticRouteGreeting(pathname);

  // Update time-based greeting client-side for overview routes (avoids hydration mismatch).
  useEffect(() => {
    if (!isOverviewRoute) {
      setOverviewGreeting(null);
      return;
    }

    setOverviewGreeting(getRouteGreeting(pathname));
  }, [isOverviewRoute, pathname]);

  const handleProfileClick = () => {
    openUserProfile();
  };

  // Use Clerk user data for faster loading, fallback to Convex user
  const userData = clerkUser || user;
  const name = userData?.fullName;
  const firstName = name?.split(' ')[0] || (clerkUser?.primaryEmailAddress?.emailAddress || user?.email)?.split('@')[0];
  const email = clerkUser?.primaryEmailAddress?.emailAddress || user?.email;
  const avatarUrl = clerkUser?.imageUrl || user?.avatarUrl;

  // Don't show greeting with name until user data is loaded
  const showPersonalizedGreeting = isLoaded && firstName;

  return (
    <div className="py-12 px-4">
      <div className="flex h-16 items-center px-4 gap-4">
        {/* Conditional Logo/Token Header */}
        <div className="flex items-center gap-3">
          {isChartDetailPage ? (
            // Token Header with cached data
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleBack}
                className="flex text-gray-600 hover:text-gray-900 dark:text-white/70 dark:hover:text-white hover:bg-primary/5 rounded-xl w-8 h-8 items-center justify-center transition-all duration-150"
                aria-label="Go back"
              >
                <IconChevronBackward className="h-3 w-3 fill-current" />
              </button>
              <div className="flex items-center gap-2">
                {tokenData && !isLoading && (
                  <Image
                    src={tokenData.logoUrl?.startsWith('http') || tokenData.logoUrl?.startsWith('/') ? tokenData.logoUrl : '/favicon.ico'}
                    alt={tokenData.name}
                    className="w-8 h-8 rounded-full ring-1 ring-gray-200 dark:ring-white/10"
                    width={32}
                    height={32}
                    onError={(e) => {
                      // Fallback to a default image if the token logo fails to load
                      const target = e.target as HTMLImageElement;
                      target.src = '/favicon.ico';
                    }}
                    priority={true} // Load token logos with priority
                    placeholder="blur"
                    blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGBkbHB0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q=="
                  />
                )}
                <div className="flex flex-col gap-0">
                  <h1 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {isLoading ? (
                      <div className="h-4 w-16 bg-gray-200 dark:bg-white/10 rounded animate-pulse motion-reduce:animate-none" />
                    ) : (
                      tokenData?.symbol || 'Token Details'
                    )}
                  </h1>
                  <p className="text-xs text-gray-900 dark:text-white">
                    <span className="text-xs text-gray-500 dark:text-white/60">Today is </span> 
                    {new Date().toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            // Default Logo and Greeting
            <>
              <Link href="/watchlist" className="opacity-50 hover:opacity-100 transition-opacity duration-150">
                <SvelaLogo 
                  width={25} 
                  height={25}
                  adaptive={true}
                />
              </Link>
              <span className="text-xl font-bold text-zinc-950 dark:text-white">
                {isOverviewRoute
                  ? showPersonalizedGreeting
                    ? `${overviewGreeting ?? "Good morning"}, ${firstName}`
                    : overviewGreeting ?? "Good morning"
                  : staticGreeting ?? "Watchlist"}
              </span>
            </>
          )}
        </div>

        {/* Navigation menu */}
        {/* <nav className="flex items-center gap-1">
          {menuItems.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                pathname === item.href 
                  ? "bg-accent text-accent-foreground" 
                  : "hover:bg-accent/50"
              }`}
            >
              <item.icon className="size-4" />
              <span className="hidden sm:inline">{item.title}</span>
            </Link>
          ))}
        </nav> */}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right side - Conditional based on page type */}
        {userData && (
          <div className="flex items-center gap-2">
            {isChartDetailPage && coinId && (
              <>
                <WatchlistButton 
                  coinId={coinId} 
                  coinName={tokenData?.name || tokenData?.symbol}
                />
              </>
            )}
            
            {!isChartDetailPage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8">
                  <Avatar className="h-8 w-8 rounded-md shadow-sm shadow-black/30 hover:ring-4 ring-1 ring-black/10 dark:ring-white/10 transition-all ease-in-out duration-150">
                    {avatarUrl && (
                      <AvatarImage 
                        src={avatarUrl} 
                        alt={name || email?.split('@')[0] || 'User'}
                        loading="lazy" // Lazy load user avatars
                      />
                    )}
                    <AvatarFallback>
                      {email ? email.substring(0, 2).toUpperCase() : "UN"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 bg-white dark:bg-zinc-900 rounded-xl z-[101]" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {name || email?.split('@')[0] || 'User'}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/settings')} className="cursor-pointer rounded-xl">
                  <IconGearshapeFill className="mr-2 h-4 w-4 fill-primary/50" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleProfileClick} className="cursor-pointer rounded-xl">
                  <Fingerprint className="mr-2 h-4 w-4 text-primary/50" />
                  Authentication
                </DropdownMenuItem>
                {/* <DropdownMenuItem>
                  <IconGear className="mr-2 h-4 w-4 fill-primary/50" />
                  Settings
                </DropdownMenuItem> */}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer w-full rounded-xl" asChild>
                  <SignOutButton>
                    <button className="w-full text-left flex items-center">
                      <LogOut className="mr-2 h-4 w-4 text-primary/50" />
                      Sign out
                    </button>
                  </SignOutButton>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            )}
          </div>
        )}
      </div>
    </div>
  );
}