'use client'

import { useMemo } from "react"
import { Card, CardContent } from "@v1/ui/card"
import { Spinner } from "@v1/ui/spinner"
import { WatchlistCard } from "../../watchlist/_components/watchlist-card"
import { usePortfolioWalletCoinIds } from "@/hooks/use-portfolio-wallet-coin-ids"
import type { PortfolioWallet } from "@/lib/portfolio-api"
import { useCoinGeckoWatchlistCoins } from "@/hooks/use-coingecko-watchlist-coins"
import { cn } from "@v1/ui/cn"

function formatAddress(address: string): string {
  const trimmed = address.trim()
  if (trimmed.length <= 12) return trimmed
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-6)}`
}

export interface PortfolioWalletCardProps {
  wallet: PortfolioWallet
  isSelected?: boolean
  onSelect?: () => void
}

export function PortfolioWalletCard({ wallet, isSelected, onSelect }: PortfolioWalletCardProps) {
  const { coinIds, isLoading, error } = usePortfolioWalletCoinIds(wallet._id)
  const quotes = useCoinGeckoWatchlistCoins(coinIds)

  const groupPreview = useMemo(() => {
    const displayName = wallet.name?.trim() ? wallet.name : formatAddress(wallet.address)
    return {
      _id: wallet._id,
      name: displayName,
      slug: `portfolio-${wallet._id}`,
      description: `Portfolio wallet ${formatAddress(wallet.address)}`,
      icon: undefined,
      color: "default",
      isDefault: false,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    }
  }, [wallet])

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="h-4 w-4" />
            <span>Loading tokens…</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="text-sm text-destructive text-pretty">{error.message}</div>
        </CardContent>
      </Card>
    )
  }

  if (wallet.lastSyncError) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="text-sm font-medium">{wallet.name ?? formatAddress(wallet.address)}</div>
          <div className="text-sm text-destructive text-pretty mt-2">{wallet.lastSyncError}</div>
        </CardContent>
      </Card>
    )
  }

  if (coinIds.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="text-sm font-medium">{wallet.name ?? formatAddress(wallet.address)}</div>
          <div className="text-sm text-muted-foreground text-pretty mt-2">
            No tracked tokens yet for this wallet.
          </div>
        </CardContent>
      </Card>
    )
  }

  if (quotes.isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="h-4 w-4" />
            <span>Loading prices…</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      className={cn(onSelect ? "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-[20px]" : "")}
      onClick={() => onSelect?.()}
      onKeyDown={(e) => {
        if (!onSelect) return
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <WatchlistCard group={groupPreview} coins={quotes.data} selected={Boolean(isSelected)} />
    </div>
  )
}

