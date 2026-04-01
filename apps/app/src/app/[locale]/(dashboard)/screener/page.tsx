import type { Metadata } from "next"
import { ScreenerClient } from "./_components/screener-client"
import { createMetadata } from "@/lib/metadata"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  return createMetadata({
    title: "Screener",
    pathname: "/screener",
    locale,
  })
}

export default function ScreenerPage() {
  return <ScreenerClient />
}

