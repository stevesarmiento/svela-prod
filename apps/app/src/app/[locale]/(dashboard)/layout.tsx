import { TopNav } from "@/components/navigation/top-nav"
import { BottomNav } from "@/components/navigation/bottom-nav"
import { FloatingMarketFeedProvider } from "@/components/floating-market-feed/floating-market-feed-context"
import { FloatingMarketFeedLazy } from "@/components/floating-market-feed/floating-market-feed-lazy"
import { preloadQuery } from "convex/nextjs"
import { getAuthToken } from "@/lib/auth"
import { api } from "../../../../convex/_generated/api"
import { DashboardProviders } from "./dashboard-providers"
import { Suspense } from "react"

async function preloadWatchlistNavBootstrap() {
  try {
    const token = await getAuthToken()
    return token
      ? await preloadQuery(api.watchlists.getMyWatchlistNavBootstrap, {}, { token })
      : await preloadQuery(api.watchlists.getMyWatchlistNavBootstrap, {})
  } catch (error) {
    console.error("[DashboardLayout] Failed to preload watchlist nav", error)
    return null
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const preloadedWatchlist = await preloadWatchlistNavBootstrap()

  return (
    <DashboardProviders preloadedWatchlist={preloadedWatchlist}>
      <FloatingMarketFeedProvider>
        <div className="relative w-screen font-diatype">
          <div className="flex flex-grow flex-col max-w-[1440px] mx-auto">
            <Suspense fallback={null}>
              <TopNav />
            </Suspense>
            <main className="flex flex-grow w-full pb-20">{children}</main>
            <BottomNav />
          </div>
        </div>
        <FloatingMarketFeedLazy />
      </FloatingMarketFeedProvider>
    </DashboardProviders>
  )
}
