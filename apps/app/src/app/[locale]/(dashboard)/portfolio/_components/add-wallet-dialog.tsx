'use client'

import { useCallback, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { Dialog, DialogContent } from "@v1/ui/dialog"
import { Button } from "@v1/ui/button"
import { Checkbox } from "@v1/ui/checkbox"
import { Input } from "@v1/ui/input"
import { ScrollArea } from "@v1/ui/scroll-area"
import { Separator } from "@v1/ui/separator"
import { Spinner } from "@v1/ui/spinner"
import { cn } from "@v1/ui/cn"
import { toast } from "@v1/ui/use-toast"
import { IconWidgetSmallBadgePlus } from "symbols-react"
import { ArrowLeft, Search } from "lucide-react"
import { useCoinGeckoWatchlistCoins } from "@/hooks/use-coingecko-watchlist-coins"
import { useCreatePortfolioWalletFromSelection, usePreviewPortfolioWalletCandidates } from "@/hooks/use-portfolio-wallets"
import type { PortfolioWalletCandidate } from "@/lib/portfolio-api"
import { getTokenLogoURL } from "@/lib/logo-overrides"
import { formatUsdPrice } from "@/lib/format-usd"

function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
}

type Step = "details" | "select"

export interface AddWalletDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddWalletDialog({ open, onOpenChange }: AddWalletDialogProps) {
  const [step, setStep] = useState<Step>("details")
  const [address, setAddress] = useState("")
  const [name, setName] = useState("")
  const [searchText, setSearchText] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)

  const [candidates, setCandidates] = useState<Array<PortfolioWalletCandidate>>([])
  const [unresolvedCount, setUnresolvedCount] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const trimmedAddress = useMemo(() => address.trim(), [address])
  const trimmedName = useMemo(() => name.trim(), [name])

  const previewMutation = usePreviewPortfolioWalletCandidates()
  const createMutation = useCreatePortfolioWalletFromSelection()

  const coingeckoIds = useMemo(() => candidates.map((c) => c.coingeckoId), [candidates])
  const quotes = useCoinGeckoWatchlistCoins(coingeckoIds)

  const coinsById = useMemo(() => {
    const map = new Map<string, (typeof quotes.data)[number]>()
    for (const coin of quotes.data ?? []) map.set(coin.id, coin)
    return map
  }, [quotes.data])

  const filteredCandidates = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    if (!q) return candidates

    return candidates.filter((c) => {
      const coin = coinsById.get(c.coingeckoId)
      const name = coin?.name?.toLowerCase() ?? ""
      const symbol = coin?.symbol?.toLowerCase() ?? ""
      return (
        c.coingeckoId.toLowerCase().includes(q) ||
        c.mint.toLowerCase().includes(q) ||
        name.includes(q) ||
        symbol.includes(q)
      )
    })
  }, [candidates, coinsById, searchText])

  useEffect(() => {
    if (!open) return
    setLocalError(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    if (step !== "select") return
    if (candidates.length === 0) return

    // Default to a small “sane” selection so onboarding isn’t a 0→80 clickfest.
    const initial = new Set<string>()
    for (const c of candidates.slice(0, 10)) initial.add(c.coingeckoId)
    setSelectedIds(initial)
  }, [open, step, candidates])

  const resetAll = useCallback(() => {
    setStep("details")
    setAddress("")
    setName("")
    setSearchText("")
    setCandidates([])
    setUnresolvedCount(0)
    setSelectedIds(new Set())
    setLocalError(null)
  }, [])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen)
      if (!nextOpen) resetAll()
    },
    [onOpenChange, resetAll],
  )

  const handlePreview = useCallback(async () => {
    setLocalError(null)

    if (!trimmedAddress) {
      setLocalError("Enter a wallet address.")
      return
    }
    if (!isValidSolanaAddress(trimmedAddress)) {
      setLocalError("That doesn’t look like a valid Solana address.")
      return
    }

    try {
      const result = await previewMutation.preview(trimmedAddress)
      setCandidates(result.candidates)
      setUnresolvedCount(result.unresolvedCount)
      setSearchText("")
      setStep("select")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to preview wallet tokens"
      setLocalError(message)
    }
  }, [previewMutation, trimmedAddress])

  const toggleSelected = useCallback((coingeckoId: string, next: boolean) => {
    setSelectedIds((prev) => {
      const copy = new Set(prev)
      if (next) copy.add(coingeckoId)
      else copy.delete(coingeckoId)
      return copy
    })
  }, [])

  const handleSelectAllFiltered = useCallback(() => {
    setSelectedIds((prev) => {
      const copy = new Set(prev)
      for (const c of filteredCandidates) copy.add(c.coingeckoId)
      return copy
    })
  }, [filteredCandidates])

  const handleClearAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const handleCreate = useCallback(async () => {
    setLocalError(null)

    const selected = candidates.filter((c) => selectedIds.has(c.coingeckoId))
    if (selected.length === 0) {
      setLocalError("Select at least one token to add.")
      return
    }

    try {
      await createMutation.createWallet({
        address: trimmedAddress,
        name: trimmedName || undefined,
        selected,
      })

      toast({
        title: "Wallet added",
        description: `Tracking ${selected.length} token${selected.length === 1 ? "" : "s"}.`,
      })

      handleOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add wallet"
      setLocalError(message)
    }
  }, [candidates, createMutation, handleOpenChange, selectedIds, trimmedAddress, trimmedName])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <div className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-balance">
                {step === "details" ? "Add wallet" : "Select tokens to track"}
              </div>
              <div className="text-xs text-muted-foreground text-pretty mt-1">
                {step === "details"
                  ? "Preview this wallet’s tokens, then pick only what you want to track."
                  : `${candidates.length} resolvable token${candidates.length === 1 ? "" : "s"}${
                      unresolvedCount > 0 ? ` • ${unresolvedCount} unresolved` : ""
                    }`}
              </div>
            </div>

            {step === "select" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 rounded-md"
                onClick={() => {
                  setStep("details")
                  setCandidates([])
                  setSelectedIds(new Set())
                  setLocalError(null)
                }}
              >
                <ArrowLeft className="size-4" />
                Back
              </Button>
            ) : null}
          </div>
        </div>

        <Separator />

        {step === "details" ? (
          <div className="p-4 space-y-4">
            <div className="grid gap-2">
              <label htmlFor="portfolio-wallet-address" className="text-sm font-medium">
                Wallet address
              </label>
              <Input
                id="portfolio-wallet-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                autoComplete="off"
                inputMode="text"
                spellCheck={false}
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="portfolio-wallet-name" className="text-sm font-medium">
                Label (optional)
              </label>
              <Input
                id="portfolio-wallet-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
            </div>

            {localError ? <div className="text-sm text-destructive text-pretty">{localError}</div> : null}

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                onClick={() => handleOpenChange(false)}
                variant="outline"
                disabled={previewMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handlePreview} disabled={previewMutation.isPending}>
                {previewMutation.isPending ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="h-4 w-4" />
                    Previewing…
                  </span>
                ) : (
                  "Continue"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Search by token, symbol, CoinGecko ID, or mint…"
                  className="pl-8"
                />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handleSelectAllFiltered}>
                Select all
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleClearAll}>
                Clear
              </Button>
            </div>

            <div className="rounded-[10px] bg-primary/5 overflow-hidden p-0.5">
              <div className="bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm overflow-hidden">
                <div
                  className="grid gap-4 px-4 py-2 border-b text-[10px] font-semibold text-muted-foreground uppercase tracking-wide"
                  style={{ gridTemplateColumns: "2fr 1fr" }}
                >
                  <div className="flex items-center gap-2">
                    <span>Token</span>
                    <span className="ml-auto text-[10px] normal-case tracking-normal text-muted-foreground/70">
                      {selectedIds.size} selected
                    </span>
                  </div>
                  <div className="flex items-center justify-end">Price</div>
                </div>

                <ScrollArea className="h-[52vh]">
                  {filteredCandidates.length === 0 ? (
                    <div className="px-4 py-8 text-sm text-muted-foreground text-pretty">
                      No matches.
                    </div>
                  ) : (
                    filteredCandidates.map((c) => {
                      const isChecked = selectedIds.has(c.coingeckoId)
                      const coin = coinsById.get(c.coingeckoId)
                      const symbol = coin?.symbol?.toUpperCase() ?? c.coingeckoId
                      const displayName = coin?.name ?? c.coingeckoId
                      const tokenLogoUrl = getTokenLogoURL(coin?.symbol, coin?.image)
                      const safeTokenLogoUrl =
                        tokenLogoUrl && (tokenLogoUrl.startsWith("http") || tokenLogoUrl.startsWith("/"))
                          ? tokenLogoUrl
                          : undefined
                      const price = coin?.quote?.USD?.price ?? 0

                      return (
                        <div
                          key={c.coingeckoId}
                          role="button"
                          tabIndex={0}
                          aria-pressed={isChecked}
                          className={cn(
                            "w-full grid gap-4 px-4 py-2.5 border-b last:border-b-0 hover:bg-primary/[0.02] text-left",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                          )}
                          style={{ gridTemplateColumns: "2fr 1fr" }}
                          onClick={() => toggleSelected(c.coingeckoId, !isChecked)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              toggleSelected(c.coingeckoId, !isChecked)
                            }
                          }}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(value) => toggleSelected(c.coingeckoId, !!value)}
                              aria-label={`Select ${displayName}`}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="relative size-5 shrink-0">
                                {safeTokenLogoUrl ? (
                                  <Image
                                    src={safeTokenLogoUrl}
                                    alt={displayName}
                                    className="rounded-full ring-1 ring-border"
                                    fill
                                    sizes="20px"
                                  />
                                ) : (
                                  <div className="size-5 rounded-full bg-primary/10 ring-1 ring-border flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                                    {symbol.slice(0, 1)}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-semibold truncate">{symbol}</div>
                                <div className="text-xs text-muted-foreground truncate">{displayName}</div>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-end font-diatype-mono text-xs tabular-nums">
                            {quotes.isLoading ? "—" : price > 0 ? formatUsdPrice(price) : "—"}
                          </div>
                        </div>
                      )
                    })
                  )}
                </ScrollArea>
              </div>
            </div>

            {localError ? <div className="text-sm text-destructive text-pretty">{localError}</div> : null}

            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground text-pretty">
                Tip: start with the top tokens (sorted by wallet USD value) and add the rest later.
              </div>
              <Button type="button" onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="h-4 w-4" />
                    Adding…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <IconWidgetSmallBadgePlus className="size-4 fill-muted-foreground" />
                    Add selected ({selectedIds.size})
                  </span>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

