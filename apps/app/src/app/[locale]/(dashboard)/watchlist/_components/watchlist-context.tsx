'use client'

import type React from 'react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import { useUser } from '@clerk/nextjs'
import type { Preloaded } from 'convex/react'
import { usePreloadedQuery } from 'convex/react'
import { usePathname } from 'next/navigation'
import { useQueryState } from 'nuqs'
import { env } from '@/env.mjs'
import type {
  WatchlistGroup as WatchlistGroupModel,
  WatchlistItem as WatchlistItemModel,
} from '@/lib/effect/watchlist-models'
import type { api } from '../../../../../../convex/_generated/api'
import {
  useAddToWatchlistGroup,
  useRemoveBulkFromWatchlist,
  useRemoveFromWatchlistGroup,
  useWatchlist as useConvexWatchlist,
  useWatchlistBySlug,
  useWatchlistGroups,
} from '@/lib/convex-hooks'

export type WatchlistGroup = WatchlistGroupModel

export interface SelectedWatchlistItemRow {
  coinId: string
  holdings?: number
}

interface WatchlistContextType {
  watchlist: string[]
  isLoading: boolean
  isInitialized: boolean
  addToWatchlist: (coinId: string) => Promise<void>
  removeFromWatchlist: (coinId: string) => Promise<void>
  removeBulkFromWatchlist: (coinIds: string[]) => Promise<void>
  watchlistGroups: WatchlistGroup[]
  selectedGroup: WatchlistGroup | null
  selectedGroupCoins: string[]
  selectedGroupItems: SelectedWatchlistItemRow[]
  isGroupsLoading: boolean
  selectWatchlistGroup: (group: WatchlistGroup | null) => void
  addToSelectedGroup: (coinId: string) => Promise<void>
  removeFromSelectedGroup: (coinId: string) => Promise<void>
  removeBulkFromSelectedGroup: (coinIds: string[]) => Promise<void>
}

const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined)
const isDebug = env.NODE_ENV === 'development'

type SelectedGroupData =
  | { group: WatchlistGroup; items: WatchlistItemModel[] }
  | null
  | undefined

function toSelectedWatchlistItems(
  items: ReadonlyArray<{ coinId: string; holdings?: number }> | undefined,
): SelectedWatchlistItemRow[] {
  if (!items?.length) return []
  return items.map((item) => ({
    coinId: item.coinId,
    ...(item.holdings !== undefined ? { holdings: item.holdings } : {}),
  }))
}

function useSelectedGroupState(args: {
  watchlistGroups: WatchlistGroup[]
  defaultGroupSlug: string
}) {
  const [selectedGroupSlug, setSelectedGroupSlug] = useQueryState('wg', {
    defaultValue: args.defaultGroupSlug,
    shallow: false,
  })

  const selectedGroup = useMemo(() => {
    if (!selectedGroupSlug) return null
    return args.watchlistGroups.find((group) => group.slug === selectedGroupSlug) ?? null
  }, [args.watchlistGroups, selectedGroupSlug])

  useEffect(() => {
    if (args.watchlistGroups.length === 0) return

    if (!selectedGroupSlug) {
      const fallbackGroup =
        args.watchlistGroups.find((group) => group.isDefault) ?? args.watchlistGroups[0]
      if (fallbackGroup) {
        if (isDebug) console.log('Auto-selecting default/first group:', fallbackGroup.name)
        void setSelectedGroupSlug(fallbackGroup.slug)
      }
      return
    }

    const groupExists = args.watchlistGroups.some((group) => group.slug === selectedGroupSlug)
    if (!groupExists) {
      const fallbackGroup =
        args.watchlistGroups.find((group) => group.isDefault) ?? args.watchlistGroups[0]
      if (fallbackGroup) {
        if (isDebug) console.log('Selected group no longer exists, falling back to default')
        void setSelectedGroupSlug(fallbackGroup.slug)
      }
    }
  }, [args.watchlistGroups, selectedGroupSlug, setSelectedGroupSlug])

  return {
    selectedGroupSlug,
    setSelectedGroupSlug,
    selectedGroup,
  }
}

