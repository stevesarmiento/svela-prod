import type { OverviewEvent } from "@/app/[locale]/(dashboard)/overview/overview-events-feed-card/types";
import type { BreadthGroupRow } from "@/app/[locale]/(dashboard)/overview/overview-portfolio-breadth";
import { env } from "@/env.mjs";
import {
  COINGECKO_PRO_BASE_URL,
  type CoinGeckoMarketsRow,
  coingeckoHeaders,
  decodeMarketsRows,
} from "@/lib/effect/server/vendors/coingecko";
import { computeBreadthStats } from "@/lib/overview-daily-brief";
import type {
  LoginShowcaseData,
  SeriesPoint,
  ShowcaseCoin,
  ShowcaseOverview,
  ShowcaseWatchlist,
} from "./showcase-types";

/**
 * Server-side showcase data for the login product preview.
 *
 * One CoinGecko `coins/markets` call (5-min ISR revalidate) shaped into the
 * app's own types so the preview can render the REAL dashboard components
 * with zero client-side fetching. Every derivation is deterministic (no
 * `Math.random`, no per-render clocks) so SSR and hydration agree.
 */

const COINGECKO_PUBLIC_BASE_URL = "https://api.coingecko.com/api/v3";
const REVALIDATE_SECONDS = 300;
const HOUR_SECONDS = 3600;
const HOUR_MS = HOUR_SECONDS * 1000;
/** Points used for the 1d aggregate (25 hourly samples = 24h of deltas). */
const AGGREGATE_POINTS = 25;
const SCREENER_ROW_COUNT = 7;
const SCREENER_MIN_VOLUME_USD = 100_000_000;
const PORTFOLIO_BASE_USD = 125_000;

const ALLOWED_IMAGE_HOSTS = new Set([
  "coin-images.coingecko.com",
  "assets.coingecko.com",
]);

interface ShowcaseWatchlistDefinition {
  slug: string;
  name: string;
  icon: string;
  color: string;
  coinIds: ReadonlyArray<string>;
}

const WATCHLIST_DEFINITIONS: ReadonlyArray<ShowcaseWatchlistDefinition> = [
  {
    slug: "majors",
    name: "Majors",
    icon: "diamond",
    color: "crimson",
    coinIds: ["solana", "bitcoin", "ethereum"],
  },
  {
    slug: "solana-bluechip",
    name: "Solana Bluechip",
    icon: "sparkles",
    color: "indigo",
    coinIds: [
      "kamino",
      "jupiter-exchange-solana",
      "drift-protocol",
      "jito-governance-token",
      "marinade",
      "pyth-network",
      "seeker",
      "doublezero",
      "meteora",
    ],
  },
  {
    slug: "eth-defi",
    name: "ETH DeFi",
    icon: "infinity",
    color: "violet",
    coinIds: [
      "compound-governance-token",
      "hyperliquid",
      "lido-dao",
      "uniswap",
      "aave",
    ],
  },
  {
    slug: "l1-arena",
    name: "L1 Arena",
    icon: "trophy",
    color: "orange",
    coinIds: [
      "aptos",
      "sui",
      "solana",
      "near",
      "avalanche-2",
      "cardano",
      "tron",
      "canton-network",
      "polkadot",
    ],
  },
  {
    slug: "boomerfi",
    name: "BoomerFi",
    icon: "banknote",
    color: "slate",
    coinIds: [
      "tesla-xstock",
      "nvidia-xstock",
      "circle-xstock",
      "alphabet-xstock",
      "meta-xstock",
      "coinbase-xstock",
      "apple-xstock",
    ],
  },
  {
    slug: "ownership",
    name: "Ownership",
    icon: "seal",
    color: "green",
    coinIds: [
      "umbra",
      "meta-2-2",
      "avici",
      "omnipair",
      "flash-trade",
      "loyal",
      "p2p-protocol",
    ],
  },
  {
    slug: "shhhh",
    name: "Shhhh",
    icon: "eye",
    color: "ink",
    coinIds: ["zcash", "monero"],
  },
  {
    slug: "murica",
    name: "Murica",
    icon: "flag",
    color: "amber",
    coinIds: ["sp500-xstock", "nasdaq-xstock"],
  },
];

