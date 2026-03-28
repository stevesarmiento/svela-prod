'use client'

import { useMemo } from "react"
import { AddWalletForm } from "./add-wallet-form"
import { usePortfolioWallets } from "@/hooks/use-portfolio-wallets"
import { PortfolioWalletCard } from "./portfolio-wallet-card"
import { Spinner } from "@v1/ui/spinner"

export function PortfolioClient() {
  const { wallets, isLoading, error } = usePortfolioWallets()

  const activeWallets = useMemo(() => wallets.filter((w) => w.isActive), [wallets])

  return (
    <div className="grid gap-6">
      <div className="rounded-lg border bg-card text-card-foreground p-6">
        <h2 className="text-lg font-semibold text-balance">Portfolio wallets</h2>
        <p className="text-sm text-muted-foreground text-pretty mt-1">
          Add a Solana wallet address to track its top tokens. Wallets sync daily.
        </p>

        <div className="mt-5">
          <AddWalletForm />
        </div>
      </div>

      <div className="grid gap-4">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-sm font-semibold text-muted-foreground">Tracked wallets</h3>
        </div>

        {isLoading ? (
          <div className="rounded-lg border bg-card p-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4" />
              <span>Loading wallets…</span>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-lg border bg-card p-6">
            <div className="text-sm text-destructive text-pretty">{error.message}</div>
          </div>
        ) : activeWallets.length === 0 ? (
          <div className="rounded-lg border bg-card p-6">
            <div className="text-sm text-muted-foreground text-pretty">
              No wallets yet. Add one above to start tracking.
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activeWallets.map((wallet) => (
              <PortfolioWalletCard key={wallet._id} wallet={wallet} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

