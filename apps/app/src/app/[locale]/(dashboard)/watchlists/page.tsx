import type { Metadata } from "next"
import { createMetadata } from "@/lib/metadata"
import { WatchlistClient } from "../watchlist/_components/watchlist-client"

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

export default function WatchlistsPage() {
  return <WatchlistClient />
}
