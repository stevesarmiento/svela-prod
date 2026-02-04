'use client'

import { useState, useCallback } from 'react'
import { WatchlistCard } from './watchlist-card'
import { Button } from '@v1/ui/button'
import { toast } from '@v1/ui/use-toast'
import { useCreateWatchlistGroup } from '@/lib/convex-hooks'
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip"
import { Kbd } from "@v1/ui/kbd"
import { IconWidgetSmallBadgePlus } from 'symbols-react'
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

interface CreateWatchlistProps {
  onClose: () => void
  isOpen: boolean
}

export function CreateWatchlist({ onClose, isOpen }: CreateWatchlistProps) {
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) handleClose()
    }}>
                <DialogContent className="p-0 border-none bg-transparent shadow-none max-w-[320px] h-[600px]">
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
              createdAt: Date.now(),
              updatedAt: Date.now(),
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