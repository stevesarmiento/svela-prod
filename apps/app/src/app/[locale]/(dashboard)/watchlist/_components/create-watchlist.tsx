'use client'

import { useState, useCallback, useRef } from 'react'
import { WatchlistCard } from './watchlist-card'
import { Button } from '@v1/ui/button'
import { toast } from '@v1/ui/use-toast'
import { useCreateWatchlistGroup } from '@/lib/convex-hooks'
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip"
import { Kbd } from "@v1/ui/kbd"
import { IconWidgetSmallBadgePlus } from 'symbols-react'
import { WalletIcon, WatchlistsIcon } from '@/components/watchlist-icons'
import { Dialog, DialogContent } from '@v1/ui/dialog'
import { WatchlistGroupEditorPanel } from './watchlist-group-editor-panel'

// Mock coin data for preview - Updated to match CoinGecko format
const mockCoins = [
  {
    id: "bitcoin", // CoinGecko string ID
    name: "Bitcoin",
    symbol: "BTC",
    slug: "bitcoin",
    image: "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png", // CoinGecko image URL
    cmc_rank: 1,
    circulating_supply: 19750000,
    max_supply: 21000000,
    quote: {
      USD: {
        price: 43250.32,
        percent_change_24h: 2.47,
        percent_change_1h: 0.15,
        percent_change_7d: 5.23,
        percent_change_30d: 12.45,
        market_cap: 850000000000,
        volume_24h: 25000000000
      }
    }
  },
  {
    id: "ethereum", // CoinGecko string ID
    name: "Ethereum", 
    symbol: "ETH",
    slug: "ethereum",
    image: "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png", // CoinGecko image URL
    cmc_rank: 2,
    circulating_supply: 120280000,
    max_supply: null,
    quote: {
      USD: {
        price: 2650.85,
        percent_change_24h: -1.23,
        percent_change_1h: -0.45,
        percent_change_7d: 3.67,
        percent_change_30d: 8.92,
        market_cap: 320000000000,
        volume_24h: 15000000000
      }
    }
  },
  {
    id: "solana", // CoinGecko string ID
    name: "Solana",
    symbol: "SOL",
    slug: "solana", 
    image: "https://coin-images.coingecko.com/coins/images/4128/large/solana.png", // CoinGecko image URL
    cmc_rank: 5,
    circulating_supply: 467000000,
    max_supply: null,
    quote: {
      USD: {
        price: 98.45,
        percent_change_24h: 4.82,
        percent_change_1h: 1.25,
        percent_change_7d: 7.15,
        percent_change_30d: 15.33,
        market_cap: 45000000000,
        volume_24h: 2500000000
      }
    }
  }
]

// The preview WatchlistCard never renders createdAt/updatedAt, so an inert
// constant keeps server and client renders identical (no post-mount setState).
const PREVIEW_TIMESTAMP = 0

interface CreateWatchlistProps {
  onClose: () => void
  isOpen: boolean
  /**
   * When provided, the dialog opens on a choice step (create manually vs.
   * import from a wallet); choosing import closes this dialog and hands off
   * to the wallet flow via this callback.
   */
  onImportWallet?: () => void
}

