'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Preloaded } from 'convex/react'
import { usePreloadedQuery, useConvexAuth, useQuery } from 'convex/react'
import { useCoinGeckoQuotesBulk } from '@/hooks/use-coingecko-quotes'
import {
  buildCoinGeckoWatchlistCoin,
  type CoinGeckoWatchlistCoin,
} from '@/hooks/use-coingecko-watchlist-coins'
import { api } from '../../../../../../convex/_generated/api'
import type { SelectedWatchlistItemRow, WatchlistGroup } from './watchlist-context'

interface WatchlistsPageBootstrapValue {
  groups: WatchlistGroup[]
  defaultGroup: WatchlistGroup | null
  itemsByGroupId: Record<string, SelectedWatchlistItemRow[]>
}

export interface WatchlistsOverviewEntry {
  group: WatchlistGroup
  items: SelectedWatchlistItemRow[]
  coins: CoinGeckoWatchlistCoin[]
}

const WatchlistsPageBootstrapContext =
  createContext<WatchlistsPageBootstrapValue | null>(null)

function normalizeItemsByGroupId(
  input: Record<string, Array<{ coinId: string; holdings?: number }>>,
): Record<string, SelectedWatchlistItemRow[]> {
  const out: Record<string, SelectedWatchlistItemRow[]> = {}
  for (const [groupId, items] of Object.entries(input)) {
    out[groupId] = items.map((item) => ({
      coinId: item.coinId,
      ...(item.holdings !== undefined ? { holdings: item.holdings } : {}),
    }))
  }
  return out
}

export function WatchlistsPageBootstrapProvider(props: {
  children: ReactNode
  preloadedBootstrap: Preloaded<typeof api.watchlists.getMyWatchlistsPageBootstrap>
}) {
  const bootstrap = usePreloadedQuery(props.preloadedBootstrap)

  const value = useMemo<WatchlistsPageBootstrapValue>(
    () => ({
      groups: bootstrap.groups,
      defaultGroup: bootstrap.defaultGroup,
      itemsByGroupId: normalizeItemsByGroupId(bootstrap.itemsByGroupId),
    }),
    [bootstrap],
  )

  return (
    <WatchlistsPageBootstrapContext.Provider value={value}>
      {props.children}
    </WatchlistsPageBootstrapContext.Provider>
  )
}

/**
 * Client-side variant of the bootstrap provider: fetches the same Convex
 * bootstrap query from the browser instead of blocking the server render
 * on `preloadQuery`. Lets pages paint their chrome instantly (screener-style)
 * and render `fallback` in place of the data region until the query resolves.
 * Skips the query while Convex auth is still resolving so signed-in users
 * don't get a flash of the anonymous (empty) result.
 */
export function WatchlistsPageBootstrapClientProvider(props: {
  children: ReactNode
  fallback?: ReactNode
}) {
  const { isLoading: isAuthLoading } = useConvexAuth()
  const bootstrap = useQuery(
    api.watchlists.getMyWatchlistsPageBootstrap,
    isAuthLoading ? 'skip' : {},
  )

  const value = useMemo<WatchlistsPageBootstrapValue | null>(() => {
    if (!bootstrap) return null
    return {
      groups: bootstrap.groups,
      defaultGroup: bootstrap.defaultGroup,
      itemsByGroupId: normalizeItemsByGroupId(bootstrap.itemsByGroupId),
    }
  }, [bootstrap])

  if (!value) return <>{props.fallback ?? null}</>

  return (
    <WatchlistsPageBootstrapContext.Provider value={value}>
      {props.children}
    </WatchlistsPageBootstrapContext.Provider>
  )
}

export function useOptionalWatchlistsPageBootstrap() {
  return useContext(WatchlistsPageBootstrapContext)
}

export function useWatchlistsPageBootstrap() {
  const context = useOptionalWatchlistsPageBootstrap()
  if (!context) {
    throw new Error(
      'useWatchlistsPageBootstrap must be used within a WatchlistsPageBootstrapProvider',
    )
  }
  return context
}

export function useWatchlistsOverviewData() {
  const bootstrap = useWatchlistsPageBootstrap()

  const stableCoinIds = useMemo(() => {
    const ids = Object.values(bootstrap.itemsByGroupId).flatMap((items) =>
      items.map((item) => item.coinId),
    )
    const unique = Array.from(new Set(ids)).filter((id) => id.length > 0)
    unique.sort()
    return unique
  }, [bootstrap.itemsByGroupId])

  const quotesQuery = useCoinGeckoQuotesBulk(stableCoinIds)

  const overviewByGroupId = useMemo(() => {
    const quotesById = quotesQuery.data ?? {}
    const out = new Map<string, WatchlistsOverviewEntry>()

    for (const group of bootstrap.groups) {
      const items = bootstrap.itemsByGroupId[group._id] ?? []
      const coins = items.map((item) =>
        buildCoinGeckoWatchlistCoin(item.coinId, quotesById[item.coinId]),
      )

      out.set(group._id, {
        group,
        items,
        coins,
      })
    }

    return out
  }, [bootstrap.groups, bootstrap.itemsByGroupId, quotesQuery.data])

  return {
    ...bootstrap,
    overviewByGroupId,
    isLoading: quotesQuery.isLoading,
    isFetching: quotesQuery.isFetching,
  }
}
