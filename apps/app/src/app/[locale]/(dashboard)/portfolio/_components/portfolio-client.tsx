'use client'

import { Suspense } from "react"
import { Portfolio } from "./portfolio"

function PortfolioContent() {
  return (
    <div className="w-full px-4">
      <Portfolio />
    </div>
  )
}

export function PortfolioClient() {
  return (
    <Suspense fallback={<div>Loading portfolio...</div>}>
      <PortfolioContent />
    </Suspense>
  )
}

