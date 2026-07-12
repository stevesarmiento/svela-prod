export interface ShowcaseToken {
  id: string;
  image: string;
  name: string;
  symbol: string;
}

export interface ShowcaseWatchlist {
  change24h: number;
  down: number;
  emoji: string;
  hiddenTokenCount: number;
  name: string;
  sparkline: ReadonlyArray<number>;
  tokens: ReadonlyArray<ShowcaseToken>;
  tone: string;
  up: number;
}

export interface ShowcaseScreenerRow {
  change24h: number;
  changeUsd: string;
  id: string;
  image: string;
  marketCap: string;
  name: string;
  price: string;
  symbol: string;
  trail: ReadonlyArray<number>;
  volume24h: string;
}

interface CoinGeckoMarket {
  current_price: number | null;
  id: string;
  image: string;
  market_cap: number | null;
  name: string;
  price_change_24h: number | null;
  price_change_percentage_24h: number | null;
  sparkline_in_7d?: { price?: ReadonlyArray<number> };
  symbol: string;
  total_volume: number | null;
}

interface WatchlistDefinition {
  coinIds: ReadonlyArray<string>;
  emoji: string;
  name: string;
  tone: string;
}

// Keep this in step with apps/app/src/lib/logo-overrides.ts. The landing page
// serves the same curated artwork from its own public directory so it works as
// a standalone deployment.
const popularLogoBySymbol: Readonly<Record<string, string>> = {
  "2z": "doublezero",
  ada: "cardano",
  apt: "aptos",
  bnb: "bnb",
  bp: "backpack",
  btc: "bitcoin",
  eth: "ethereum",
  hype: "hyperliquid",
  jto: "jito",
  mon: "monad",
  okxbtc: "okxbtc",
  sol: "solana",
  sui: "sui",
  trx: "tron",
  uni: "uniswap",
  usdt: "tether",
  wbtc: "bitcoin",
  xaut: "xaut",
};

const xStockLogoBySymbol: Readonly<Record<string, string>> = {
  aaplx: "AAPLx",
  coinx: "COINx",
  crclx: "CRCLx",
  googlx: "GOOGLx",
  metax: "METAx",
  nvdax: "NVDAx",
  qqqx: "QQQx",
  spyx: "SPYx",
  tslax: "TSLAx",
};

function getShowcaseLogo(symbol: string, fallback: string): string {
  const normalized = symbol.trim().toLowerCase();
  const popularFilename = popularLogoBySymbol[normalized];
  if (popularFilename) return `/logos/popular/${popularFilename}.svg`;

  const xStockFilename = xStockLogoBySymbol[normalized];
  if (xStockFilename) return `/logos/xstocks/${xStockFilename}.png`;

  return fallback;
}

const watchlistDefinitions: ReadonlyArray<WatchlistDefinition> = [
  {
    name: "Majors",
    emoji: "💎",
    tone: "watchlist-card-crimson",
    coinIds: ["solana", "bitcoin", "ethereum"],
  },
  {
    name: "Solana Bluechip",
    emoji: "🔮",
    tone: "watchlist-card-indigo",
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
    name: "ETH DeFi",
    emoji: "🦄",
    tone: "watchlist-card-violet",
    coinIds: [
      "compound-governance-token",
      "hyperliquid",
      "lido-dao",
      "uniswap",
      "aave",
    ],
  },
  {
    name: "L1 Arena",
    emoji: "🎲",
    tone: "watchlist-card-orange",
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
    name: "BoomerFi",
    emoji: "💀",
    tone: "watchlist-card-slate",
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
    name: "Ownership",
    emoji: "🎭",
    tone: "watchlist-card-green",
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
    name: "Shhhh",
    emoji: "👁",
    tone: "watchlist-card-ink",
    coinIds: ["zcash", "monero"],
  },
  {
    name: "Murica",
    emoji: "🦅",
    tone: "watchlist-card-gold",
    coinIds: ["sp500-xstock", "nasdaq-xstock"],
  },
];

