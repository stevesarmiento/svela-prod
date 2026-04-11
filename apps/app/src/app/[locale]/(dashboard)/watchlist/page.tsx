import type { Metadata } from "next"
import { createMetadata } from "@/lib/metadata"
import { redirect } from "next/navigation"

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
  redirect("/watchlists")
}