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
import { useAuth } from "@v1/convex/hooks";
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
import { IconChevronBackward } from 'symbols-react';
import { SvelaLogo } from "@v1/ui/svela-logo";
import { useTokenHeader } from "@/hooks/use-token-header";
import { WatchlistButton } from "./watchlist-button";
import { AnalysisDialog } from "./analysis-dialog";
import Image from "next/image";


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

export function TopNav() {
  const { user } = useAuth();
  const { user: clerkUser, isLoaded } = useUser();
  const { openUserProfile } = useClerk();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [greeting, setGreeting] = useState("Dashboard");
  const [isMounted, setIsMounted] = useState(false);
  const { isChartDetailPage, tokenData, isLoading } = useTokenHeader();

  // Extract coin ID from pathname for watchlist button
  const coinId = isChartDetailPage ? pathname.split('/').pop() : null;

  // Get current watchlist group parameter to preserve it in back navigation
  const watchlistGroup = searchParams.get('wg');
  const backToChartsUrl = watchlistGroup ? `/charts?wg=${watchlistGroup}` : '/charts';

  // Update greeting based on route after component mounts
  useEffect(() => {
    setIsMounted(true);
    setGreeting(getRouteGreeting(pathname));
  }, [pathname]);

  const handleProfileClick = () => {
    openUserProfile();
  };

  // Use Clerk user data for faster loading, fallback to Convex user
  const userData = clerkUser || user;
  const name = userData?.fullName;
  const firstName = name?.split(' ')[0] || (clerkUser?.primaryEmailAddress?.emailAddress || user?.email)?.split('@')[0];
  const email = clerkUser?.primaryEmailAddress?.emailAddress || user?.email;
  const avatarUrl = clerkUser?.imageUrl || user?.avatarUrl;

  // Check if current route is overview (now watchlist is the default overview)
  const cleanPath = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/';
  const isOverviewRoute = cleanPath === '/watchlist' || cleanPath.startsWith('/watchlist/') || cleanPath === '/' || cleanPath === '/overview' || cleanPath.startsWith('/overview/');

  // Don't show greeting with name until user data is loaded
  const showPersonalizedGreeting = isLoaded && firstName;

  return (
    <div className="py-12 px-4 z-50">
      <div className="flex h-16 items-center px-4 gap-4">
        {/* Conditional Logo/Token Header */}
        <div className="flex items-center gap-3">
          {isChartDetailPage ? (
            // Token Header with cached data
            <div className="flex items-center gap-4">
              <Link href={backToChartsUrl} className="flex text-white/70 hover:text-white hover:bg-primary/5 rounded-xl w-8 h-8 items-center justify-center transition-all duration-150">
                <IconChevronBackward className="h-3 w-3 fill-current" />
              </Link>
              <div className="flex items-center gap-2">
                {tokenData && !isLoading && (
                  <Image
                    src={tokenData.logoUrl}
                    alt={tokenData.name}
                    className="w-8 h-8 rounded-full ring-1 ring-white/10"
                    width={32}
                    height={32}
                    priority={true} // Load token logos with priority
                    placeholder="blur"
                    blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGBkbHB0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q=="
                    onError={(e) => {
                      // Fallback to a default image if the token logo fails to load
                      const target = e.target as HTMLImageElement;
                      target.src = '/favicon.ico';
                    }}
                  />
                )}
                <div className="flex flex-col gap-0">
                  <h1 className="text-sm font-semibold text-white">
                    {isLoading ? (
                      <div className="h-4 w-16 bg-white/10 rounded animate-pulse" />
                    ) : (
                      tokenData?.symbol || 'Token Details'
                    )}
                  </h1>
                  <p className="text-xs text-white">
                    <span className="text-xs text-white/60">Today is </span> 
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
              <Link href="/watchlist">
                <SvelaLogo 
                  width={22} 
                  height={22} 
                  className="text-white/30"
                  fillColor="currentColor"
                  strokeOpacity={0.3}
                />
              </Link>
              <span className="text-lg font-bold text-white">
                {isMounted 
                  ? isOverviewRoute 
                    ? showPersonalizedGreeting 
                      ? `${greeting}, ${firstName}` 
                      : greeting
                    : greeting
                  : isOverviewRoute 
                    ? showPersonalizedGreeting
                      ? `Good morning, ${firstName}` 
                      : "Good morning"
                    : "Watchlist"
                }
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
                <AnalysisDialog 
                  coinId={coinId} 
                  tokenData={tokenData}
                />
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
              <DropdownMenuContent className="w-56 bg-zinc-900 rounded-xl z-[101]" align="end" forceMount>
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