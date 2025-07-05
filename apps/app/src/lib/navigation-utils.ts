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
    charts: buildUrl('/charts'),
    watchlist: buildUrl('/watchlist'),
    overview: buildUrl('/watchlist'),
    settings: buildUrl('/settings'),
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