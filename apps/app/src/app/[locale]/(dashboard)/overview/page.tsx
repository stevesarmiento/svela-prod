import type { Metadata } from "next"
import { createMetadata } from "@/lib/metadata"
import { OverviewHoldingsSection } from "./overview-holdings-section"
import { preloadQuery } from "convex/nextjs"
import { getAuthToken } from "@/lib/auth"
import { api } from "../../../../../convex/_generated/api"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  return createMetadata({
    title: "Overview",
    pathname: "/overview",
    locale,
  })
}

export default async function OverviewPage() {
  const token = await getAuthToken()
  const preloadedOverview = token
    ? await preloadQuery(api.overview.getMyOverviewBootstrap, {}, { token })
    : null

  return <OverviewHoldingsSection preloadedOverview={preloadedOverview} />
}
