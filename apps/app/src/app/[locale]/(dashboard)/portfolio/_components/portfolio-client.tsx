'use client'

import { Suspense } from "react"
import { Portfolio } from "./portfolio"
import type { Preloaded } from "convex/react"
import type { api } from "../../../../../../convex/_generated/api"

function PortfolioContent(props: {
  preloadedWallets?: Preloaded<typeof api.portfolio.listMyPortfolioWallets>
}) {
  return (
    <div className="w-full px-4">
      <Portfolio preloadedWallets={props.preloadedWallets} />
    </div>
  )
}

export function PortfolioClient(props: {
  preloadedWallets?: Preloaded<typeof api.portfolio.listMyPortfolioWallets>
}) {
  return (
    <Suspense fallback={<div>Loading portfolio...</div>}>
      <PortfolioContent preloadedWallets={props.preloadedWallets} />
    </Suspense>
  )
}

