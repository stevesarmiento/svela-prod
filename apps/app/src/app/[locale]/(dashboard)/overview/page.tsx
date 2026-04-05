import type { Metadata } from "next"
import { createMetadata } from "@/lib/metadata"
import { OverviewHoldingsSection } from "./overview-holdings-section"

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

export default function OverviewPage() {
  return <OverviewHoldingsSection />
}
