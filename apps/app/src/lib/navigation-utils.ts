import { useQueryState } from 'nuqs'

/**
 * Hook to get navigation URLs that preserve the current watchlist selection
 */
export function useWatchlistPreservingNavigation() {
  const [selectedGroupSlug] = useQueryState('wg', { defaultValue: '' })

  const buildUrl = (basePath: string) => {
    if (!selectedGroupSlug) return basePath
    
    const separator = basePath.includes('?') ? '&' : '?'
    return `${basePath}${separator}wg=${selectedGroupSlug}`
  }

  return {
    // Screener is an aggregate view across all watchlists; it should NOT
    // preserve an individual watchlist selection.
    screener: '/screener',
    watchlist: buildUrl('/watchlists'),
    watchlistComparison: buildUrl('/watchlists?wt=chart'),
    overview: buildUrl('/overview'),
    buildUrl
  }
}
