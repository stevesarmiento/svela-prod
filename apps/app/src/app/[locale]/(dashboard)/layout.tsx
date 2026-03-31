import { TopNav } from "@/components/navigation/top-nav"
import { BottomNav } from "@/components/navigation/bottom-nav"
import { preloadQuery } from "convex/nextjs"
import { getAuthToken } from "@/lib/auth"
import { api } from "../../../../convex/_generated/api"
import { DashboardProviders } from "./dashboard-providers"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const token = await getAuthToken()
  const preloadedWatchlist = token
    ? await preloadQuery(api.watchlists.getMyWatchlistBootstrap, {}, { token })
    : null

  return (
    <DashboardProviders preloadedWatchlist={preloadedWatchlist}>
      <div className="relative w-screen font-diatype">
        <div className="flex flex-grow flex-col max-w-7xl mx-auto">
          <TopNav />
          <main className="flex flex-grow w-full pb-20">{children}</main>
          <BottomNav />
        </div>
      </div>
    </DashboardProviders>
  )
}