function buildContextValue(args: {
  watchlist: string[]
  isLoading: boolean
  isInitialized: boolean
  watchlistGroups: WatchlistGroup[]
  selectedGroup: WatchlistGroup | null
  selectedGroupCoins: string[]
  selectedGroupItems: SelectedWatchlistItemRow[]
  isGroupsLoading: boolean
  addToWatchlist: (coinId: string) => Promise<void>
  removeFromWatchlist: (coinId: string) => Promise<void>
  removeBulkFromWatchlist: (coinIds: string[]) => Promise<void>
  selectWatchlistGroup: (group: WatchlistGroup | null) => void
  addToSelectedGroup: (coinId: string) => Promise<void>
  removeFromSelectedGroup: (coinId: string) => Promise<void>
  removeBulkFromSelectedGroup: (coinIds: string[]) => Promise<void>
}): WatchlistContextType {
  return {
    watchlist: args.watchlist,
    isLoading: args.isLoading,
    isInitialized: args.isInitialized,
    addToWatchlist: args.addToWatchlist,
    removeFromWatchlist: args.removeFromWatchlist,
    removeBulkFromWatchlist: args.removeBulkFromWatchlist,
    watchlistGroups: args.watchlistGroups,
    selectedGroup: args.selectedGroup,
    selectedGroupCoins: args.selectedGroupCoins,
    selectedGroupItems: args.selectedGroupItems,
    isGroupsLoading: args.isGroupsLoading,
    selectWatchlistGroup: args.selectWatchlistGroup,
    addToSelectedGroup: args.addToSelectedGroup,
    removeFromSelectedGroup: args.removeFromSelectedGroup,
    removeBulkFromSelectedGroup: args.removeBulkFromSelectedGroup,
  }
}

function shouldResolveSelectedGroupForPath(pathname: string): boolean {
  const cleanPath = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/'

  return (
    cleanPath === '/watchlist' ||
    cleanPath.startsWith('/watchlist/') ||
    cleanPath === '/watchlists' ||
    cleanPath.startsWith('/watchlists/') ||
    cleanPath === '/charts' ||
    cleanPath.startsWith('/charts/')
  )
}

export function WatchlistProvider(props: {
  children: React.ReactNode
  preloadedBootstrap?: Preloaded<typeof api.watchlists.getMyWatchlistNavBootstrap>
}) {
  if (props.preloadedBootstrap) {
    return (
      <WatchlistProviderPreloaded preloadedBootstrap={props.preloadedBootstrap}>
        {props.children}
      </WatchlistProviderPreloaded>
    )
  }

  return <WatchlistProviderLive>{props.children}</WatchlistProviderLive>
}

