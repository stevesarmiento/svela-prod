import { ScreenerClient } from "./_components/screener-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Screener",
}

export default function ChartsPage() {
  return <ScreenerClient />
}