'use client'

import { useCallback, useMemo, useReducer } from "react"
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
import { WatchlistCard } from "../../watchlist/_components/watchlist-card"

function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
}

function formatAddress(address: string): string {
  const trimmed = address.trim()
  if (!trimmed) return ""
  if (trimmed.length <= 12) return trimmed
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-6)}`
}

type Step = "details" | "select"

/** All wizard state that changes together lives in one reducer. */
interface WizardState {
  step: Step
  address: string
  name: string
  searchText: string
  localError: string | null
  candidates: Array<PortfolioWalletCandidate>
  unresolvedCount: number
  selectedIds: Set<string>
}

function createInitialWizardState(): WizardState {
  return {
    step: "details",
    address: "",
    name: "",
    searchText: "",
    localError: null,
    candidates: [],
    unresolvedCount: 0,
    selectedIds: new Set<string>(),
  }
}

type WizardAction =
  | { type: "reset" }
  | { type: "setAddress"; value: string }
  | { type: "setName"; value: string }
  | { type: "setSearchText"; value: string }
  | { type: "setLocalError"; value: string | null }
  | {
      type: "previewLoaded"
      candidates: Array<PortfolioWalletCandidate>
      unresolvedCount: number
    }
  | { type: "toggleSelected"; coingeckoId: string; next: boolean }
  | { type: "selectFiltered"; ids: string[] }
  | { type: "clearSelection" }
  | { type: "backToDetails" }

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "reset":
      return createInitialWizardState()
    case "setAddress":
      return { ...state, address: action.value }
    case "setName":
      return { ...state, name: action.value }
    case "setSearchText":
      return { ...state, searchText: action.value }
    case "setLocalError":
      return { ...state, localError: action.value }
    case "previewLoaded": {
      // Default to a small "sane" selection so onboarding isn't a 0->80
      // clickfest. Set here (the event that produces the candidates) instead
      // of adjusting state in an effect after the step changes.
      const selectedIds = new Set<string>()
      for (const c of action.candidates.slice(0, 10)) selectedIds.add(c.coingeckoId)
      return {
        ...state,
        step: "select",
        searchText: "",
        candidates: action.candidates,
        unresolvedCount: action.unresolvedCount,
        selectedIds,
      }
    }
    case "toggleSelected": {
      const selectedIds = new Set(state.selectedIds)
      if (action.next) selectedIds.add(action.coingeckoId)
      else selectedIds.delete(action.coingeckoId)
      return { ...state, selectedIds }
    }
    case "selectFiltered": {
      const selectedIds = new Set(state.selectedIds)
      for (const id of action.ids) selectedIds.add(id)
      return { ...state, selectedIds }
    }
    case "clearSelection":
      return { ...state, selectedIds: new Set<string>() }
    case "backToDetails":
      return {
        ...state,
        step: "details",
        candidates: [],
        selectedIds: new Set<string>(),
        localError: null,
      }
  }
}

type WalletCoin = NonNullable<
  ReturnType<typeof useCoinGeckoWatchlistCoins>["data"]
>[number]

export interface AddWalletDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Dialog title, step counter, and the step-2 back button. */
function StepHeader(props: {
  step: Step
  candidateCount: number
  unresolvedCount: number
  onBack: () => void
}) {
  const { step, candidateCount, unresolvedCount, onBack } = props
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-balance">
              {step === "details" ? "Add wallet" : "Select tokens to track"}
            </div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              {step === "details" ? "Step 1/2" : "Step 2/2"}
            </div>
          </div>
          <div className="text-xs text-muted-foreground text-pretty mt-1">
            {step === "details"
              ? "Preview this wallet’s tokens, then pick only what you want to track."
              : `${candidateCount} resolvable token${candidateCount === 1 ? "" : "s"}${
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
            onClick={onBack}
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/** Step 1: wallet address + optional label, cancel/continue actions. */
function WalletDetailsStep(props: {
  address: string
  name: string
  onAddressChange: (value: string) => void
  onNameChange: (value: string) => void
  localError: string | null
  isPending: boolean
  onCancel: () => void
  onContinue: () => void
}) {
  return (
    <div className="p-4 space-y-4">
      <div className="grid gap-2">
        <label htmlFor="portfolio-wallet-address" className="text-sm font-medium">
          Wallet address
        </label>
        <Input
          id="portfolio-wallet-address"
          value={props.address}
          onChange={(e) => props.onAddressChange(e.target.value)}
          autoComplete="off"
          inputMode="text"
          spellCheck={false}
        />
        <div className="text-xs text-muted-foreground text-pretty">
          We’ll preview the wallet’s top tokens, then you decide what to track.
        </div>
      </div>

      <div className="grid gap-2">
        <label htmlFor="portfolio-wallet-name" className="text-sm font-medium">
          Label (optional)
        </label>
        <Input
          id="portfolio-wallet-name"
          value={props.name}
          onChange={(e) => props.onNameChange(e.target.value)}
          autoComplete="off"
        />
      </div>

      {props.localError ? (
        <div className="text-sm text-destructive text-pretty">{props.localError}</div>
      ) : null}

      <div className="flex flex-row w-full items-center justify-center gap-2">
        <Button
          type="button"
          onClick={props.onCancel}
          variant="outline"
          className="w-full"
          disabled={props.isPending}
        >
          Cancel
        </Button>
        <Button type="button" className="w-full" variant="default" onClick={props.onContinue} disabled={props.isPending}>
          {props.isPending ? (
            <span className="inline-flex items-center gap-2">
              <Spinner className="h-4 w-4" />
              Fetching tokens
            </span>
          ) : (
            "Continue"
          )}
        </Button>
      </div>
    </div>
  )
}

/** One selectable token row in the step-2 list. */
function CandidateRow(props: {
  candidate: PortfolioWalletCandidate
  coin: WalletCoin | undefined
  isChecked: boolean
  isPriceLoading: boolean
  onToggle: (coingeckoId: string, next: boolean) => void
}) {
  const { candidate: c, coin, isChecked, isPriceLoading, onToggle } = props
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
      role="button"
      tabIndex={0}
      aria-pressed={isChecked}
      className={cn(
        "w-full grid gap-4 px-4 py-2.5 border-b last:border-b-0 hover:bg-primary/[0.02] text-left",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
      )}
      style={{ gridTemplateColumns: "2fr 1fr" }}
      onClick={() => onToggle(c.coingeckoId, !isChecked)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onToggle(c.coingeckoId, !isChecked)
        }
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Checkbox
          checked={isChecked}
          onCheckedChange={(value) => onToggle(c.coingeckoId, !!value)}
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
                // Arbitrary wallet-token hosts; skip the
                // optimizer (locked-down remotePatterns).
                unoptimized
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

      <div className="flex items-center justify-end font-berkeley-mono text-xs tabular-nums">
        {isPriceLoading ? "—" : price > 0 ? formatUsdPrice(price) : "—"}
      </div>
    </div>
  )
}

