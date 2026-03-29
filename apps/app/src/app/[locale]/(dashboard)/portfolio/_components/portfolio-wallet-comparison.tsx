'use client'

import { useMemo, useState } from "react"
import type { PortfolioWallet } from "@/lib/portfolio-api"
import { usePortfolioWalletCoinIds } from "@/hooks/use-portfolio-wallet-coin-ids"
import { Spinner } from "@v1/ui/spinner"
import { PortfolioMultiPriceChart } from "./portfolio-multi-price-chart"
import { PortfolioChartTable } from "./portfolio-chart-table"
import { useCoinGeckoWatchlistCoins } from "@/hooks/use-coingecko-watchlist-coins"

function formatAddress(address: string): string {
  const trimmed = address.trim()
  if (trimmed.length <= 12) return trimmed
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-6)}`
}

export interface PortfolioWalletComparisonProps {
  wallet: PortfolioWallet
}

export function PortfolioWalletComparison({ wallet }: PortfolioWalletComparisonProps) {
  const [activeTimeScale, setActiveTimeScale] = useState<string>("1d")

  const { coinIds, isLoading, error } = usePortfolioWalletCoinIds(wallet._id)
  const quotes = useCoinGeckoWatchlistCoins(coinIds)

  const headerTitle = useMemo(() => {
    return wallet.name?.trim() ? wallet.name : formatAddress(wallet.address)
  }, [wallet])

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4" />
          <span>Loading wallet tokens…</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <div className="text-sm text-destructive text-pretty">{error.message}</div>
      </div>
    )
  }

  if (coinIds.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <div className="text-sm font-semibold text-balance">{headerTitle}</div>
        <div className="text-sm text-muted-foreground text-pretty mt-1">
          No tracked tokens yet for this wallet.
        </div>
      </div>
    )
  }

  if (quotes.isLoading) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4" />
          <span>Loading prices…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-balance truncate">{headerTitle}</div>
          <div className="text-xs text-muted-foreground tabular-nums mt-1">
            {quotes.data.length} token{quotes.data.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <PortfolioMultiPriceChart
        coins={quotes.data}
        activeTimeScale={activeTimeScale}
        setActiveTimeScale={setActiveTimeScale}
      />

      <PortfolioChartTable coins={quotes.data} activeTimeScale={activeTimeScale} />
    </div>
  )
}