export function CreateWatchlist({ onClose, isOpen, onImportWallet }: CreateWatchlistProps) {
  const initialMode = onImportWallet ? 'choose' : 'create'
  const [mode, setMode] = useState<'choose' | 'create'>(initialMode)

  // Reset to the choice step on (re)open — during render, not in a close
  // handler, so the content doesn't visibly swap mid close-animation.
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen)
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen)
    if (isOpen) setMode(initialMode)
  }

  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState<string>('sparkles')
  const [newColor, setNewColor] = useState<string>('default')

  const createWatchlistGroup = useCreateWatchlistGroup()

  const handleCreateWatchlist = useCallback(async () => {
    if (!newName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a watchlist name",
        variant: "destructive",
      })
      return
    }

    try {
      await createWatchlistGroup(
        newName.trim(), 
        undefined, // No description
        newIcon,
        newColor
      )
      toast({
        title: "Success",
        description: "Watchlist created successfully",
      })
      onClose()
      setNewName('')
      setNewIcon('sparkles')
      setNewColor('default')
    } catch (error) {
      console.error('Failed to create watchlist:', error)
      toast({
        title: "Error",
        description: "Failed to create watchlist",
        variant: "destructive",
      })
    }
  }, [newName, newIcon, newColor, createWatchlistGroup, onClose])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  const handleImportWallet = useCallback(() => {
    onImportWallet?.()
  }, [onImportWallet])

  // Choice-step keyboard support: C / W jump straight to an option,
  // Up/Down arrows move focus between the two floating buttons.
  const createOptionRef = useRef<HTMLButtonElement>(null)
  const importOptionRef = useRef<HTMLButtonElement>(null)

  const handleChoiceKeyDown = useCallback((event: React.KeyboardEvent) => {
    const key = event.key.toLowerCase()
    if (key === 'c') {
      event.preventDefault()
      setMode('create')
      return
    }
    if (key === 'w') {
      event.preventDefault()
      handleImportWallet()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (document.activeElement === createOptionRef.current) {
        importOptionRef.current?.focus()
      } else {
        createOptionRef.current?.focus()
      }
    }
  }, [handleImportWallet])

  if (mode === 'choose') {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) handleClose()
      }}>
        <DialogContent
          hideClose
          className="p-0 border-none bg-transparent shadow-none max-w-[320px]"
          onKeyDown={handleChoiceKeyDown}
        >
          <div className="space-y-6">
            <div className="space-y-1 text-center">
              <div className="text-sm font-semibold text-white/90">New Watchlist</div>
              <div className="text-xs text-white/50 text-pretty">
                Start from scratch, or build one from a wallet’s tokens.
              </div>
            </div>

            <div className="space-y-2">
              <Button
                ref={createOptionRef}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMode('create')}
                className="w-full h-12 justify-start gap-3 px-4 rounded-full border-transparent bg-white/5 hover:bg-white/10 text-white/90"
              >
                <WatchlistsIcon className="size-4 text-white/80 shrink-0" />
                <span className="text-sm font-medium">Create Watchlist</span>
                <Kbd className="ml-auto text-[10px]">C</Kbd>
              </Button>

              <Button
                ref={importOptionRef}
                type="button"
                variant="outline"
                size="sm"
                onClick={handleImportWallet}
                className="w-full h-12 justify-start gap-3 px-4 rounded-full border-transparent bg-white/5 hover:bg-white/10 text-white/90"
              >
                <WalletIcon className="size-4 text-white/80 shrink-0" />
                <span className="text-sm font-medium">Import from Wallet</span>
                <Kbd className="ml-auto text-[10px]">W</Kbd>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClose}
                className="w-full h-10 rounded-full border-transparent bg-white/5 hover:bg-white/10 text-white/90"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) handleClose()
    }}>
                <DialogContent hideClose className="p-0 border-none bg-transparent shadow-none max-w-[320px] h-[600px]">
                {/* Preview Card */}
        <div className="relative">
          <WatchlistCard
            group={{
              _id: 'new',
              name: newName || 'New Watchlist',
              slug: 'new',
              icon: newIcon,
              color: newColor,
              isDefault: false,
              createdAt: PREVIEW_TIMESTAMP,
              updatedAt: PREVIEW_TIMESTAMP,
            }}
            coins={mockCoins}
            selected={false}
          />
        </div>

        {/* Create Panel */}
        <WatchlistGroupEditorPanel
          name={newName}
          icon={newIcon}
          color={newColor}
          onNameChange={setNewName}
          onIconChange={setNewIcon}
          onColorChange={setNewColor}
          submitLabel="Create Watchlist"
          onSubmit={handleCreateWatchlist}
          onCancel={handleClose}
        />
      </DialogContent>
    </Dialog>
  )
}

export function CreateWatchlistTrigger({ onClick }: { onClick: () => void }) {
  return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClick}
            className="h-7 pl-2 w-auto gap-2 group rounded-md"
          >
            <IconWidgetSmallBadgePlus className="h-4 w-4 fill-muted-foreground group-hover:fill-foreground" />
            <span className="text-sm">Create Watchlist</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="flex items-center gap-2 p-1 pl-2 rounded-md">
          <span>Create Watchlist</span>
          <Kbd>Shift</Kbd>
          <span>+</span>
          <Kbd>W</Kbd>
        </TooltipContent>
      </Tooltip>
  )
}