/** Step 2: search + bulk select controls, candidate list, create action. */
function SelectTokensStep(props: {
  searchText: string
  onSearchTextChange: (value: string) => void
  filteredCandidates: PortfolioWalletCandidate[]
  selectedIds: Set<string>
  coinsById: Map<string, WalletCoin>
  isPriceLoading: boolean
  onToggle: (coingeckoId: string, next: boolean) => void
  onSelectAllFiltered: () => void
  onClearAll: () => void
  localError: string | null
  isCreating: boolean
  onCreate: () => void
}) {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={props.searchText}
            onChange={(e) => props.onSearchTextChange(e.target.value)}
            placeholder="Search by token, symbol, or mint…"
            className="pl-8"
          />
        </div>
          <Button type="button" variant="outline" size="sm" onClick={props.onSelectAllFiltered}>
            Select all
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={props.onClearAll}>
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
                {props.selectedIds.size} selected
              </span>
            </div>
            <div className="flex items-center justify-end">Price</div>
          </div>

          <ScrollArea className="h-[52vh]">
            {props.filteredCandidates.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground text-pretty">No matches.</div>
            ) : (
              props.filteredCandidates.map((c) => (
                <CandidateRow
                  key={c.coingeckoId}
                  candidate={c}
                  coin={props.coinsById.get(c.coingeckoId)}
                  isChecked={props.selectedIds.has(c.coingeckoId)}
                  isPriceLoading={props.isPriceLoading}
                  onToggle={props.onToggle}
                />
              ))
            )}
          </ScrollArea>
        </div>
      </div>

      {props.localError ? (
        <div className="text-sm text-destructive text-pretty">{props.localError}</div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <Button variant="default" type="button" className="w-full" onClick={props.onCreate} disabled={props.isCreating}>
          {props.isCreating ? (
            <span className="inline-flex items-center gap-2">
              <Spinner className="h-4 w-4" />
              Adding…
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <IconWidgetSmallBadgePlus className="size-4 fill-muted-foreground" />
              Add selected ({props.selectedIds.size})
            </span>
          )}
        </Button>
      </div>
    </div>
  )
}