function WatchlistProviderPreloaded(props: {
  children: React.ReactNode
  preloadedBootstrap: Preloaded<typeof api.watchlists.getMyWatchlistNavBootstrap>
}) {
  const { user, isLoaded } = useUser()
  const pathname = usePathname()
  const bootstrap = usePreloadedQuery(props.preloadedBootstrap)
  const addToConvexWatchlistGroup = useAddToWatchlistGroup()
  const removeFromConvexWatchlistGroup = useRemoveFromWatchlistGroup()
  const removeBulkFromConvexWatchlist = useRemoveBulkFromWatchlist()

  const watchlistGroups = bootstrap.groups
  const defaultGroupSlug = bootstrap.defaultGroup?.slug ?? ''
  const { selectedGroupSlug, setSelectedGroupSlug, selectedGroup } = useSelectedGroupState({
    watchlistGroups,
    defaultGroupSlug,
  })
  const shouldResolveSelectedGroup = shouldResolveSelectedGroupForPath(pathname)

  const selectedGroupData = useWatchlistBySlug(
    shouldResolveSelectedGroup ? selectedGroupSlug : undefined,
  ) as SelectedGroupData
  const selectedGroupItems = useMemo(
    () => toSelectedWatchlistItems(selectedGroupData?.items),
    [selectedGroupData?.items],
  )
  const selectedGroupCoins = useMemo(
    () => selectedGroupItems.map((item) => item.coinId),
    [selectedGroupItems],
  )

  const watchlist = useMemo(() => {
    if (selectedGroup?.isDefault) return selectedGroupCoins
    if (isLoaded && !user) return []
    return []
  }, [selectedGroup?.isDefault, selectedGroupCoins, isLoaded, user])

  const addToWatchlist = useCallback(
    async (coinId: string) => {
      if (!user) throw new Error('Not authenticated')
      await addToConvexWatchlistGroup(coinId)
    },
    [user, addToConvexWatchlistGroup],
  )

  const removeFromWatchlist = useCallback(
    async (coinId: string) => {
      if (!user) return
      await removeFromConvexWatchlistGroup(coinId)
    },
    [user, removeFromConvexWatchlistGroup],
  )

  const removeBulkFromWatchlist = useCallback(
    async (coinIds: string[]) => {
      if (!user) return
      await removeBulkFromConvexWatchlist(coinIds)
    },
    [user, removeBulkFromConvexWatchlist],
  )

  const selectWatchlistGroup = useCallback(
    (group: WatchlistGroup | null) => {
      if (isDebug) console.log('Selecting watchlist group:', group?.name)
      void setSelectedGroupSlug(group?.slug || '')
    },
    [setSelectedGroupSlug],
  )

  const addToSelectedGroup = useCallback(
    async (coinId: string) => {
      if (!user || !selectedGroup) throw new Error('Not authenticated or no group selected')
      await addToConvexWatchlistGroup(coinId, selectedGroup._id)
    },
    [user, selectedGroup, addToConvexWatchlistGroup],
  )

  const removeFromSelectedGroup = useCallback(
    async (coinId: string) => {
      if (!user || !selectedGroup) return
      await removeFromConvexWatchlistGroup(coinId, selectedGroup._id)
    },
    [user, selectedGroup, removeFromConvexWatchlistGroup],
  )

  const removeBulkFromSelectedGroup = useCallback(
    async (coinIds: string[]) => {
      if (!user || !selectedGroup) return
      await removeBulkFromConvexWatchlist(coinIds, selectedGroup._id)
    },
    [user, selectedGroup, removeBulkFromConvexWatchlist],
  )

  const contextValue = useMemo(
    () =>
      buildContextValue({
        watchlist,
        isLoading: !isLoaded,
        isInitialized: isLoaded,
        watchlistGroups,
        selectedGroup,
        selectedGroupCoins,
        selectedGroupItems,
        isGroupsLoading: false,
        addToWatchlist,
        removeFromWatchlist,
        removeBulkFromWatchlist,
        selectWatchlistGroup,
        addToSelectedGroup,
        removeFromSelectedGroup,
        removeBulkFromSelectedGroup,
      }),
    [
      watchlist,
      isLoaded,
      watchlistGroups,
      selectedGroup,
      selectedGroupCoins,
      selectedGroupItems,
      addToWatchlist,
      removeFromWatchlist,
      removeBulkFromWatchlist,
      selectWatchlistGroup,
      addToSelectedGroup,
      removeFromSelectedGroup,
      removeBulkFromSelectedGroup,
    ],
  )

  const Provider = WatchlistContext.Provider as React.FC<{
    value: WatchlistContextType
    children: ReactNode
  }>
  return <Provider value={contextValue}>{props.children}</Provider>
}

// Stable identity for the loading state — an inline `?? []` creates a new
// array every render, churning every downstream memo/effect/context value
// until Convex resolves.
const EMPTY_GROUPS: WatchlistGroup[] = []