const fallbackSparklines = [
  [33, 35, 22, 25, 15, 18, 8, 11, 5],
  [29, 20, 31, 21, 12, 24, 14, 18, 10, 7, 2],
  [31, 24, 29, 20, 10, 27, 19, 11, 16, 9, 5],
  [32, 28, 15, 24, 32, 9, 14, 19, 7, 12, 5],
  [31, 29, 34, 23, 12, 27, 19, 10, 18, 11, 5],
  [32, 30, 27, 23, 18, 29, 13, 7, 22, 16, 10, 17, 5],
  [33, 29, 31, 24, 22, 20, 18, 24, 19, 15, 12],
  [34, 31, 28, 24, 29, 22, 20, 15, 11, 8, 5],
] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatUsdPrice(value: number): string {
  if (value >= 1000) {
    return `$${value.toLocaleString("en-US", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    })}`;
  }
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

function formatLargeUsd(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${Math.round(value / 1e3)}K`;
}

function formatSignedUsd(value: number): string {
  const sign = value < 0 ? "-" : "+";
  return `${sign}${formatUsdPrice(Math.abs(value))}`;
}

function average(values: ReadonlyArray<number>): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function aggregateSparkline(
  coins: ReadonlyArray<CoinGeckoMarket>,
): ReadonlyArray<number> {
  const normalizedSeries = coins
    .map((coin) => coin.sparkline_in_7d?.price?.filter(isFiniteNumber) ?? [])
    .filter((series) => series.length >= 2)
    .map((series) => {
      const lastDay = series.slice(-25);
      const baseline = lastDay[0] ?? 1;
      return lastDay.map((price) => ((price - baseline) / baseline) * 100);
    });

  if (normalizedSeries.length === 0) return [];

  const pointCount = Math.min(
    ...normalizedSeries.map((series) => series.length),
  );
  return Array.from({ length: pointCount }, (_, index) =>
    average(normalizedSeries.map((series) => series[index] ?? 0)),
  );
}

function buildFallbackWatchlists(): ReadonlyArray<ShowcaseWatchlist> {
  return watchlistDefinitions.map((watchlist, index) => ({
    ...watchlist,
    change24h: [1.04, 0.64, 1.03, 0.61, 1.18, 0.3, 1.47, 1.26][index] ?? 0,
    down: [0, 3, 0, 1, 0, 3, 1, 0][index] ?? 0,
    hiddenTokenCount: Math.max(0, watchlist.coinIds.length - 4),
    sparkline: fallbackSparklines[index] ?? [],
    tokens: watchlist.coinIds.slice(0, 4).map((id) => ({
      id,
      image: "",
      name: id,
      symbol: id.slice(0, 1).toUpperCase(),
    })),
    up: [3, 6, 5, 8, 7, 4, 1, 2][index] ?? 0,
  }));
}

async function fetchShowcaseMarkets(): Promise<ReadonlyArray<CoinGeckoMarket> | null> {
  const coinIds = Array.from(
    new Set(watchlistDefinitions.flatMap((watchlist) => watchlist.coinIds)),
  );
  const searchParams = new URLSearchParams({
    ids: coinIds.join(","),
    price_change_percentage: "24h",
    sparkline: "true",
    vs_currency: "usd",
  });

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?${searchParams.toString()}`,
      { next: { revalidate: 300 } },
    );
    if (!response.ok) throw new Error(`CoinGecko returned ${response.status}`);
    return (await response.json()) as ReadonlyArray<CoinGeckoMarket>;
  } catch {
    return null;
  }
}

export async function getShowcaseWatchlists(): Promise<
  ReadonlyArray<ShowcaseWatchlist>
> {
  const markets = await fetchShowcaseMarkets();
  if (!markets) return buildFallbackWatchlists();

  const marketsById = new Map(markets.map((market) => [market.id, market]));

  return watchlistDefinitions.map((watchlist, index) => {
    const coins = watchlist.coinIds
      .map((coinId) => marketsById.get(coinId))
      .filter((coin): coin is CoinGeckoMarket => coin !== undefined);
    const changes = coins
      .map((coin) => coin.price_change_percentage_24h)
      .filter(isFiniteNumber);
    const sparkline = aggregateSparkline(coins);

    if (coins.length === 0 || changes.length === 0 || sparkline.length < 2) {
      return buildFallbackWatchlists()[index] as ShowcaseWatchlist;
    }

    return {
      change24h: average(changes),
      down: changes.filter((change) => change < 0).length,
      emoji: watchlist.emoji,
      hiddenTokenCount: Math.max(0, coins.length - 4),
      name: watchlist.name,
      sparkline,
      tokens: coins.slice(0, 4).map((coin) => ({
        id: coin.id,
        image: getShowcaseLogo(coin.symbol, coin.image),
        name: coin.name,
        symbol: coin.symbol.toUpperCase(),
      })),
      tone: watchlist.tone,
      up: changes.filter((change) => change >= 0).length,
    };
  });
}

