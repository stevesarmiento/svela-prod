import { TopNav } from "@/components/navigation/top-nav";
import { BottomNav } from "@/components/navigation/bottom-nav";
import { SidebarProvider } from "@v1/ui/sidebar";
import { BottomNavProvider } from "@/components/navigation/bottom-nav-context"
import { RateLimitErrorBoundary } from "@/components/error-boundary/rate-limit-error-boundary"
import { LoadingStateManager } from "@/components/loading/loading-state-manager"
import { TooltipProvider } from "@v1/ui/tooltip";
import { WatchlistProvider } from "@/app/[locale]/(dashboard)/watchlist/_components/watchlist-context";
import { preloadQuery } from "convex/nextjs";
import { getAuthToken } from "@/lib/auth";
import { api } from "../../../../convex/_generated/api";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = await getAuthToken();
  const preloadedWatchlist = token
    ? await preloadQuery(api.watchlists.getMyWatchlistBootstrap, {}, { token })
    : null;
  const WatchlistProviderWithBootstrap =
    WatchlistProvider as unknown as React.ComponentType<{
      children: React.ReactNode;
      preloadedBootstrap: typeof preloadedWatchlist;
    }>;

  return (
    <BottomNavProvider>
      <SidebarProvider defaultOpen>
        <TooltipProvider>
        <div className="flex w-screen font-diatype">
          <div className="flex flex-grow flex-col max-w-7xl mx-auto">
            <TopNav />
            <main className="flex flex-grow w-full pb-20">
              <LoadingStateManager blockingQueryKeyPrefixes={["watchlists"]}>
                <RateLimitErrorBoundary>
                  {preloadedWatchlist ? (
                    <WatchlistProviderWithBootstrap preloadedBootstrap={preloadedWatchlist}>
                      {children}
                    </WatchlistProviderWithBootstrap>
                  ) : (
                    children
                  )}
                </RateLimitErrorBoundary>
              </LoadingStateManager>
            </main>
            <BottomNav />
          </div>
        </div>      
        </TooltipProvider>
      </SidebarProvider>
    </BottomNavProvider>
  );
}