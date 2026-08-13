/**
 * Minimal CoinGecko Pro client for one-off scripts (populate-coingecko-coins).
 *
 * Replaces the dead src/lib/coingecko.ts — scripts run outside Next.js and a
 * serverless runtime, so a plain fetch helper is all that's needed here.
 */

const BASE_URL = "https://pro-api.coingecko.com/api/v3";

export interface CoinGeckoListItem {
  id: string;
  symbol: string;
  name: string;
  platforms?: Record<string, string>;
}

function getApiKey(): string {
  const key = process.env.X_CG_PRO_API_KEY;
  if (!key) {
    throw new Error(
      "CoinGecko Pro API key is not configured. Please set X_CG_PRO_API_KEY in your environment.",
    );
  }
  return key;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      "x-cg-pro-api-key": getApiKey(),
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      errorData?.error || `CoinGecko API error: ${response.status}`,
    );
  }

  return response.json();
}

export async function getCoinsList(
  includePlatform = false,
): Promise<CoinGeckoListItem[]> {
  const url = `${BASE_URL}/coins/list${includePlatform ? "?include_platform=true" : ""}`;
  const data = (await fetchJson(url)) as CoinGeckoListItem[];
  console.log(`📋 Fetched ${data.length} coins from CoinGecko`);
  return data;
}

export async function getCoinsMarketData(
  ids: string[],
  vsCurrency = "usd",
  order = "market_cap_desc",
  perPage = 250,
  page = 1,
  sparkline = false,
  priceChangePercentage = "24h",
): Promise<unknown[]> {
  const params = new URLSearchParams({
    ids: ids.join(","),
    vs_currency: vsCurrency,
    order,
    per_page: perPage.toString(),
    page: page.toString(),
    sparkline: sparkline.toString(),
    price_change_percentage: priceChangePercentage,
  });
  return (await fetchJson(`${BASE_URL}/coins/markets?${params}`)) as unknown[];
}
