import { WatchlistClient } from "./_components/watchlist-client"
import type { Metadata } from "next"
import { createMetadata } from "@/lib/metadata"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  return createMetadata({
    title: "Watchlist",
    pathname: "/watchlist",
    locale,
  })
}

export default function WatchlistPage() {
  return <WatchlistClient />
}