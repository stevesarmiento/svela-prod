"use client"

import type { Preloaded } from "convex/react"
import { SidebarProvider } from "@v1/ui/sidebar"
import { TooltipProvider } from "@v1/ui/tooltip"
import { usePathname } from "next/navigation"
import { BottomNavProvider } from "@/components/navigation/bottom-nav-context"
import { LinkIntentPrefetch } from "@/components/navigation/link-intent-prefetch"
import { RateLimitErrorBoundary } from "@/components/error-boundary/rate-limit-error-boundary"
import { ServiceWorkerRegistrar } from "@/components/service-worker/service-worker-registrar"
import { WatchlistProvider } from "@/app/[locale]/(dashboard)/watchlist/_components/watchlist-context"
import type { api } from "../../../../convex/_generated/api"

interface DashboardProvidersProps {
  children: React.ReactNode
  preloadedWatchlist: Preloaded<typeof api.watchlists.getMyWatchlistNavBootstrap> | null
}

/** Dashboard-only context stack (nav, sidebar, watchlist bootstrap, loading, errors). */
export function DashboardProviders(props: DashboardProvidersProps) {
  const { children, preloadedWatchlist } = props
  const pathname = usePathname()

  const isWatchlistHeavyRoute =
    pathname.includes("/watchlist") || pathname.includes("/watchlists")

  const inner = (
    <WatchlistProvider preloadedBootstrap={preloadedWatchlist ?? undefined}>
      {children}
    </WatchlistProvider>
  )

  // Note: the old LoadingStateManager wrapper was removed — its blocking
  // prefix ("watchlists") never matched a real TanStack query key, so the
  // stuck-loading overlay could never fire (watchlist data flows through
  // Convex useQuery, not TanStack Query).
  const wrappedInner = isWatchlistHeavyRoute ? (
    <RateLimitErrorBoundary>{inner}</RateLimitErrorBoundary>
  ) : (
    inner
  )

  return (
    <BottomNavProvider>
      <SidebarProvider defaultOpen>
        <TooltipProvider>
          <LinkIntentPrefetch />
          <ServiceWorkerRegistrar />
          {wrappedInner}
        </TooltipProvider>
      </SidebarProvider>
    </BottomNavProvider>
  )
}