/** Watchlists whose coins make up the showcase "portfolio" series. */
const PORTFOLIO_WATCHLIST_SLUGS = new Set(["majors", "solana-bluechip"]);

// ---------------------------------------------------------------------------
// Fallback fixtures (used when CoinGecko is unreachable or a list is too thin)
// ---------------------------------------------------------------------------

interface FallbackCoin {
  id: string;
  name: string;
  symbol: string;
  price: number;
  marketCap: number;
  volume24h: number;
  change24h: number;
  /** 7d trend used to shape the synthetic sparkline. */
  trend7d: number;
  rank: number;
  image: string;
}

const FALLBACK_COINS: ReadonlyArray<FallbackCoin> = [
  { id: "bitcoin", name: "Bitcoin", symbol: "BTC", price: 118_204.1, marketCap: 2.4e12, volume24h: 38.1e9, change24h: 3.24, trend7d: 4.1, rank: 1, image: "/logos/popular/bitcoin.svg" },
  { id: "ethereum", name: "Ethereum", symbol: "ETH", price: 3_624.55, marketCap: 437.2e9, volume24h: 21.4e9, change24h: 2.71, trend7d: 5.6, rank: 2, image: "/logos/popular/ethereum.svg" },
  { id: "solana", name: "Solana", symbol: "SOL", price: 172.35, marketCap: 93.4e9, volume24h: 5.2e9, change24h: 6.08, trend7d: 9.8, rank: 5, image: "/logos/popular/solana.svg" },
  { id: "tron", name: "TRON", symbol: "TRX", price: 0.3412, marketCap: 32.3e9, volume24h: 1.1e9, change24h: 0.42, trend7d: 1.2, rank: 9, image: "/logos/popular/tron.svg" },
  { id: "cardano", name: "Cardano", symbol: "ADA", price: 0.8821, marketCap: 31.4e9, volume24h: 1.4e9, change24h: -0.61, trend7d: -2.3, rank: 10, image: "/logos/popular/cardano.svg" },
  { id: "hyperliquid", name: "Hyperliquid", symbol: "HYPE", price: 44.12, marketCap: 14.7e9, volume24h: 612.4e6, change24h: 5.31, trend7d: 12.4, rank: 12, image: "/logos/popular/hyperliquid.svg" },
  { id: "sui", name: "Sui", symbol: "SUI", price: 3.42, marketCap: 11.9e9, volume24h: 908.1e6, change24h: 4.12, trend7d: 6.9, rank: 14, image: "/logos/popular/sui.svg" },
  { id: "avalanche-2", name: "Avalanche", symbol: "AVAX", price: 27.18, marketCap: 11.4e9, volume24h: 620.5e6, change24h: 1.92, trend7d: 3.3, rank: 16, image: "" },
  { id: "near", name: "NEAR Protocol", symbol: "NEAR", price: 4.86, marketCap: 6.1e9, volume24h: 412.2e6, change24h: 2.14, trend7d: 4.7, rank: 22, image: "" },
  { id: "uniswap", name: "Uniswap", symbol: "UNI", price: 9.14, marketCap: 6.9e9, volume24h: 412.8e6, change24h: 2.93, trend7d: 3.8, rank: 24, image: "/logos/popular/uniswap.svg" },
  { id: "aptos", name: "Aptos", symbol: "APT", price: 8.02, marketCap: 4.6e9, volume24h: 301.2e6, change24h: -1.18, trend7d: -4.2, rank: 27, image: "/logos/popular/aptos.svg" },
  { id: "polkadot", name: "Polkadot", symbol: "DOT", price: 5.12, marketCap: 7.8e9, volume24h: 288.4e6, change24h: 0.88, trend7d: 1.1, rank: 28, image: "" },
  { id: "monero", name: "Monero", symbol: "XMR", price: 312.4, marketCap: 5.8e9, volume24h: 94.2e6, change24h: 1.47, trend7d: 2.6, rank: 30, image: "" },
  { id: "aave", name: "Aave", symbol: "AAVE", price: 318.6, marketCap: 4.8e9, volume24h: 402.3e6, change24h: 1.63, trend7d: 5.1, rank: 31, image: "" },
  { id: "zcash", name: "Zcash", symbol: "ZEC", price: 58.2, marketCap: 950e6, volume24h: 132.6e6, change24h: 1.26, trend7d: 7.4, rank: 62, image: "" },
  { id: "jupiter-exchange-solana", name: "Jupiter", symbol: "JUP", price: 0.612, marketCap: 1.9e9, volume24h: 186.1e6, change24h: 2.28, trend7d: 3.9, rank: 66, image: "" },
  { id: "lido-dao", name: "Lido DAO", symbol: "LDO", price: 1.42, marketCap: 1.3e9, volume24h: 98.7e6, change24h: 0.74, trend7d: -0.8, rank: 72, image: "" },
  { id: "jito-governance-token", name: "Jito", symbol: "JTO", price: 2.84, marketCap: 983.2e6, volume24h: 187.5e6, change24h: 3.66, trend7d: 6.2, rank: 84, image: "/logos/popular/jito.svg" },
  { id: "pyth-network", name: "Pyth Network", symbol: "PYTH", price: 0.168, marketCap: 970e6, volume24h: 78.4e6, change24h: -0.92, trend7d: -1.9, rank: 88, image: "" },
  { id: "kamino", name: "Kamino", symbol: "KMNO", price: 0.0821, marketCap: 210e6, volume24h: 22.1e6, change24h: 1.12, trend7d: 2.2, rank: 190, image: "" },
  { id: "drift-protocol", name: "Drift", symbol: "DRIFT", price: 0.742, marketCap: 260e6, volume24h: 31.8e6, change24h: -1.42, trend7d: -3.1, rank: 180, image: "" },
  { id: "compound-governance-token", name: "Compound", symbol: "COMP", price: 48.6, marketCap: 440e6, volume24h: 46.2e6, change24h: 0.36, trend7d: 1.4, rank: 140, image: "" },
  { id: "doublezero", name: "DoubleZero", symbol: "2Z", price: 0.412, marketCap: 120e6, volume24h: 18.6e6, change24h: 2.81, trend7d: 5.5, rank: 260, image: "/logos/popular/doublezero.svg" },
  { id: "tesla-xstock", name: "Tesla xStock", symbol: "TSLAx", price: 342.18, marketCap: 44.2e6, volume24h: 9.8e6, change24h: 1.84, trend7d: 3.2, rank: 420, image: "" },
  { id: "nvidia-xstock", name: "NVIDIA xStock", symbol: "NVDAx", price: 176.42, marketCap: 38.1e6, volume24h: 12.4e6, change24h: 2.06, trend7d: 4.4, rank: 430, image: "" },
  { id: "circle-xstock", name: "Circle xStock", symbol: "CRCLx", price: 128.7, marketCap: 9.6e6, volume24h: 3.1e6, change24h: -0.82, trend7d: -2.6, rank: 480, image: "" },
  { id: "alphabet-xstock", name: "Alphabet xStock", symbol: "GOOGLx", price: 214.3, marketCap: 12.4e6, volume24h: 4.2e6, change24h: 0.64, trend7d: 1.9, rank: 470, image: "" },
  { id: "meta-xstock", name: "Meta xStock", symbol: "METAx", price: 742.1, marketCap: 8.2e6, volume24h: 2.8e6, change24h: 1.12, trend7d: 2.4, rank: 490, image: "" },
  { id: "coinbase-xstock", name: "Coinbase xStock", symbol: "COINx", price: 318.4, marketCap: 10.3e6, volume24h: 3.6e6, change24h: 2.42, trend7d: 6.1, rank: 485, image: "" },
  { id: "apple-xstock", name: "Apple xStock", symbol: "AAPLx", price: 232.6, marketCap: 14.1e6, volume24h: 4.9e6, change24h: 0.48, trend7d: 1.3, rank: 460, image: "" },
  { id: "sp500-xstock", name: "S&P 500 xStock", symbol: "SPYx", price: 642.3, marketCap: 22.8e6, volume24h: 7.1e6, change24h: 0.72, trend7d: 1.6, rank: 440, image: "" },
  { id: "nasdaq-xstock", name: "Nasdaq xStock", symbol: "QQQx", price: 571.2, marketCap: 18.4e6, volume24h: 6.3e6, change24h: 1.02, trend7d: 2.1, rank: 450, image: "" },
  { id: "umbra", name: "Umbra", symbol: "UMBRA", price: 0.284, marketCap: 64e6, volume24h: 8.4e6, change24h: 4.62, trend7d: 11.2, rank: 620, image: "" },
  { id: "meta-2-2", name: "Meta", symbol: "META", price: 0.0412, marketCap: 21e6, volume24h: 2.4e6, change24h: -2.14, trend7d: -6.8, rank: 880, image: "" },
  { id: "avici", name: "Avici", symbol: "AVICI", price: 0.118, marketCap: 32e6, volume24h: 3.9e6, change24h: 1.36, trend7d: 3.4, rank: 760, image: "" },
  { id: "flash-trade", name: "Flash Trade", symbol: "FLASH", price: 0.062, marketCap: 18e6, volume24h: 1.7e6, change24h: 0.92, trend7d: 2.8, rank: 940, image: "" },
  { id: "loyal", name: "Loyal", symbol: "LOYAL", price: 0.0186, marketCap: 9e6, volume24h: 0.9e6, change24h: -0.44, trend7d: -1.2, rank: 1200, image: "" },
];

