import type { Metadata } from "next"
import { createMetadata } from "@/lib/metadata"
import { preloadQuery } from "convex/nextjs"
import { getAuthToken } from "@/lib/auth"
import { api } from "../../../../../convex/_generated/api"
import { WatchlistClient } from "../watchlist/_components/watchlist-client"
import { WatchlistsPageBootstrapProvider } from "../watchlist/_components/watchlists-page-bootstrap-context"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  return createMetadata({
    title: "Watchlists",
    pathname: "/watchlists",
    locale,
  })
}

export default async function WatchlistsPage() {
  const token = await getAuthToken()
  const preloadedBootstrap = token
    ? await preloadQuery(api.watchlists.getMyWatchlistsPageBootstrap, {}, { token })
    : await preloadQuery(api.watchlists.getMyWatchlistsPageBootstrap, {})

  return (
    <WatchlistsPageBootstrapProvider preloadedBootstrap={preloadedBootstrap}>
      <WatchlistClient />
    </WatchlistsPageBootstrapProvider>
  )
}
