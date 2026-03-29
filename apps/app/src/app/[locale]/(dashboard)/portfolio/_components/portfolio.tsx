'use client'

import { useEffect, useMemo, useState } from "react"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import type { PortfolioWallet } from "@/lib/portfolio-api"
import { PortfolioWalletCard } from "./portfolio-wallet-card"
import { PortfolioEmptyState } from "./portfolio-empty-state"
import { usePortfolioWallets } from "@/hooks/use-portfolio-wallets"
import { Spinner } from "@v1/ui/spinner"
import { Button } from "@v1/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@v1/ui/popover"
import { AddWalletDialog } from "./add-wallet-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@v1/ui/tabs"
import { PortfolioWalletComparison } from "@/app/[locale]/(dashboard)/portfolio/_components/portfolio-wallet-comparison"
import {
  IconCircleDottedAndCircle,
  IconEllipsis,
  IconWalletBifoldFill,
  IconWidgetSmallBadgePlus,
} from "symbols-react"

const portfolioTabValues = ["wallets", "comparison"] as const
const portfolioTabParser = parseAsStringLiteral(portfolioTabValues).withDefault("wallets")

export function Portfolio() {
  const { wallets, isLoading, error } = usePortfolioWallets()
  const [isActionsOpen, setIsActionsOpen] = useState(false)
  const [isAddWalletOpen, setIsAddWalletOpen] = useState(false)

  const [tab, setTab] = useQueryState("pt", portfolioTabParser)
  const [selectedWalletId, setSelectedWalletId] = useQueryState("pw", {
    defaultValue: "",
    shallow: false,
  })

  const activeWallets = useMemo<Array<PortfolioWallet>>(
    () => wallets.filter((w) => w.isActive),
    [wallets],
  )

  const selectedWallet = useMemo(() => {
    if (!selectedWalletId) return null
    return activeWallets.find((w) => w._id === selectedWalletId) ?? null
  }, [activeWallets, selectedWalletId])

  useEffect(() => {
    if (selectedWalletId) return
    const first = activeWallets[0]
    if (!first) return
    void setSelectedWalletId(first._id)
  }, [activeWallets, selectedWalletId, setSelectedWalletId])

  const isLoadingState = isLoading
  const errorState = error
  const hasNoWallets = !isLoadingState && !errorState && activeWallets.length === 0

  return (
    <div className="space-y-6 px-4">
      {/* Unified Header */}
      <div className="flex items-center justify-between py-1">
        <Tabs
          value={tab}
          onValueChange={(value) => {
            const next = value as (typeof portfolioTabValues)[number]
            void setTab(next)
          }}
        >
          <TabsList className="grid w-full grid-cols-2 p-0.5">
            <TabsTrigger value="wallets" className="flex items-center gap-2 p-0.5 px-2">
              <IconWalletBifoldFill className="size-3 fill-muted-foreground" />
              Wallets
              <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                {activeWallets.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="comparison" className="flex items-center gap-2 p-0.5 px-2">
              <IconCircleDottedAndCircle className="size-4 fill-muted-foreground" />
              Comparison
            </TabsTrigger>
          </TabsList>
        </Tabs>

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
              className="w-64 p-1 rounded-xl bg-white dark:bg-zinc-900"
              align="end"
              side="bottom"
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsActionsOpen(false)
                  setIsAddWalletOpen(true)
                }}
                className="w-full justify-start gap-2 rounded-md"
              >
                <IconWidgetSmallBadgePlus className="h-3.5 w-3.5 fill-muted-foreground" />
                <span>Add wallet</span>
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={tab}>
        <TabsContent value="wallets" className="mt-0">
          {isLoadingState ? (
            <div className="rounded-lg border bg-card p-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="h-4 w-4" />
                <span>Loading wallets…</span>
              </div>
            </div>
          ) : errorState ? (
            <div className="rounded-lg border bg-card p-6">
              <div className="text-sm text-destructive text-pretty">{errorState.message}</div>
            </div>
          ) : activeWallets.length === 0 ? (
            <PortfolioEmptyState
              onAddWallet={() => {
                setIsAddWalletOpen(true)
              }}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {activeWallets.map((wallet) => (
                <PortfolioWalletCard
                  key={wallet._id}
                  wallet={wallet}
                  isSelected={wallet._id === selectedWalletId}
                  onSelect={() => {
                    void setSelectedWalletId(wallet._id)
                    void setTab("comparison")
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="comparison" className="mt-0">
          {isLoadingState ? (
            <div className="rounded-lg border bg-card p-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="h-4 w-4" />
                <span>Loading wallets…</span>
              </div>
            </div>
          ) : errorState ? (
            <div className="rounded-lg border bg-card p-6">
              <div className="text-sm text-destructive text-pretty">{errorState.message}</div>
            </div>
          ) : hasNoWallets ? (
            <PortfolioEmptyState
              onAddWallet={() => {
                setIsAddWalletOpen(true)
              }}
            />
          ) : selectedWallet ? (
            <PortfolioWalletComparison wallet={selectedWallet} />
          ) : (
            <div className="rounded-lg border bg-card p-6">
              <div className="text-sm text-muted-foreground text-pretty">
                Select a wallet to compare its tokens.
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AddWalletDialog open={isAddWalletOpen} onOpenChange={setIsAddWalletOpen} />
    </div>
  )
}

