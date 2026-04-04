"use client"

const CACHE_KEY_PREFIX = "SVELA_PYTH_HERMES_FEED_ID_BY_SYMBOL:v2:"
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

interface CachedFeedId {
  feedId: string
  cachedAtMs: number
}

function readCache(symbolUpper: string): string | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(`${CACHE_KEY_PREFIX}${symbolUpper}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedFeedId
    if (!parsed?.feedId || !parsed?.cachedAtMs) return null
    if (Date.now() - parsed.cachedAtMs > CACHE_TTL_MS) return null
    return parsed.feedId
  } catch {
    return null
  }
}

function writeCache(symbolUpper: string, feedId: string): void {
  if (typeof window === "undefined") return
  try {
    const payload: CachedFeedId = { feedId, cachedAtMs: Date.now() }
    window.localStorage.setItem(`${CACHE_KEY_PREFIX}${symbolUpper}`, JSON.stringify(payload))
  } catch {
    // ignore
  }
}

function normalizeFeedId(feedId: string): string {
  return feedId.startsWith("0x") ? feedId.slice(2) : feedId
}

type HermesFeedRow = {
  id?: string
  attributes?: {
    asset_type?: string
    base?: string
    quote_currency?: string
    display_symbol?: string
    description?: string
    symbol?: string
    generic_symbol?: string
  }
}

/**
 * Resolve a crypto/USD Hermes feed id from a token symbol (e.g. "BONK" -> BONK/USD).
 * Uses localStorage cache to avoid repeated metadata fetches.
 */
export async function resolveHermesCryptoUsdFeedId(symbol: string): Promise<string | null> {
  const symbolUpper = symbol.trim().toUpperCase()
  if (!symbolUpper) return null

  const cached = readCache(symbolUpper)
  if (cached) return cached

  const query = encodeURIComponent(`${symbolUpper}/USD`)
  const url = `https://hermes.pyth.network/v2/price_feeds?query=${query}`

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  })
  if (!res.ok) return null

  const json = (await res.json()) as unknown
  if (!Array.isArray(json) || json.length === 0) return null

  const rows = json as HermesFeedRow[]
  const cryptoUsd = rows.filter((row) => {
    const attr = row.attributes
    if (!attr) return false
    if (attr.asset_type !== "Crypto") return false
    if (attr.quote_currency !== "USD") return false
    if (!attr.base) return false
    return true
  })

  // Critical: do NOT guess for ambiguous symbols (META -> equity feeds, PEPE -> KPEPE 1000x unit feeds).
  // Only accept an exact base-symbol match.
  const exact =
    cryptoUsd.find((row) => row.attributes?.base === symbolUpper && row.attributes?.display_symbol === `${symbolUpper}/USD`) ??
    cryptoUsd.find((row) => row.attributes?.base === symbolUpper)

  const id = exact?.id
  if (!id || typeof id !== "string") return null

  const normalized = normalizeFeedId(id)
  writeCache(symbolUpper, normalized)
  return normalized
}