/**
 * Deterministic 168-point (7d hourly) price path that ends at `price` and
 * drifts by `trendPct` over the window, with two gentle harmonics for texture.
 */
function syntheticSparkline(price: number, trendPct: number): number[] {
  const points = 168;
  const start = price / (1 + trendPct / 100);
  return Array.from({ length: points }, (_, index) => {
    const t = index / (points - 1);
    const drift = start + (price - start) * t;
    const wobble = 0.012 * Math.sin(index / 7) + 0.006 * Math.sin(index / 3.1);
    // Pin the last sample to the quoted price.
    return index === points - 1 ? price : drift * (1 + wobble);
  });
}

function fallbackRows(): ReadonlyArray<CoinGeckoMarketsRow> {
  return FALLBACK_COINS.map((coin) => ({
    id: coin.id,
    symbol: coin.symbol.toLowerCase(),
    name: coin.name,
    image: coin.image,
    sparkline_in_7d: { price: syntheticSparkline(coin.price, coin.trend7d) },
    current_price: coin.price,
    market_cap: coin.marketCap,
    market_cap_rank: coin.rank,
    total_volume: coin.volume24h,
    price_change_percentage_24h: coin.change24h,
    price_change_percentage_7d_in_currency: coin.trend7d,
    circulating_supply: coin.marketCap / coin.price,
    max_supply: null,
  }));
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function fetchMarketRows(
  coinIds: ReadonlyArray<string>,
): Promise<ReadonlyArray<CoinGeckoMarketsRow> | null> {
  const apiKey = env.X_CG_PRO_API_KEY;
  const base = apiKey ? COINGECKO_PRO_BASE_URL : COINGECKO_PUBLIC_BASE_URL;
  const url = new URL(`${base}/coins/markets`);
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("ids", coinIds.join(","));
  url.searchParams.set("per_page", String(Math.min(250, coinIds.length)));
  url.searchParams.set("page", "1");
  url.searchParams.set("sparkline", "true");
  url.searchParams.set("price_change_percentage", "24h,7d");

  try {
    const response = await fetch(url.toString(), {
      headers: apiKey ? coingeckoHeaders(apiKey) : { Accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!response.ok) return null;
    const rows = decodeMarketsRows(await response.json());
    return rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shaping
// ---------------------------------------------------------------------------

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function safeImage(image: string | undefined): string {
  if (!image) return "";
  if (image.startsWith("/")) return image;
  try {
    return ALLOWED_IMAGE_HOSTS.has(new URL(image).hostname) ? image : "";
  } catch {
    return "";
  }
}

function toShowcaseCoin(row: CoinGeckoMarketsRow): ShowcaseCoin | null {
  const price = row.current_price;
  const change24h = row.price_change_percentage_24h;
  if (!isFiniteNumber(price) || price <= 0 || !isFiniteNumber(change24h)) return null;

  const sparkline = (row.sparkline_in_7d?.price ?? []).filter(
    (value) => isFiniteNumber(value) && value > 0,
  );

  return {
    id: row.id,
    name: row.name,
    symbol: row.symbol.toUpperCase(),
    slug: row.id,
    image: safeImage(row.image),
    sparkline7d: sparkline,
    cmc_rank: isFiniteNumber(row.market_cap_rank) ? row.market_cap_rank : 0,
    circulating_supply: isFiniteNumber(row.circulating_supply)
      ? row.circulating_supply
      : 0,
    max_supply: isFiniteNumber(row.max_supply) ? row.max_supply : null,
    quote: {
      USD: {
        price,
        volume_24h: isFiniteNumber(row.total_volume) ? row.total_volume : 0,
        market_cap: isFiniteNumber(row.market_cap) ? row.market_cap : 0,
        percent_change_24h: change24h,
        percent_change_7d: isFiniteNumber(row.price_change_percentage_7d_in_currency)
          ? row.price_change_percentage_7d_in_currency
          : undefined,
      },
    },
  };
}

/** Hourly unix-second timestamps ending at `endSec` (inclusive). */
function hourlyTimes(count: number, endSec: number): number[] {
  return Array.from(
    { length: count },
    (_, index) => endSec - (count - 1 - index) * HOUR_SECONDS,
  );
}

function average(values: ReadonlyArray<number>): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Equal-weighted % change series over the last `AGGREGATE_POINTS` sparkline
 * samples of each coin, rebased to the window's first sample.
 */
function aggregatePercentSeries(
  coins: ReadonlyArray<ShowcaseCoin>,
  endSec: number,
): SeriesPoint[] {
  const normalized = coins
    .map((coin) => (coin.sparkline7d ?? []).slice(-AGGREGATE_POINTS))
    .filter((series) => series.length >= 2)
    .map((series) => {
      const baseline = series[0] ?? 1;
      return series.map((price) => ((price - baseline) / baseline) * 100);
    });
  if (normalized.length === 0) return [];

  const pointCount = Math.min(...normalized.map((series) => series.length));
  const times = hourlyTimes(pointCount, endSec);
  return times.map((time, index) => ({
    time,
    value: average(normalized.map((series) => series[index] ?? 0)),
  }));
}

function buildWatchlists(
  coinsById: Map<string, ShowcaseCoin>,
  endSec: number,
  generatedAtMs: number,
): ShowcaseWatchlist[] {
  return WATCHLIST_DEFINITIONS.map((definition) => {
    const coins = definition.coinIds
      .map((id) => coinsById.get(id))
      .filter((coin): coin is ShowcaseCoin => coin !== undefined);
    const aggregatePoints = aggregatePercentSeries(coins, endSec);
    return {
      group: {
        _id: `preview-${definition.slug}`,
        name: definition.name,
        slug: definition.slug,
        icon: definition.icon,
        color: definition.color,
        isDefault: false,
        createdAt: generatedAtMs,
        updatedAt: generatedAtMs,
      },
      coins,
      aggregatePoints,
      latestChange: aggregatePoints[aggregatePoints.length - 1]?.value ?? 0,
    };
  });
}

function pickScreenerCoins(
  coins: ReadonlyArray<ShowcaseCoin>,
): ShowcaseCoin[] {
  const candidates = coins.filter((coin) => !coin.id.includes("xstock"));
  const liquid = candidates.filter(
    (coin) => coin.quote.USD.volume_24h >= SCREENER_MIN_VOLUME_USD,
  );
  const pool = liquid.length >= SCREENER_ROW_COUNT ? liquid : candidates;
  return [...pool]
    .sort(
      (a, b) => b.quote.USD.percent_change_24h - a.quote.USD.percent_change_24h,
    )
    .slice(0, SCREENER_ROW_COUNT);
}

function trailSeries(coin: ShowcaseCoin, endSec: number): SeriesPoint[] {
  const prices = coin.sparkline7d ?? [];
  if (prices.length < 2) return [];
  const times = hourlyTimes(prices.length, endSec);
  return prices.map((value, index) => ({ time: times[index] ?? endSec, value }));
}

const NEWS_TEMPLATES: ReadonlyArray<{
  headline: string;
  hoursAgo: number;
  category: NonNullable<OverviewEvent["aiCategory"]>;
}> = [
  {
    headline: "leads majors as weekly ETF inflows hit a new record.",
    hoursAgo: 2,
    category: "etf",
  },
  {
    headline: "perps funding flips positive as taker buys dominate.",
    hoursAgo: 4,
    category: "market",
  },
  {
    headline: "network activity climbs to a fresh quarterly high.",
    hoursAgo: 7,
    category: "tech",
  },
  {
    headline: "core devs ship long-awaited upgrade to mainnet.",
    hoursAgo: 11,
    category: "tech",
  },
];

function buildEvents(
  screenerCoins: ReadonlyArray<ShowcaseCoin>,
  generatedAtMs: number,
): OverviewEvent[] {
  return NEWS_TEMPLATES.flatMap((template, index) => {
    const coin = screenerCoins[index % Math.max(1, screenerCoins.length)];
    if (!coin) return [];
    const change = coin.quote.USD.percent_change_24h;
    const positive = change >= 0;
    return [
      {
        id: `preview-event-${index}`,
        articleId: null,
        kind: "news" as const,
        tone: positive ? ("positive" as const) : ("negative" as const),
        sentiment: positive ? ("bullish" as const) : ("bearish" as const),
        occurredAtMs: generatedAtMs - template.hoursAgo * HOUR_MS,
        coingeckoId: coin.id,
        name: coin.name,
        symbol: coin.symbol,
        logoUrl: coin.image || null,
        title: `${coin.name} ${template.headline}`,
        summary: null,
        aiSummary: null,
        aiCategory: template.category,
        tokenHref: `/watchlists/${coin.id}`,
        externalHref: null,
        valueUsd: null,
        percent: change,
      },
    ];
  });
}

function buildOverview(
  watchlists: ReadonlyArray<ShowcaseWatchlist>,
  allCoins: ReadonlyArray<ShowcaseCoin>,
  screenerCoins: ReadonlyArray<ShowcaseCoin>,
  endSec: number,
  generatedAtMs: number,
): ShowcaseOverview {
  const portfolioCoins = uniqueById(
    watchlists
      .filter((watchlist) => PORTFOLIO_WATCHLIST_SLUGS.has(watchlist.group.slug))
      .flatMap((watchlist) => watchlist.coins),
  );

  const toIndexSeries = (points: SeriesPoint[]) =>
    points.map((point) => ({ time: point.time, value: 100 + point.value }));
  const portfolioPoints = toIndexSeries(
    aggregatePercentSeries(portfolioCoins, endSec),
  );
  const marketPoints = toIndexSeries(aggregatePercentSeries(allCoins, endSec));

  const latestIndex = portfolioPoints[portfolioPoints.length - 1]?.value ?? 100;
  const deltaPct = latestIndex - 100;
  const valueUsd = PORTFOLIO_BASE_USD * (1 + deltaPct / 100);

  const breadthGroups: BreadthGroupRow[] = watchlists
    .flatMap((watchlist) => {
      const changes = uniqueById(watchlist.coins).map(
        (coin) => coin.quote.USD.percent_change_24h,
      );
      if (changes.length === 0) return [];
      return [
        {
          id: watchlist.group._id,
          name: watchlist.group.name,
          slug: watchlist.group.slug,
          color: watchlist.group.color ?? "default",
          changePct: average(changes),
          coinCount: changes.length,
        },
      ];
    })
    .sort((a, b) => b.changePct - a.changePct);

  return {
    valueUsd,
    rangeChange: {
      deltaUsd: valueUsd - PORTFOLIO_BASE_USD,
      deltaPct,
      isAvailable: portfolioPoints.length >= 2,
    },
    portfolioPoints,
    marketPoints,
    breadth: computeBreadthStats(
      allCoins.map((coin) => coin.quote.USD.percent_change_24h),
    ),
    breadthGroups,
    events: buildEvents(screenerCoins, generatedAtMs),
  };
}

function uniqueById(coins: ReadonlyArray<ShowcaseCoin>): ShowcaseCoin[] {
  const seen = new Set<string>();
  return coins.filter((coin) => {
    if (seen.has(coin.id)) return false;
    seen.add(coin.id);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function getLoginShowcaseData(): Promise<LoginShowcaseData> {
  const generatedAtMs = Date.now();
  const endSec =
    Math.floor(generatedAtMs / 1000 / HOUR_SECONDS) * HOUR_SECONDS;

  const coinIds = Array.from(
    new Set(WATCHLIST_DEFINITIONS.flatMap((definition) => definition.coinIds)),
  );

  const liveRows = await fetchMarketRows(coinIds);
  const liveCoins = new Map(
    (liveRows ?? [])
      .map(toShowcaseCoin)
      .filter((coin): coin is ShowcaseCoin => coin !== null)
      .map((coin) => [coin.id, coin] as const),
  );

  // Every watchlist must resolve to at least two chartable coins; otherwise
  // fall back wholesale so the preview never shows half-empty cards.
  const isLiveUsable =
    liveRows !== null &&
    WATCHLIST_DEFINITIONS.every(
      (definition) =>
        definition.coinIds.filter((id) => {
          const coin = liveCoins.get(id);
          return coin !== undefined && (coin.sparkline7d?.length ?? 0) >= 2;
        }).length >= 2,
    );

  const coinsById = isLiveUsable
    ? liveCoins
    : new Map(
        fallbackRows()
          .map(toShowcaseCoin)
          .filter((coin): coin is ShowcaseCoin => coin !== null)
          .map((coin) => [coin.id, coin] as const),
      );

  const allCoins = Array.from(coinsById.values());
  const watchlists = buildWatchlists(coinsById, endSec, generatedAtMs);
  const screenerCoins = pickScreenerCoins(allCoins);
  const screenerTrailById = Object.fromEntries(
    screenerCoins.map((coin) => [coin.id, trailSeries(coin, endSec)] as const),
  );

  return {
    generatedAtMs,
    watchlists,
    screenerCoins,
    screenerTrailById,
    overview: buildOverview(
      watchlists,
      allCoins,
      screenerCoins,
      endSec,
      generatedAtMs,
    ),
  };
}
