'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@v1/ui/button'
import { Kbd } from '@v1/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@v1/ui/tooltip'
import { useBottomNavActions } from '@/components/navigation/bottom-nav-context'
import { AddTokenIcon, CreateWatchlistIcon } from '@/components/watchlist-icons'
import { GLOBAL_SHORTCUTS, matchesShortcut } from '@/lib/keyboard-shortcuts'

function loadCreateWatchlist() {
  return import('./create-watchlist')
}

function loadAddWalletDialog() {
  return import('@/app/[locale]/(dashboard)/portfolio/_components/add-wallet-dialog')
}

const LazyCreateWatchlist = dynamic(
  () => loadCreateWatchlist().then((module) => module.CreateWatchlist),
  { ssr: false },
)

const LazyAddWalletDialog = dynamic(
  () => loadAddWalletDialog().then((module) => module.AddWalletDialog),
  { ssr: false },
)

interface WatchlistQuickActionsProps {
  /**
   * Also register the Shift+N / Shift+A global shortcuts. Leave off on pages
   * that wire these up themselves (e.g. the watchlists page).
   */
  withShortcuts?: boolean
}

/**
 * The Create Watchlist + Add Token icon triggers with their dialogs, for any
 * route where tokens/watchlists can be added (watchlists, comparison, …).
 * "Add Token" opens the bottom-nav command search in watchlist context.
 */
export function WatchlistQuickActions({ withShortcuts = false }: WatchlistQuickActionsProps) {
  const [isCreatingWatchlist, setIsCreatingWatchlist] = useState(false)
  const [isAddWalletOpen, setIsAddWalletOpen] = useState(false)

  const { openContextualCommandSearch } = useBottomNavActions()

  const preloadCreateWatchlist = useCallback(() => {
    void loadCreateWatchlist()
    // The create dialog's first step offers "Import from Wallet" — preload
    // that flow too so choosing it is instant.
    void loadAddWalletDialog()
  }, [])

  const openCreateWatchlist = useCallback(() => {
    preloadCreateWatchlist()
    setIsCreatingWatchlist(true)
  }, [preloadCreateWatchlist])

  const openAddToken = useCallback(() => {
    openContextualCommandSearch('watchlist')
  }, [openContextualCommandSearch])

  useEffect(() => {
    if (!withShortcuts) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return

      const createWatchlistShortcut = GLOBAL_SHORTCUTS.find(s => s.handler === 'openCreateWatchlist')
      const addTokenShortcut = GLOBAL_SHORTCUTS.find(s => s.handler === 'focusAddToken')

      if (createWatchlistShortcut && matchesShortcut(event, createWatchlistShortcut)) {
        event.preventDefault()
        openCreateWatchlist()
        return
      }
      if (addTokenShortcut && matchesShortcut(event, addTokenShortcut)) {
        event.preventDefault()
        openAddToken()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [withShortcuts, openCreateWatchlist, openAddToken])

  return (
    <>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={openCreateWatchlist}
              onMouseEnter={preloadCreateWatchlist}
              onFocus={preloadCreateWatchlist}
              aria-label="Create Watchlist"
              className="group h-7 w-7 p-0 rounded-md bg-accent hover:bg-accent/90 hover:ring-1 ring-primary/10"
            >
              <CreateWatchlistIcon className="size-4.5 text-muted-foreground group-hover:text-primary" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="flex items-center gap-2 p-1 pl-2 rounded-md text-xs">
            <span>Create Watchlist</span>
            <Kbd className="text-[10px]">Shift</Kbd>
            <Kbd className="text-[10px] font-diatype-bold">N</Kbd>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={openAddToken}
              aria-label="Add Token"
              className="group h-7 w-7 p-0 rounded-md bg-accent hover:bg-accent/90 hover:ring-1 ring-primary/10"
            >
              <AddTokenIcon className="size-4.5 text-muted-foreground group-hover:text-primary" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="flex items-center gap-2 p-1 pl-2 rounded-md text-xs">
            <span>Add Token</span>
            <Kbd className="text-[10px]">Shift</Kbd>
            <Kbd className="text-[10px] font-diatype-bold">A</Kbd>
          </TooltipContent>
        </Tooltip>
      </div>

      <LazyCreateWatchlist
        isOpen={isCreatingWatchlist}
        onClose={() => setIsCreatingWatchlist(false)}
        onImportWallet={() => {
          setIsCreatingWatchlist(false)
          setIsAddWalletOpen(true)
        }}
      />

      <LazyAddWalletDialog open={isAddWalletOpen} onOpenChange={setIsAddWalletOpen} />
    </>
  )
}
