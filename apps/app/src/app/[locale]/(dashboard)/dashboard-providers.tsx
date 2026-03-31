"use client"

import type { Preloaded } from "convex/react"
import { SidebarProvider } from "@v1/ui/sidebar"
import { TooltipProvider } from "@v1/ui/tooltip"
import { BottomNavProvider } from "@/components/navigation/bottom-nav-context"
import { RateLimitErrorBoundary } from "@/components/error-boundary/rate-limit-error-boundary"
import { LoadingStateManager } from "@/components/loading/loading-state-manager"
import { WatchlistProvider } from "@/app/[locale]/(dashboard)/watchlist/_components/watchlist-context"
import type { api } from "../../../../convex/_generated/api"

interface DashboardProvidersProps {
  children: React.ReactNode
  preloadedWatchlist: Preloaded<typeof api.watchlists.getMyWatchlistBootstrap> | null
}

/** Dashboard-only context stack (nav, sidebar, watchlist bootstrap, loading, errors). */
export function DashboardProviders(props: DashboardProvidersProps) {
  const { children, preloadedWatchlist } = props

  const inner =
    preloadedWatchlist != null ? (
      <WatchlistProvider preloadedBootstrap={preloadedWatchlist}>{children}</WatchlistProvider>
    ) : (
      children
    )

  return (
    <BottomNavProvider>
      <SidebarProvider defaultOpen>
        <TooltipProvider>
          <LoadingStateManager blockingQueryKeyPrefixes={["watchlists"]}>
            <RateLimitErrorBoundary>{inner}</RateLimitErrorBoundary>
          </LoadingStateManager>
        </TooltipProvider>
      </SidebarProvider>
    </BottomNavProvider>
  )
}