export function AddWalletDialog({ open, onOpenChange }: AddWalletDialogProps) {
  const [wizard, dispatch] = useReducer(
    wizardReducer,
    undefined,
    createInitialWizardState,
  )
  const {
    step,
    address,
    name,
    searchText,
    localError,
    candidates,
    unresolvedCount,
    selectedIds,
  } = wizard

  const trimmedAddress = useMemo(() => address.trim(), [address])
  const trimmedName = useMemo(() => name.trim(), [name])

  const previewMutation = usePreviewPortfolioWalletCandidates()
  const createMutation = useCreatePortfolioWalletFromSelection()

  const coingeckoIds = useMemo(() => candidates.map((c) => c.coingeckoId), [candidates])
  const quotes = useCoinGeckoWatchlistCoins(coingeckoIds)

  const walletGroupPreview = useMemo(() => {
    const displayName = trimmedName || (trimmedAddress ? formatAddress(trimmedAddress) : "Wallet")
    const shortAddress = trimmedAddress ? formatAddress(trimmedAddress) : ""

    return {
      _id: "portfolio-wallet-preview",
      name: displayName,
      slug: "portfolio-wallet-preview",
      description: shortAddress ? `Portfolio wallet ${shortAddress}` : "Portfolio wallet",
      icon: "dots",
      color: "default",
      isDefault: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  }, [trimmedAddress, trimmedName])

  const selectedCoinsForPreview = useMemo(() => {
    if (step !== "select") return []
    const data = quotes.data ?? []
    return data.filter((coin) => selectedIds.has(coin.id))
  }, [quotes.data, selectedIds, step])

  const isPreviewCardLoading = useMemo(() => {
    if (step === "details") return true
    if (step === "select") return quotes.isLoading || selectedCoinsForPreview.length === 0
    return false
  }, [quotes.isLoading, selectedCoinsForPreview.length, step])

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

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen)
      if (!nextOpen) dispatch({ type: "reset" })
    },
    [onOpenChange],
  )

  const handlePreview = useCallback(async () => {
    dispatch({ type: "setLocalError", value: null })

    if (!trimmedAddress) {
      dispatch({ type: "setLocalError", value: "Enter a wallet address." })
      return
    }
    if (!isValidSolanaAddress(trimmedAddress)) {
      dispatch({
        type: "setLocalError",
        value: "That doesn’t look like a valid Solana address.",
      })
      return
    }

    try {
      const result = await previewMutation.preview(trimmedAddress)
      dispatch({
        type: "previewLoaded",
        candidates: result.candidates,
        unresolvedCount: result.unresolvedCount,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to preview wallet tokens"
      dispatch({ type: "setLocalError", value: message })
    }
  }, [previewMutation, trimmedAddress])

  const toggleSelected = useCallback((coingeckoId: string, next: boolean) => {
    dispatch({ type: "toggleSelected", coingeckoId, next })
  }, [])

  const handleSelectAllFiltered = useCallback(() => {
    dispatch({
      type: "selectFiltered",
      ids: filteredCandidates.map((c) => c.coingeckoId),
    })
  }, [filteredCandidates])

  const handleClearAll = useCallback(() => {
    dispatch({ type: "clearSelection" })
  }, [])

  const handleBackToDetails = useCallback(() => {
    dispatch({ type: "backToDetails" })
  }, [])

  const handleCreate = useCallback(async () => {
    dispatch({ type: "setLocalError", value: null })

    const selected = candidates.filter((c) => selectedIds.has(c.coingeckoId))
    if (selected.length === 0) {
      dispatch({ type: "setLocalError", value: "Select at least one token to add." })
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
      dispatch({ type: "setLocalError", value: message })
    }
  }, [candidates, createMutation, handleOpenChange, selectedIds, trimmedAddress, trimmedName])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        hideClose
        className="p-0 border-none bg-transparent shadow-none w-[calc(100vw-2rem)] max-w-[800px]"
      >
        <div className="grid gap-4 md:grid-cols-[320px_1fr] items-start">
          <div className="md:sticky md:top-6">
            <WatchlistCard
              group={walletGroupPreview}
              coins={selectedCoinsForPreview}
              selected={step === "select"}
              isLoading={isPreviewCardLoading}
            />
          </div>

          <div className="overflow-hidden rounded-[20px] border bg-card shadow-md">
            <StepHeader
              step={step}
              candidateCount={candidates.length}
              unresolvedCount={unresolvedCount}
              onBack={handleBackToDetails}
            />

            <Separator />

            {step === "details" ? (
              <WalletDetailsStep
                address={address}
                name={name}
                onAddressChange={(value) => dispatch({ type: "setAddress", value })}
                onNameChange={(value) => dispatch({ type: "setName", value })}
                localError={localError}
                isPending={previewMutation.isPending}
                onCancel={() => handleOpenChange(false)}
                onContinue={handlePreview}
              />
            ) : (
              <SelectTokensStep
                searchText={searchText}
                onSearchTextChange={(value) => dispatch({ type: "setSearchText", value })}
                filteredCandidates={filteredCandidates}
                selectedIds={selectedIds}
                coinsById={coinsById}
                isPriceLoading={quotes.isLoading}
                onToggle={toggleSelected}
                onSelectAllFiltered={handleSelectAllFiltered}
                onClearAll={handleClearAll}
                localError={localError}
                isCreating={createMutation.isPending}
                onCreate={handleCreate}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

