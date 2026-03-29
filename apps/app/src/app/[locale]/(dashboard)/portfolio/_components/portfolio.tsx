'use client'

import { useEffect, useMemo, useRef, useState } from "react"
import type { PortfolioWallet } from "@/lib/portfolio-api"
import { AddWalletForm, type AddWalletFormRef } from "./add-wallet-form"
import { PortfolioWalletCard } from "./portfolio-wallet-card"
import { PortfolioEmptyState } from "./portfolio-empty-state"
import { usePortfolioWallets } from "@/hooks/use-portfolio-wallets"
import { Spinner } from "@v1/ui/spinner"
import { Button } from "@v1/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@v1/ui/popover"
import { IconEllipsis, IconWalletBifoldFill } from "symbols-react"

export function Portfolio() {
  const { wallets, isLoading, error } = usePortfolioWallets()
  const addWalletRef = useRef<AddWalletFormRef>(null)
  const [isActionsOpen, setIsActionsOpen] = useState(false)

  const activeWallets = useMemo<Array<PortfolioWallet>>(
    () => wallets.filter((w) => w.isActive),
    [wallets],
  )

  useEffect(() => {
    if (!isActionsOpen) return
    const id = window.setTimeout(() => {
      addWalletRef.current?.focusAddress()
    }, 0)
    return () => window.clearTimeout(id)
  }, [isActionsOpen])

  return (
    <div className="space-y-6 px-4">
      {/* Unified Header */}
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <IconWalletBifoldFill className="size-4 fill-muted-foreground shrink-0" />
            <div className="font-semibold text-balance truncate">Portfolio</div>
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {activeWallets.length} wallet{activeWallets.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Popover open={isActionsOpen} onOpenChange={setIsActionsOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="group h-7 w-7 p-0 rounded-md bg-accent hover:bg-accent/90 hover:ring-1 ring-primary/10"
                aria-label="Portfolio actions"
              >
                <IconEllipsis className="size-3.5 fill-muted-foreground group-hover:fill-primary rotate-90" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-80 p-3 rounded-xl bg-white dark:bg-zinc-900"
              align="end"
              side="bottom"
            >
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-semibold text-balance">Add wallet</div>
                  <div className="text-xs text-muted-foreground text-pretty mt-1">
                    We’ll index the top tokens for this address and refresh daily.
                  </div>
                </div>
                <AddWalletForm
                  ref={addWalletRef}
                  onSuccess={() => {
                    setIsActionsOpen(false)
                  }}
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Main Content */}
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
        <PortfolioEmptyState
          onAddWallet={() => {
            setIsActionsOpen(true)
          }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {activeWallets.map((wallet) => (
            <PortfolioWalletCard key={wallet._id} wallet={wallet} />
          ))}
        </div>
      )}
    </div>
  )
}

