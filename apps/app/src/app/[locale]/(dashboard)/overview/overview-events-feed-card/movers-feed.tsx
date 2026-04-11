"use client";

import { TokenLogo } from "@/components/token-logo";
import { formatUsdPrice } from "@/lib/format-usd";
import { getTokenLogoURL } from "@/lib/logo-overrides";
import { Badge } from "@v1/ui/badge";
import { cn } from "@v1/ui/cn";
import { Tabs, TabsList, TabsTrigger } from "@v1/ui/tabs";
import Link from "next/link";
import { useMemo } from "react";
import { IconTriangleFill } from "symbols-react";
import { clampPercentChange } from "./feed-helpers";
import type { ActivityMoversProps } from "./types";

function ChangeBadge(props: { pct: number }) {
  const pct = clampPercentChange(props.pct);
  const isPositive = pct > 0;
  const isNegative = pct < 0;
  const isNeutral = !isPositive && !isNegative;

  return (
    <Badge
      variant={isPositive ? "success" : isNegative ? "destructive" : "outline"}
      className={cn(
        "h-5 px-1.5 font-berkeley-mono text-[11px] tabular-nums gap-1",
        isNeutral &&
          "border-zinc-200/60 text-muted-foreground dark:border-white/10",
      )}
    >
      <IconTriangleFill
        aria-hidden="true"
        className={cn(
          "size-[4px] shrink-0 fill-current",
          isNegative && "rotate-180",
        )}
      />
      {Math.abs(pct).toFixed(2)}%
    </Badge>
  );
}

function MoversList(props: {
  title: string;
  rows: Array<{
    coingeckoId: string;
    name: string;
    symbol: string;
    logoUrl: string | null;
    changePct: number;
    impactUsd: number | null;
  }>;
}) {
  return (
    <div className="space-y-2 min-w-0">
      <div className="text-xs font-medium text-zinc-600 dark:text-white/60">
        {props.title}
      </div>
      {props.rows.length === 0 ? (
        <div className="text-xs text-muted-foreground text-pretty">
          No data yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {props.rows.map((row) => {
            const logo = getTokenLogoURL(row.symbol, row.logoUrl ?? undefined);
            return (
              <li key={row.coingeckoId} className="min-w-0">
                <Link
                  href={`/charts/${row.coingeckoId}`}
                  className={cn(
                    "flex items-center justify-between gap-3 min-w-0 active:scale-[0.98]",
                    "-mx-2 rounded-xl p-2",
                    "transition-colors duration-150",
                    "hover:bg-zinc-950/5 dark:hover:bg-white/5",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  )}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <TokenLogo
                      src={logo}
                      alt={row.name}
                      sizePx={22}
                      fallbackText={row.symbol}
                      unoptimizedRemote
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-950 dark:text-white truncate">
                        {row.symbol.toUpperCase()}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {row.name}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <ChangeBadge pct={row.changePct} />
                    {row.impactUsd !== null ? (
                      <div
                        className={cn(
                          "text-[11px] font-berkeley-mono tabular-nums",
                          row.impactUsd > 0 && "text-emerald-400",
                          row.impactUsd < 0 && "text-rose-400",
                          row.impactUsd === 0 && "text-muted-foreground",
                        )}
                      >
                        {row.impactUsd > 0 ? "+" : row.impactUsd < 0 ? "-" : ""}
                        {formatUsdPrice(Math.abs(row.impactUsd))}
                      </div>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function MoversFeedPost(props: { movers: ActivityMoversProps }) {
  const { movers } = props;

  const data = movers.window === "7d" ? movers.movers7d : movers.movers24h;
  const gainers = useMemo(() => data?.gainers ?? [], [data?.gainers]);
  const losers = useMemo(() => data?.losers ?? [], [data?.losers]);
  const hasAny = gainers.length > 0 || losers.length > 0;

  return (
    <div className="group/post rounded-2xl bg-zinc-100/80 dark:bg-white/[0.04] transition-colors duration-150 hover:bg-zinc-200/70 dark:hover:bg-white/[0.07]">
      <div className="px-4 py-2">
        {!hasAny ? (
          <div className="text-xs text-muted-foreground text-pretty">
            {data.coinCount > 0
              ? "No movers available for this selection yet."
              : "No movers available yet."}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MoversList title="Top gainers" rows={gainers} />
            <MoversList title="Top losers" rows={losers} />
          </div>
        )}
      </div>
    </div>
  );
}

export function MoversFeedHeader(props: { movers: ActivityMoversProps }) {
  const { movers } = props;

  return (
    <div className="sticky top-4 z-30 py-2 ">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xl font-bold text-zinc-950 dark:text-white text-balance">
          <span className="z-[1] font-bold">Top movers</span>
          <div className="z-[-1] absolute top-[-20px] h-[100px] inset-0 pointer-events-none bg-gradient-to-b from-white via-white/50 dark:via-background/90 to-transparent dark:from-background" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={movers.window}
            onValueChange={(value) =>
              movers.onWindowChange(value as "24h" | "7d")
            }
          >
            <TabsList className="p-0.5">
              <TabsTrigger value="24h" className="px-2 py-1 text-[12px]">
                24h
              </TabsTrigger>
              <TabsTrigger value="7d" className="px-2 py-1 text-[12px]">
                7d
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
