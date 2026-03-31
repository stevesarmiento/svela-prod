"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { Card, CardContent, CardHeader } from "@v1/ui/card";
import { Badge } from "@v1/ui/badge";
import { Button } from "@v1/ui/button";
import { cn } from "@v1/ui/cn";
import {
  IconArrowTriangleheadClockwise,
  IconArrowTurnDownRight,
  IconArrowUpRight,
  IconNewspaper,
  IconRighttriangleFill,
  IconThermometerLow,
  IconThermometerSnowflake,
  IconThermometerSun,
} from "symbols-react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { Spinner } from "@v1/ui/spinner";

interface CoinGeckoNewsArticle {
  articleId: Id<"coingeckoNewsArticles">;
  title: string;
  url: string;
  sourceName: string | null;
  postedAtIso: string | null;
  postedAtMs: number;
  sentiment: "bullish" | "bearish" | "neutral" | null;
  sentimentConfidence: number | null;
  sentimentUpdatedAt: number | null;
}

function formatPostedShort(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function sentimentLabel(s: "bullish" | "bearish" | "neutral"): string {
  if (s === "bullish") return "Bullish";
  if (s === "bearish") return "Bearish";
  return "Neutral";
}

function sentimentBadgeVariant(
  s: "bullish" | "bearish" | "neutral",
): "success" | "destructive" | "warning" {
  if (s === "bullish") return "success";
  if (s === "bearish") return "destructive";
  return "warning";
}

interface TokenCoingeckoNewsProps {
  coinId: string;
  className?: string;
  isPending?: boolean;
}

export function TokenCoingeckoNews({ coinId, className, isPending }: TokenCoingeckoNewsProps) {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const refreshNewsForCoinNow = useAction(api.coingeckoNews.refreshNewsForCoinNow);
  const requestSentimentForArticles = useMutation(api.coingeckoNews.requestSentimentForArticles);

  const articles = useQuery(
    api.coingeckoNews.listNewsByCoinId,
    coinId.length > 0 ? { coingeckoId: coinId, limit: 5 } : "skip",
  ) as CoinGeckoNewsArticle[] | undefined;

  const showSkeleton = articles === undefined;
  const showError = false;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const requestedKeyRef = useRef<string>("");
  const autoRefreshKeyRef = useRef<string>("");

  useEffect(() => {
    setRefreshError(null);
  }, [coinId]);

  const missingSentimentIds = useMemo(() => {
    if (!articles) return [];
    return articles.filter((a) => a.sentiment === null).map((a) => a.articleId);
  }, [articles]);

  useEffect(() => {
    if (!isAuthenticated || isAuthLoading) return;
    if (missingSentimentIds.length === 0) return;

    const key = missingSentimentIds.join(",");
    if (requestedKeyRef.current === key) return;
    requestedKeyRef.current = key;

    requestSentimentForArticles({ articleIds: missingSentimentIds }).catch(() => {});
  }, [isAuthenticated, isAuthLoading, missingSentimentIds, requestSentimentForArticles]);

  useEffect(() => {
    if (!isAuthenticated || isAuthLoading) return;
    if (showSkeleton) return;
    if (!articles || articles.length > 0) return;
    if (isRefreshing) return;

    const key = `${coinId}-empty`;
    if (autoRefreshKeyRef.current === key) return;
    autoRefreshKeyRef.current = key;

    setIsRefreshing(true);
    setRefreshError(null);
    refreshNewsForCoinNow({ coingeckoId: coinId })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to fetch latest news.";
        setRefreshError(message);
      })
      .finally(() => setIsRefreshing(false));
  }, [articles, coinId, isAuthenticated, isAuthLoading, isRefreshing, refreshNewsForCoinNow, showSkeleton]);

  async function onRefresh(): Promise<void> {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      await refreshNewsForCoinNow({ coingeckoId: coinId });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch latest news.";
      setRefreshError(message);
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <Card
      className={cn(
        "relative border-zinc-800/70 bg-black rounded-2xl overflow-hidden min-w-0 w-full self-start",
        (isPending || isRefreshing) && !showError && "opacity-90",
        className,
      )}
    >
      <CardHeader className="relative flex flex-row items-start justify-between gap-3 space-y-0 border-b border-white/10 bg-background p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-md font-semibold text-white text-balance ml-1">
            Feed
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={onRefresh}
          disabled={!isAuthenticated || isAuthLoading || isRefreshing}
          aria-label="Refresh latest news"
          className="shrink-0 rounded-[8px] size-6 group"
        >
          <IconArrowTriangleheadClockwise className="size-3 shrink-0 fill-primary/60 group-hover:rotate-[30deg] transition-transform duration-200" aria-hidden />
        </Button>
      </CardHeader>
      <div
        className="max-h-[min(62dvh,26.8rem)] overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]"
        role="region"
        aria-label="News articles"
      >
        <CardContent className="px-4">
          {showSkeleton ? (
            <ul className="-mx-4 divide-y divide-white/10" aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="space-y-1.5 px-4 py-3">
                  <div className="h-3.5 rounded bg-white/10 w-full" />
                  <div className="h-2.5 rounded bg-white/5 w-1/3" />
                </li>
              ))}
            </ul>
          ) : null}

          {/* Convex errors surface in console; keep UI calm for now. */}

          {!showSkeleton && !showError && (articles ?? []).length === 0 ? (
            <div
              className={cn(
                "-mx-4 flex min-h-[min(62dvh,26.8rem)] flex-col items-center justify-center gap-3 px-6 py-8 text-center",
              )}
            >
              <IconNewspaper
                className="size-10 shrink-0 fill-primary/35"
                aria-hidden
              />
              <div className="max-w-[18rem] space-y-2">
                <p className="text-xs font-medium font-berkeley-mono text-primary/20 text-pretty">
                  {isRefreshing
                    ? "Fetching latest news…"
                    : refreshError
                      ? "Couldn’t fetch the latest news."
                      : "No recent news for this coin."}
                </p>
                {refreshError ? (
                  <p className="text-xs text-rose-300/80 text-pretty break-words">{refreshError}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {!showSkeleton && !showError && (articles ?? []).length > 0 ? (
            <ul className="-mx-4 divide-y divide-white/10">
              {(articles ?? []).map((article) => {
                const dateLabel = formatPostedShort(article.postedAtIso ?? undefined);
                const sentiment = article.sentiment ?? "neutral";

                return (
                  <li key={`${article.url}-${article.postedAtIso ?? article.title}`} className="min-w-0">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "group block min-w-0 px-4 py-3 text-left transition-colors duration-200",
                        "hover:bg-white/[0.06]",
                        "focus-visible:outline-none focus-visible:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/20",
                      )}
                    >
                      <div className="flex items-start gap-1.5">
                        <span className="text-xs font-semibold text-white group-hover:text-white/95 text-pretty line-clamp-3 flex-1 min-w-0">
                          {article.title}
                        </span>
                        <IconRighttriangleFill
                          className="size-2.5 shrink-0 fill-primary/30 rotate-[-90deg] mt-0.5 opacity-0 group-hover:opacity-100"
                          aria-hidden
                        />
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 pointer-events-none">
                        {dateLabel ? (
                          <div className="flex items-center gap-1.5">
                            <IconArrowTurnDownRight className="size-3 shrink-0 fill-primary/50" aria-hidden />
                            <span className="text-xs text-primary/50">{dateLabel}</span>
                          </div>
                        ) : null}

                        {article.sentiment ? (
                          <Badge variant={sentimentBadgeVariant(sentiment)} className="gap-1">
                            {sentiment === "bullish" ? (
                              <IconThermometerSun className="size-3 shrink-0 fill-emerald-400" aria-hidden />
                            ) : sentiment === "bearish" ? (
                              <IconThermometerSnowflake className="size-3 shrink-0 fill-rose-400" aria-hidden />
                            ) : (
                              <IconThermometerLow className="size-3 shrink-0 fill-amber-400" aria-hidden />
                            )}
                            <span className={cn("text-xs", sentiment === "bullish" ? "text-emerald-400" : sentiment === "bearish" ? "text-rose-400" : "text-amber-400")}>{sentimentLabel(sentiment)}</span>
                          </Badge>
                        ) : (
                          <Badge className="border-white/10 bg-white/5 text-muted-foreground">
                            <Spinner className="size-3 shrink-0 fill-primary/50" aria-hidden />
                            Sentiment pending
                          </Badge>
                        )}

                        {article.sourceName ? (
                          <Badge className="flex items-center gap-1.5 border-white/10 bg-white/5 lowercase max-w-full truncate">
                            <IconNewspaper
                              className="size-2.5 shrink-0 fill-primary/60"
                              aria-hidden
                            />
                            <span className="text-xs text-primary/50">{article.sourceName}</span>
                          </Badge>
                        ) : null}
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </CardContent>
      </div>
    </Card>
  );
}
