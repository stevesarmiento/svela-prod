"use client";

import { TokenLogo } from "@/components/token-logo";
import { formatUsdPrice } from "@/lib/format-usd";
import { cleanTokenName, getTokenLogoURL } from "@/lib/logo-overrides";
import type { CoinMarketData } from "@/types/coins";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@v1/ui/badge";
import { cn } from "@v1/ui/cn";
import { formatLargeNumber } from "@v1/ui/format-numbers";
import { Skeleton } from "@v1/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";
import type { ReactNode } from "react";
import { IconTriangleFill } from "symbols-react";
import { ScreenerInlineTrailCell } from "./screener-inline-trail-cell";
import type { ScreenerTableMeta } from "./screener-table-types";
import { ScreenerTakerVolumeCell } from "./screener-taker-volume-cell";

/**
 * Rows still warming up (no price yet) render skeletons; null in OTHER
 * numeric fields on a priced row means "no data" and renders "—".
 */
function isLoadingQuote(usd: CoinMarketData["quote"]["USD"]): boolean {
  return usd.price == null || usd.price <= 0;
}

function deriveUsdMoveFromPercentChange(args: {
  priceUsd: number;
  percentChange: number;
}): number | null {
  const priceUsd = args.priceUsd;
  const percentChange = args.percentChange;

  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  if (!Number.isFinite(percentChange)) return null;

  const ratio = percentChange / 100;
  const denom = 1 + ratio;
  if (!Number.isFinite(denom) || denom <= 0) return null;

  const previousPrice = priceUsd / denom;
  const deltaUsd = priceUsd - previousPrice;
  return Number.isFinite(deltaUsd) ? deltaUsd : null;
}