const fallbackScreenerRows: ReadonlyArray<ShowcaseScreenerRow> = [
  {
    change24h: 6.08,
    changeUsd: "+$9.87",
    id: "solana",
    image: "/logos/popular/solana.svg",
    marketCap: "$93.4B",
    name: "Solana",
    price: "$172.35",
    symbol: "SOL",
    trail: [4, 6, 5, 8, 10, 9, 13, 12, 16, 15, 19, 22, 21, 26],
    volume24h: "$5.2B",
  },
  {
    change24h: 5.31,
    changeUsd: "+$2.22",
    id: "hyperliquid",
    image: "/logos/popular/hyperliquid.svg",
    marketCap: "$14.7B",
    name: "Hyperliquid",
    price: "$44.12",
    symbol: "HYPE",
    trail: [8, 7, 10, 9, 12, 11, 14, 16, 15, 18, 17, 21, 23, 25],
    volume24h: "$612.4M",
  },
  {
    change24h: 4.12,
    changeUsd: "+$0.1353",
    id: "sui",
    image: "/logos/popular/sui.svg",
    marketCap: "$11.9B",
    name: "Sui",
    price: "$3.42",
    symbol: "SUI",
    trail: [10, 12, 9, 13, 11, 15, 14, 13, 17, 16, 19, 18, 22, 24],
    volume24h: "$908.1M",
  },
  {
    change24h: 3.66,
    changeUsd: "+$0.1002",
    id: "jito-governance-token",
    image: "/logos/popular/jito.svg",
    marketCap: "$983.2M",
    name: "Jito",
    price: "$2.84",
    symbol: "JTO",
    trail: [9, 8, 11, 10, 13, 12, 11, 14, 16, 15, 18, 17, 20, 22],
    volume24h: "$187.5M",
  },
  {
    change24h: 3.24,
    changeUsd: "+$3,710.44",
    id: "bitcoin",
    image: "/logos/popular/bitcoin.svg",
    marketCap: "$2.4T",
    name: "Bitcoin",
    price: "$118,204.10",
    symbol: "BTC",
    trail: [12, 11, 13, 12, 14, 16, 15, 17, 16, 19, 18, 21, 20, 23],
    volume24h: "$38.1B",
  },
  {
    change24h: 2.93,
    changeUsd: "+$0.2602",
    id: "uniswap",
    image: "/logos/popular/uniswap.svg",
    marketCap: "$6.9B",
    name: "Uniswap",
    price: "$9.14",
    symbol: "UNI",
    trail: [11, 13, 12, 10, 14, 13, 16, 15, 14, 17, 16, 19, 21, 20],
    volume24h: "$412.8M",
  },
  {
    change24h: 2.71,
    changeUsd: "+$95.66",
    id: "ethereum",
    image: "/logos/popular/ethereum.svg",
    marketCap: "$437.2B",
    name: "Ethereum",
    price: "$3,624.55",
    symbol: "ETH",
    trail: [13, 12, 14, 13, 15, 14, 17, 16, 15, 18, 17, 20, 19, 22],
    volume24h: "$21.4B",
  },
  {
    change24h: -1.18,
    changeUsd: "-$0.0958",
    id: "aptos",
    image: "/logos/popular/aptos.svg",
    marketCap: "$4.6B",
    name: "Aptos",
    price: "$8.02",
    symbol: "APT",
    trail: [18, 19, 17, 20, 18, 16, 17, 15, 16, 14, 15, 13, 14, 12],
    volume24h: "$301.2M",
  },
];

function toTrail(coin: CoinGeckoMarket): ReadonlyArray<number> {
  const prices = coin.sparkline_in_7d?.price?.filter(isFiniteNumber) ?? [];
  if (prices.length < 14) return [];

  const pointCount = 16;
  return Array.from({ length: pointCount }, (_, index) => {
    const position = Math.round(
      (index / (pointCount - 1)) * (prices.length - 1),
    );
    return prices[position] ?? 0;
  });
}

function toScreenerRow(coin: CoinGeckoMarket): ShowcaseScreenerRow | null {
  const price = coin.current_price;
  const change24h = coin.price_change_percentage_24h;
  if (!isFiniteNumber(price) || !isFiniteNumber(change24h)) return null;

  const trail = toTrail(coin);
  if (trail.length < 2) return null;

  return {
    change24h,
    changeUsd: formatSignedUsd(
      coin.price_change_24h ?? (price * change24h) / 100,
    ),
    id: coin.id,
    image: getShowcaseLogo(coin.symbol, coin.image),
    marketCap: isFiniteNumber(coin.market_cap)
      ? formatLargeUsd(coin.market_cap)
      : "—",
    name: coin.name,
    price: formatUsdPrice(price),
    symbol: coin.symbol.toUpperCase(),
    trail,
    volume24h: isFiniteNumber(coin.total_volume)
      ? formatLargeUsd(coin.total_volume)
      : "—",
  };
}

const screenerRowCount = 7;

export async function getShowcaseScreenerRows(): Promise<
  ReadonlyArray<ShowcaseScreenerRow>
> {
  const markets = await fetchShowcaseMarkets();
  if (!markets) return fallbackScreenerRows.slice(0, screenerRowCount);

  const rows = markets
    .filter((coin) => !coin.id.includes("xstock"))
    .map(toScreenerRow)
    .filter((row): row is ShowcaseScreenerRow => row !== null);

  const liquid = rows.filter((row) => !row.volume24h.endsWith("K"));
  const pool = liquid.length >= screenerRowCount ? liquid : rows;
  const sorted = [...pool]
    .sort((a, b) => b.change24h - a.change24h)
    .slice(0, screenerRowCount);

  return sorted.length >= 4
    ? sorted
    : fallbackScreenerRows.slice(0, screenerRowCount);
}
