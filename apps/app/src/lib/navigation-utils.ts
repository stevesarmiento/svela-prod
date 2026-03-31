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
    watchlist: buildUrl('/watchlist'),
    watchlistComparison: buildUrl('/watchlist?wt=chart'),
    overview: buildUrl('/watchlist'),
    buildUrl
  }
}

/**
 * Simple function to build URLs with watchlist preservation (for use outside of components)
 */
export function buildWatchlistUrl(basePath: string, currentSlug?: string) {
  if (!currentSlug) return basePath
  
  const separator = basePath.includes('?') ? '&' : '?'
  return `${basePath}${separator}wg=${currentSlug}`
} 