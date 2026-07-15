import type { Metadata } from "next"
import { createMetadata } from "@/lib/metadata"
import { ComparisonClient } from "./_components/comparison-client"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  return createMetadata({
    title: "Sector comparison",
    pathname: "/comparison",
    locale,
  })
}

// Screener-style instant UI: no server awaits — the page frame (header +
// timescale pills) paints immediately and the watchlists bootstrap loads
// client-side via Convex inside ComparisonClient, with the grid skeleton
// shown only in the data region.
export default function ComparisonPage() {
  return <ComparisonClient />
}