function ColumnHeaderTooltip({
  children,
  text,
}: {
  children: ReactNode;
  text: string;
}) {
  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center">{children}</span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="p-2.5 rounded-md max-w-xs text-pretty text-[11px] font-normal normal-case tracking-normal"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

export function createScreenerColumns(): ColumnDef<CoinMarketData>[] {
  return [
    {
      id: "token",
      accessorKey: "name",
      meta: { align: "left" },
      header: ({ table }) => {
        const badge = (table.options.meta as ScreenerTableMeta | undefined)
          ?.tokenHeaderCountBadge;
        return (
          <ColumnHeaderTooltip text="Ticker and full name appear in each row. Click to sort alphabetically by asset name.">
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <span>Token</span>
              {badge ? (
                <Badge
                  variant="secondary"
                  className="h-4 shrink-0 rounded-md px-1.5 py-0 text-[10px] font-medium tabular-nums leading-none bg-primary/10 text-primary/80 border-0"
                >
                  {badge.count}
                </Badge>
              ) : null}
            </span>
          </ColumnHeaderTooltip>
        );
      },
      cell: ({ row }) => {
        const tokenName = cleanTokenName(row.original.name);
        const tokenLogoUrl = getTokenLogoURL(
          row.original.symbol,
          row.original.image,
        );
        const safeTokenLogoUrl =
          tokenLogoUrl &&
          (tokenLogoUrl.startsWith("http") || tokenLogoUrl.startsWith("/"))
            ? tokenLogoUrl
            : undefined;
        const loading = isLoadingQuote(row.original.quote.USD);

        return (
          <div className="flex items-center gap-2">
            <div className="relative">
              {!loading ? (
                <TokenLogo
                  src={safeTokenLogoUrl}
                  alt={tokenName}
                  sizePx={20}
                  fallbackText={row.original.symbol}
                  className="mr-1 ring-0 bg-primary/20 border-[1.5px] border-zinc-200 dark:border-black/60"
                  quality={70}
                />
              ) : (
                <Skeleton className="w-[20px] h-[20px] rounded-full" />
              )}
            </div>
            <div className="flex flex-row items-center gap-2">
              <div className="font-bold text-sm text-nowrap">
                {!loading ? (
                  <span className="text-zinc-950 dark:text-white">
                    {row.original.symbol.toUpperCase()}
                  </span>
                ) : (
                  <Skeleton className="h-4 w-8 rounded" />
                )}
              </div>
              <div className="translate-y-[-1px]">
                {!loading ? (
                  <span className="text-nowrap text-muted-foreground font-diatype-medium text-[11px]">
                    {tokenName}
                  </span>
                ) : (
                  <Skeleton className="h-3 w-16 rounded" />
                )}
              </div>
            </div>
          </div>
        );
      },
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "price",
      accessorFn: (row) => row.quote.USD.price ?? 0,
      header: () => (
        <ColumnHeaderTooltip text="Spot price in USD from aggregated market data. Not an executable quote.">
          Price
        </ColumnHeaderTooltip>
      ),
      cell: ({ row }) => {
        const price = row.original.quote.USD.price;
        return (
          <span className="block w-full text-right font-berkeley-mono text-[11px] tabular-nums">
            {price != null && price > 0 ? (
              formatUsdPrice(price)
            ) : (
              <Skeleton className="ms-auto inline-block h-4 w-16 rounded-full" />
            )}
          </span>
        );
      },
      enableSorting: true,
    },
    {
      id: "marketCap",
      accessorFn: (row) => row.quote.USD.market_cap ?? 0,
      header: () => (
        <ColumnHeaderTooltip text="Current USD market cap (price × circulating supply, when available).">
          Market cap
        </ColumnHeaderTooltip>
      ),
      cell: ({ row }) => {
        const usd = row.original.quote.USD;
        return (
          <span className="block w-full text-right font-berkeley-mono text-[11px] tabular-nums">
            {isLoadingQuote(usd) ? (
              <Skeleton className="ms-auto inline-block h-4 w-16 rounded-full" />
            ) : usd.market_cap != null ? (
              `$${formatLargeNumber(usd.market_cap)}`
            ) : (
              "—"
            )}
          </span>
        );
      },
      enableSorting: true,
      sortDescFirst: true,
    },
    {
      id: "volume",
      accessorFn: (row) => row.quote.USD.volume_24h ?? 0,
      header: () => (
        <ColumnHeaderTooltip text="Total notional USD traded across tracked venues in the last 24 hours.">
          24h volume
        </ColumnHeaderTooltip>
      ),
      cell: ({ row }) => {
        const usd = row.original.quote.USD;
        return (
          <span className="block w-full text-right font-berkeley-mono text-[11px] tabular-nums">
            {isLoadingQuote(usd) ? (
              <Skeleton className="ms-auto inline-block h-4 w-16 rounded-full" />
            ) : usd.volume_24h != null ? (
              `$${formatLargeNumber(usd.volume_24h)}`
            ) : (
              "—"
            )}
          </span>
        );
      },
      enableSorting: true,
      sortDescFirst: true,
    },
    {
      id: "dailyPerformance",
      accessorFn: (row) => row.quote.USD.percent_change_24h ?? 0,
      header: () => (
        <ColumnHeaderTooltip text="Rolling 24-hour performance. Shows the 24h percent change and inferred USD move.">
          Daily performance
        </ColumnHeaderTooltip>
      ),
      cell: ({ row }) => {
        const usd = row.original.quote.USD;
        if (isLoadingQuote(usd)) {
          return (
            <div className="inline-flex items-center justify-end gap-2">
              <Skeleton className="h-4 w-14 rounded-full" />
              <Skeleton className="h-4 w-12 rounded-full" />
            </div>
          );
        }

        const change24h = usd.percent_change_24h;
        if (change24h == null) {
          return (
            <span className="font-berkeley-mono text-[11px] text-muted-foreground">
              —
            </span>
          );
        }

        const isPositive = change24h > 0;
        const isNegative = change24h < 0;
        const isNeutral = !isPositive && !isNegative;
        const usdMove =
          usd.price != null
            ? deriveUsdMoveFromPercentChange({
                priceUsd: usd.price,
                percentChange: change24h,
              })
            : null;
        const usdSign = isPositive ? "+" : isNegative ? "-" : "";

        return (
          <div className="inline-flex items-center justify-end gap-2">
            <span
              className={cn(
                "font-berkeley-mono text-[11px] tabular-nums",
                isPositive && "text-emerald-400",
                isNegative && "text-rose-400",
                isNeutral && "text-muted-foreground",
              )}
            >
              {usdMove === null
                ? "—"
                : `${usdSign}${formatUsdPrice(Math.abs(usdMove))}`}
            </span>
            <Badge
              variant={
                isPositive ? "success" : isNegative ? "destructive" : "outline"
              }
              className={cn(
                isNeutral &&
                  "border-zinc-200/60 text-muted-foreground dark:border-white/10",
                "h-5 px-1.5 font-berkeley-mono text-[11px] tabular-nums gap-1",
              )}
            >
              <IconTriangleFill
                aria-hidden="true"
                className={cn(
                  "size-[4px] shrink-0 fill-current",
                  isNegative && "rotate-180",
                )}
              />
              {Math.abs(change24h).toFixed(2)}%
            </Badge>
          </div>
        );
      },
      enableSorting: true,
    },
    {
      id: "takerBuySellVolume",
      header: () => (
        <ColumnHeaderTooltip text="Taker volume on Binance spot (USDT pair): market orders hitting the book.">
          Taker buy/sell volume
        </ColumnHeaderTooltip>
      ),
      cell: ({ row }) => (
        <div className="flex min-w-0 w-full items-center justify-end">
          {!isLoadingQuote(row.original.quote.USD) ? (
            <ScreenerTakerVolumeCell baseSymbol={row.original.symbol} />
          ) : (
            <Skeleton className="h-8 w-full max-w-56 rounded-sm" />
          )}
        </div>
      ),
      enableSorting: false,
    },
    {
      id: "chart",
      header: () => (
        <ColumnHeaderTooltip text="14-day USD price trail. The first 7 days render neutral; the most recent 7 days render green or red based on performance.">
          2 week price trail
        </ColumnHeaderTooltip>
      ),
      cell: ({ row }) => (
        <div className="flex min-w-0 w-full items-center justify-end">
          {!isLoadingQuote(row.original.quote.USD) ? (
            <ScreenerInlineTrailCell
              coinId={row.original.id}
              symbol={row.original.symbol}
              sparkline7d={row.original.sparkline7d}
              initialData={row.original.quote.USD}
              percentChange24h={row.original.quote.USD.percent_change_24h ?? 0}
            />
          ) : (
            <Skeleton className="h-8 w-full max-w-56 rounded-sm" />
          )}
        </div>
      ),
      enableSorting: false,
    },
  ];
}
