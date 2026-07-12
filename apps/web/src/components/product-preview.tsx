"use client";

import type {
  ShowcaseScreenerRow,
  ShowcaseWatchlist,
} from "@/lib/showcase-watchlists";
import { SvelaLogo } from "@v1/ui/svela-logo";
import { useEffect, useRef, useState } from "react";

type PreviewView = "watchlists" | "screener" | "overview";

const VIEW_CYCLE: ReadonlyArray<PreviewView> = [
  "watchlists",
  "screener",
  "overview",
];

const VIEW_ROTATION_MS = 7000;

const viewGreetings: Record<PreviewView, string> = {
  overview: "Good afternoon, Steven",
  screener: "Market Screener",
  watchlists: "Good afternoon, Steven",
};

const allocationPercents = [42, 26, 19, 13] as const;

const allocationTokenSegments = [
  { color: "oklch(0.8097 0.1061 11.64)", width: 38 },
  { color: "oklch(0.7853 0.1041 274.71)", width: 27 },
  { color: "oklch(0.9243 0.1151 95.75)", width: 20 },
  { color: "oklch(0.8452 0.1299 164.98)", width: 15 },
] as const;

function buildSmoothPath(
  points: ReadonlyArray<number>,
  width: number,
  height: number,
  pad = 2,
  bounds?: { max: number; min: number },
): string {
  if (points.length < 2)
    return `M${pad} ${height / 2} L${width - pad} ${height / 2}`;

  const min = bounds?.min ?? Math.min(...points);
  const max = bounds?.max ?? Math.max(...points);
  const range = Math.max(max - min, 0.0001);

  const coordinates = points.map((point, index) => {
    const x = pad + (index / (points.length - 1)) * (width - pad * 2);
    const y = height - pad - ((point - min) / range) * (height - pad * 2);
    return { x, y };
  });

  const first = coordinates[0];
  if (!first) return `M${pad} ${height / 2} L${width - pad} ${height / 2}`;

  const segments = coordinates.slice(0, -1).map((point, index) => {
    const previous = coordinates[index - 1] ?? point;
    const next = coordinates[index + 1] ?? point;
    const afterNext = coordinates[index + 2] ?? next;
    const controlOneX = point.x + (next.x - previous.x) / 6;
    const controlOneY = point.y + (next.y - previous.y) / 6;
    const controlTwoX = next.x - (afterNext.x - point.x) / 6;
    const controlTwoY = next.y - (afterNext.y - point.y) / 6;

    return `C${controlOneX.toFixed(2)} ${controlOneY.toFixed(2)} ${controlTwoX.toFixed(2)} ${controlTwoY.toFixed(2)} ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
  });

  return `M${first.x.toFixed(2)} ${first.y.toFixed(2)} ${segments.join(" ")}`;
}

function getPathEnd(path: string): { x: number; y: number } {
  const parts = path.split(" ").slice(-2);
  return {
    x: Number(parts[0]?.replace(/^[MLC]/, "") ?? 0),
    y: Number(parts[1] ?? 0),
  };
}

function Sparkline({ points }: { points: ReadonlyArray<number> }) {
  const path = buildSmoothPath(points, 134, 40, 2);
  const end = getPathEnd(path);

  return (
    <svg
      aria-hidden="true"
      className="market-sparkline"
      viewBox="0 0 134 40"
      preserveAspectRatio="none"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx={end.x} cy={end.y} r="2.5" fill="currentColor" />
    </svg>
  );
}

function TrailSparkline({
  points,
  positive,
}: {
  points: ReadonlyArray<number>;
  positive: boolean;
}) {
  const path = buildSmoothPath(points, 84, 26, 2);

  return (
    <svg
      aria-hidden="true"
      className={`screener-trail ${positive ? "screener-trail-up" : "screener-trail-down"}`}
      viewBox="0 0 84 26"
      preserveAspectRatio="none"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChangeBadge({ change }: { change: number }) {
  const positive = change >= 0;
  return (
    <span
      className={`change-badge ${positive ? "change-badge-up" : "change-badge-down"}`}
    >
      <i className={positive ? "" : "change-badge-arrow-down"}>▲</i>
      {Math.abs(change).toFixed(2)}%
    </span>
  );
}

function TokenMark({
  image,
  name,
  symbol,
}: {
  image: string;
  name: string;
  symbol: string;
}) {
  return (
    <span className="token-mark" title={name}>
      {image ? (
        <img src={image} alt="" width="20" height="20" />
      ) : (
        symbol.slice(0, 1)
      )}
    </span>
  );
}

function WatchlistsPane({
  watchlists,
}: {
  watchlists: ReadonlyArray<ShowcaseWatchlist>;
}) {
  return (
    <>
      <div className="watchlist-toolbar">
        <div className="watchlist-title">
          <span className="breadcrumb-bookmark" aria-hidden="true" />
          Watchlists
        </div>
        <div className="watchlist-actions" aria-hidden="true">
          <span className="icon-binoculars">
            <i />
            <i />
          </span>
          <span>•••</span>
          <span>↻</span>
        </div>
      </div>

      <div className="filled-watchlist-grid">
        {watchlists.map((card, index) => (
          <article
            className={`filled-watchlist-card ${card.tone} ${index === 0 ? "filled-watchlist-card-selected" : ""}`}
            key={card.name}
          >
            <div className="dot-texture" />
            <div className="filled-watchlist-card-content">
              <div className="filled-watchlist-card-head">
                <span className="filled-watchlist-card-icon">{card.emoji}</span>
                <div>
                  <strong>{card.name}</strong>
                  <small>
                    <span>▲</span> {card.up} up <i>▼</i> {card.down} down
                  </small>
                </div>
              </div>
              <Sparkline points={card.sparkline} />
              <div className="filled-watchlist-card-footer">
                <div className="token-stack">
                  {card.tokens.map((token, tokenIndex) => (
                    <span
                      key={`${card.name}-${token.id}`}
                      style={{ zIndex: card.tokens.length - tokenIndex }}
                      title={token.name}
                    >
                      {token.image ? (
                        <img src={token.image} alt="" width="24" height="24" />
                      ) : (
                        token.symbol
                      )}
                    </span>
                  ))}
                  {card.hiddenTokenCount > 0 ? (
                    <span className="token-overflow">
                      +{card.hiddenTokenCount}
                    </span>
                  ) : null}
                </div>
                <b>
                  {card.change24h >= 0 ? "+" : ""}
                  {card.change24h.toFixed(2)}%
                </b>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function ScreenerPane({
  rows,
}: {
  rows: ReadonlyArray<ShowcaseScreenerRow>;
}) {
  return (
    <>
      <div className="screener-app-toolbar">
        <div className="screener-app-filters">
          <span className="smart-screener-button">
            <i>✦</i> Smart Screener
            <b />
          </span>
          <span className="screener-chip">
            Screener <i /> top gainers, liquid
          </span>
          <span className="screener-chip">
            Volume <i /> &gt; $100M
          </span>
          <span className="screener-esc-hint">press [esc] to clear</span>
        </div>
        <div className="screener-app-refresh" aria-hidden="true">
          <small>
            Refreshes in: <b>42:06</b>
          </small>
          <span>↻</span>
        </div>
      </div>

      <div className="screener-app-table">
        <div className="screener-thead">
          <span className="screener-cell-token">
            Token <b>{rows.length}</b>
          </span>
          <span>Price</span>
          <span>Market cap</span>
          <span>24h volume</span>
          <span>Daily performance ↓</span>
          <span>2 week price trail</span>
        </div>
        {rows.map((row) => (
          <div className="screener-app-row" key={row.id}>
            <span className="screener-cell-token">
              <TokenMark
                image={row.image}
                name={row.name}
                symbol={row.symbol}
              />
              <b>{row.symbol}</b>
              <small>{row.name}</small>
            </span>
            <span className="screener-mono">{row.price}</span>
            <span className="screener-mono">{row.marketCap}</span>
            <span className="screener-mono">{row.volume24h}</span>
            <span className="screener-performance">
              <small
                className={
                  row.change24h >= 0 ? "screener-usd-up" : "screener-usd-down"
                }
              >
                {row.changeUsd}
              </small>
              <ChangeBadge change={row.change24h} />
            </span>
            <span className="screener-trail-cell">
              <TrailSparkline
                points={row.trail}
                positive={row.change24h >= 0}
              />
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function OverviewPane({
  screenerRows,
  watchlists,
}: {
  screenerRows: ReadonlyArray<ShowcaseScreenerRow>;
  watchlists: ReadonlyArray<ShowcaseWatchlist>;
}) {
  const holdingGroups = watchlists
    .slice(0, allocationPercents.length)
    .map((watchlist, index) => ({
      allocClass: watchlist.tone.replace("watchlist-card-", "alloc-"),
      name: watchlist.name,
      percent: allocationPercents[index] ?? 10,
      tokens: watchlist.tokens,
    }));

  const portfolioTrend = [
    100, 100.8, 100.2, 101.4, 101.1, 102.3, 101.9, 103.2, 102.7, 103.9, 104.6,
    104.1, 105.4, 106.2,
  ];
  const benchmarkTrend = [
    100, 100.4, 100.1, 100.9, 100.6, 101.2, 100.9, 101.6, 101.3, 101.9, 102.2,
    101.8, 102.5, 102.9,
  ];
  const chartBounds = { max: 106.2, min: 100 };
  const portfolioPath = buildSmoothPath(
    portfolioTrend,
    300,
    150,
    4,
    chartBounds,
  );
  const benchmarkPath = buildSmoothPath(
    benchmarkTrend,
    300,
    150,
    4,
    chartBounds,
  );

  const feedTemplates = [
    {
      headline: "leads majors as weekly ETF inflows hit a new record.",
      time: "2h ago",
    },
    {
      headline: "perps funding flips positive as taker buys dominate.",
      time: "4h ago",
    },
    {
      headline: "network activity climbs to a fresh quarterly high.",
      time: "7h ago",
    },
    {
      headline: "core devs ship long-awaited upgrade to mainnet.",
      time: "11h ago",
    },
  ];
  const feedEvents = feedTemplates
    .map((template, index) => {
      const row = screenerRows[index % Math.max(1, screenerRows.length)];
      if (!row) return null;
      return { ...template, row };
    })
    .filter((event): event is NonNullable<typeof event> => event !== null);

  return (
    <div className="overview-grid">
      <div className="overview-holdings-card">
        <div className="overview-value-block">
          <strong className="overview-total">$128,540.22</strong>
          <div className="overview-pnl">
            <span className="overview-pnl-usd">+$2,341.10</span>
            <ChangeBadge change={1.86} />
          </div>
        </div>

        <div className="overview-timescale-row" aria-hidden="true">
          <div className="overview-timescale">
            <span className="overview-timescale-active">1D</span>
            <span>1W</span>
            <span>1M</span>
            <span>1Y</span>
            <span>2Y</span>
          </div>
        </div>

        <div className="overview-chart" aria-hidden="true">
          <div className="overview-chart-texture" />
          <svg viewBox="0 0 300 150" preserveAspectRatio="none">
            <path className="overview-chart-market" d={benchmarkPath} />
            <path className="overview-chart-line" d={portfolioPath} />
          </svg>
          <span className="chart-series-label chart-series-portfolio">
            Portfolio +6.20%
          </span>
          <span className="chart-series-label chart-series-market">
            Market +2.90%
          </span>
          <div className="overview-chart-times">
            <span>Jul 4</span>
            <span>Jul 6</span>
            <span>Jul 8</span>
            <span>Jul 10</span>
          </div>
        </div>

        <div className="overview-divider" />

        <span className="overview-section-label">Holdings Breakdown</span>
        <div className="overview-allocation-bar" aria-hidden="true">
          {holdingGroups.map((group) => (
            <span
              className={group.allocClass}
              key={group.name}
              style={{ width: `${group.percent}%` }}
            />
          ))}
        </div>

        <div className="overview-divider" />

        <div className="overview-allocation-rows">
          {holdingGroups.map((group, groupIndex) => (
            <div className="overview-allocation-row" key={group.name}>
              <div className="overview-allocation-info">
                <span className="overview-allocation-name">{group.name}</span>
                <span className="overview-token-bar" aria-hidden="true">
                  {allocationTokenSegments
                    .map(
                      (_, segmentIndex) =>
                        allocationTokenSegments[
                          (segmentIndex + groupIndex) %
                            allocationTokenSegments.length
                        ] as (typeof allocationTokenSegments)[number],
                    )
                    .slice(0, Math.max(2, group.tokens.length))
                    .map((segment) => (
                      <i
                        key={`${group.name}-${segment.color}`}
                        style={{
                          background: segment.color,
                          width: `${segment.width}%`,
                        }}
                      />
                    ))}
                </span>
                <b>{group.percent}%</b>
              </div>
              <span className="overview-allocation-tokens">
                {group.tokens.slice(0, 4).map((token) => (
                  <TokenMark
                    image={token.image}
                    key={`${group.name}-${token.id}`}
                    name={token.name}
                    symbol={token.symbol}
                  />
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="overview-feed">
        <div className="overview-feed-tabs" aria-hidden="true">
          <span className="overview-feed-tab-active">Feed</span>
          <span>Brief</span>
        </div>
        <div className="overview-feed-day">Today</div>
        <div className="overview-feed-list">
          {feedEvents.map((event) => (
            <article className="event-card" key={event.headline}>
              <div className="event-card-top">
                <span className="event-token-chip">
                  <TokenMark
                    image={event.row.image}
                    name={event.row.name}
                    symbol={event.row.symbol}
                  />
                  <b>{event.row.symbol}</b>
                </span>
                <ChangeBadge change={event.row.change24h} />
                <span
                  className={`change-badge ${event.row.change24h >= 0 ? "change-badge-up" : "change-badge-down"}`}
                >
                  {event.row.change24h >= 0 ? "Bullish" : "Bearish"}
                </span>
                <span className="event-time">↳ {event.time}</span>
              </div>
              <p>
                {event.row.name} {event.headline}
              </p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProductPreview({
  initialView = "watchlists",
  screenerRows,
  watchlists,
}: {
  initialView?: PreviewView;
  screenerRows: ReadonlyArray<ShowcaseScreenerRow>;
  watchlists: ReadonlyArray<ShowcaseWatchlist>;
}) {
  const [view, setView] = useState<PreviewView>(initialView);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      if (pausedRef.current) return;
      setView((current) => {
        const nextIndex = (VIEW_CYCLE.indexOf(current) + 1) % VIEW_CYCLE.length;
        return VIEW_CYCLE[nextIndex] ?? "watchlists";
      });
    }, VIEW_ROTATION_MS);

    return () => window.clearInterval(timer);
  }, []);

  const dockItems: ReadonlyArray<{
    iconClass: string;
    label: string;
    view: PreviewView;
  }> = [
    {
      iconClass: "dock-home",
      label: "Show the portfolio view",
      view: "overview",
    },
    {
      iconClass: "dock-bookmark",
      label: "Show the watchlists view",
      view: "watchlists",
    },
    {
      iconClass: "dock-compass",
      label: "Show the screener view",
      view: "screener",
    },
  ];

  return (
    <div
      className="preview-wrap"
      aria-label="A preview of the aggr.watch interface cycling through the portfolio, watchlists, and screener views"
      onMouseEnter={() => {
        pausedRef.current = true;
      }}
      onMouseLeave={() => {
        pausedRef.current = false;
      }}
    >
      <div className="preview-glow" />
      <div className="app-window filled-watchlist-app">
        <div className="app-window-chrome" aria-hidden="true">
          <div className="window-traffic-lights">
            <span className="window-control-close" />
            <span className="window-control-minimize" />
            <span className="window-control-expand" />
          </div>
        </div>

        <div className="watchlist-app-surface">
          <div className="watchlist-app-header">
            <div className="watchlist-greeting">
              <SvelaLogo
                width={20}
                height={20}
                adaptive={false}
                fillColor="oklch(1 0 0 / 0.45)"
              />
              <strong className="greeting-swap" key={viewGreetings[view]}>
                {viewGreetings[view]}
              </strong>
            </div>
            <span className="watchlist-avatar">S</span>
          </div>

          <div className="watchlist-app-content">
            <div className="app-views">
              <div
                aria-hidden={view !== "watchlists"}
                className={`app-view ${view === "watchlists" ? "app-view-active" : ""}`}
              >
                <WatchlistsPane watchlists={watchlists} />
              </div>
              <div
                aria-hidden={view !== "screener"}
                className={`app-view ${view === "screener" ? "app-view-active" : ""}`}
              >
                <ScreenerPane rows={screenerRows} />
              </div>
              <div
                aria-hidden={view !== "overview"}
                className={`app-view ${view === "overview" ? "app-view-active" : ""}`}
              >
                <OverviewPane
                  screenerRows={screenerRows}
                  watchlists={watchlists}
                />
              </div>
            </div>

            <div className="watchlist-dock">
              {dockItems.map((item) => (
                <button
                  aria-label={item.label}
                  aria-pressed={view === item.view}
                  className={view === item.view ? "dock-active" : ""}
                  key={item.view}
                  onClick={() => setView(item.view)}
                  type="button"
                >
                  <i className={item.iconClass} />
                </button>
              ))}
              <span className="dock-search-button" aria-hidden="true">
                <i className="dock-search" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
