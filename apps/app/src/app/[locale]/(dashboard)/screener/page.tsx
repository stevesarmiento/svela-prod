import type { Metadata } from "next"
import { ScreenerClient } from "./_components/screener-client"

export const metadata: Metadata = {
  title: "Screener",
}

export default function ScreenerPage() {
  return <ScreenerClient />
}