function WatchlistProviderLive({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser()
  const pathname = usePathname()
  const convexWatchlist = useConvexWatchlist() as Array<WatchlistItemModel> | undefined
  const watchlistGroups = (useWatchlistGroups() as WatchlistGroup[] | undefined) ?? EMPTY_GROUPS
  const addToConvexWatchlistGroup = useAddToWatchlistGroup()
  const removeFromConvexWatchlistGroup = useRemoveFromWatchlistGroup()
  const removeBulkFromConvexWatchlist = useRemoveBulkFromWatchlist()

  const defaultGroupSlug =
    watchlistGroups.find((group) => group.isDefault)?.slug ?? watchlistGroups[0]?.slug ?? ''
  const { selectedGroupSlug, setSelectedGroupSlug, selectedGroup } = useSelectedGroupState({
    watchlistGroups,
    defaultGroupSlug,
  })
  const shouldResolveSelectedGroup = shouldResolveSelectedGroupForPath(pathname)

  const selectedGroupData = useWatchlistBySlug(
    shouldResolveSelectedGroup ? selectedGroupSlug : undefined,
  ) as SelectedGroupData
  const selectedGroupItems = useMemo(
    () => toSelectedWatchlistItems(selectedGroupData?.items),
    [selectedGroupData?.items],
  )
  const selectedGroupCoins = useMemo(
    () => selectedGroupItems.map((item) => item.coinId),
    [selectedGroupItems],
  )

  const watchlist = useMemo(() => {
    if (selectedGroup?.isDefault) return selectedGroupCoins
    if (Array.isArray(convexWatchlist) && isLoaded) {
      return convexWatchlist.map((item) => item.coinId)
    }
    if (isLoaded && !user) return []
    return []
  }, [selectedGroup?.isDefault, selectedGroupCoins, convexWatchlist, isLoaded, user])

  const addToWatchlist = useCallback(
    async (coinId: string) => {
      if (!user) throw new Error('Not authenticated')
      await addToConvexWatchlistGroup(coinId)
    },
    [user, addToConvexWatchlistGroup],
  )

  const removeFromWatchlist = useCallback(
    async (coinId: string) => {
      if (!user) return
      await removeFromConvexWatchlistGroup(coinId)
    },
    [user, removeFromConvexWatchlistGroup],
  )

  const removeBulkFromWatchlist = useCallback(
    async (coinIds: string[]) => {
      if (!user) return
      await removeBulkFromConvexWatchlist(coinIds)
    },
    [user, removeBulkFromConvexWatchlist],
  )

  const selectWatchlistGroup = useCallback(
    (group: WatchlistGroup | null) => {
      if (isDebug) console.log('Selecting watchlist group:', group?.name)
      void setSelectedGroupSlug(group?.slug || '')
    },
    [setSelectedGroupSlug],
  )

  const addToSelectedGroup = useCallback(
    async (coinId: string) => {
      if (!user || !selectedGroup) throw new Error('Not authenticated or no group selected')
      await addToConvexWatchlistGroup(coinId, selectedGroup._id)
    },
    [user, selectedGroup, addToConvexWatchlistGroup],
  )

  const removeFromSelectedGroup = useCallback(
    async (coinId: string) => {
      if (!user || !selectedGroup) return
      await removeFromConvexWatchlistGroup(coinId, selectedGroup._id)
    },
    [user, selectedGroup, removeFromConvexWatchlistGroup],
  )

  const removeBulkFromSelectedGroup = useCallback(
    async (coinIds: string[]) => {
      if (!user || !selectedGroup) return
      await removeBulkFromConvexWatchlist(coinIds, selectedGroup._id)
    },
    [user, selectedGroup, removeBulkFromConvexWatchlist],
  )

  const contextValue = useMemo(
    () =>
      buildContextValue({
        watchlist,
        isLoading: !isLoaded || (Boolean(user) && convexWatchlist === undefined),
        isInitialized: isLoaded,
        watchlistGroups,
        selectedGroup,
        selectedGroupCoins,
        selectedGroupItems,
        isGroupsLoading: Boolean(user) && watchlistGroups.length === 0 && !selectedGroupSlug,
        addToWatchlist,
        removeFromWatchlist,
        removeBulkFromWatchlist,
        selectWatchlistGroup,
        addToSelectedGroup,
        removeFromSelectedGroup,
        removeBulkFromSelectedGroup,
      }),
    [
      watchlist,
      isLoaded,
      user,
      convexWatchlist,
      watchlistGroups,
      selectedGroup,
      selectedGroupCoins,
      selectedGroupItems,
      selectedGroupSlug,
      addToWatchlist,
      removeFromWatchlist,
      removeBulkFromWatchlist,
      selectWatchlistGroup,
      addToSelectedGroup,
      removeFromSelectedGroup,
      removeBulkFromSelectedGroup,
    ],
  )

  const Provider = WatchlistContext.Provider as React.FC<{
    value: WatchlistContextType
    children: ReactNode
  }>
  return <Provider value={contextValue}>{children}</Provider>
}

export function useWatchlist() {
  const context = useContext(WatchlistContext)
  if (context === undefined) {
    throw new Error('useWatchlist must be used within a WatchlistProvider')
  }
  return context
}
